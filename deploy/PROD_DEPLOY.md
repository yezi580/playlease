# 生产部署说明

- 把项目按照deploy\PROD_DEPLOY.md文件部署至服务器，避免上传大依赖包

## 服务器信息

- 公网 IP: `49.235.59.19`
- 内网 IP: `172.17.16.15`
- 主站域名: `xysh88.com`
- 管理后台: `admin.xysh88.com`
- SSH 密钥: `D:\pic\only_key.pem`

## 当前生产配置

- 生产环境变量: `deploy/env/prod.env`
- 生产编排文件: `deploy/compose/docker-compose.prod.yml`
- 生产 MySQL 配置: `deploy/mysql/my.cnf`
- 生产 Nginx 配置: `deploy/nginx/nginx.prod.conf`
- 根目录 `docker-compose.yml` 与 `nginx/nginx.prod.conf` 已同步为 `xysh88.com`
- 服务器项目目录: `/opt/my-app`

## 自建 MySQL / Redis

生产环境默认通过 Docker Compose 在服务器内自建并持久化:

- MySQL 容器名: `mysql`
- Redis 容器名: `redis`
- 数据卷: `mysql_data_prod`、`redis_data_prod`
- API 通过容器内网连接:
  - `DB_HOST=mysql`
  - `REDIS_URL=redis://redis:6379`
- MySQL 生产配置已通过 `deploy/mysql/my.cnf` 挂载到容器，默认启用:
  - 慢查询日志 `slow_query_log=ON`
  - 慢 SQL 阈值 `long_query_time=0.5`
  - 最小扫描行数 `min_examined_row_limit=100`
  - 最大连接数 `max_connections=200`
  - `performance_schema=ON`

## 上线前必须修改

编辑 `deploy/env/prod.env`，至少补齐这些变量:

- `JWT_SECRET`
- `DB_PASSWORD`
- `COS_SECRET_ID`
- `COS_SECRET_KEY`
- `TENCENT_CAPTCHA_SECRET_ID`
- `TENCENT_CAPTCHA_SECRET_KEY`
- `TENCENT_SMS_SECRET_ID`
- `TENCENT_SMS_SECRET_KEY`

如果后台只允许固定办公网络访问，可编辑:

- `deploy/nginx/admin-allowlist.prod.conf`

当前配置说明:

- 支付接口保留，但已切换为站内 `mock_payment`
- 实名认证接口已下线，`KYC_PROVIDER=disabled`
- 微信支付与腾讯云 FaceID 相关配置当前不再需要
- 文件上传默认走本地存储，`FILE_STORAGE_DRIVER=local`
- 如需改回腾讯 COS，再补齐 `COS_*` 并将 `FILE_STORAGE_DRIVER` 改为 `cos`
- 生产编排中的挂载路径全部为相对路径，项目放在 `/opt/my-app` 无需额外改代码
- 当前生产应用连接池建议值:
  - `DB_CONNECTION_LIMIT=40`
  - `DB_MAX_IDLE=20`
  - `DB_QUEUE_LIMIT=100`

## 推荐部署步骤

正式部署不要再直接 `scp -r` 整个项目目录。推荐流程是：本地构建前端后，只打包 `deploy`、`dist`、`server` 这几个生产必需目录，再上传压缩包到服务器。

1. 本地构建前端:

```powershell
npm install
npm run build
```

2. 本地生成精简部署包:

```powershell
if (Test-Path deploy\artifacts\my-app-prod-deploy.tar.gz) { Remove-Item deploy\artifacts\my-app-prod-deploy.tar.gz -Force }
tar -czf deploy\artifacts\my-app-prod-deploy.tar.gz `
  --exclude=server/node_modules `
  --exclude=server/uploads `
  --exclude=server/.env `
  --exclude=deploy/artifacts `
  --exclude=deploy/nginx/certs `
  deploy dist server
```

当前这套打包方式会避开本地大依赖和不该被覆盖的线上数据，重点不上传这些内容:

- `server/node_modules`
- `server/uploads`
- `server/.env`
- `deploy/nginx/certs`

同时会上传生产必需的新配置文件:

- `deploy/mysql/my.cnf`

3. 将精简部署包上传到服务器:

```powershell
scp -i "D:\pic\only_key.pem" deploy\artifacts\my-app-prod-deploy.tar.gz root@49.235.59.19:/opt/my-app-prod-deploy.tar.gz
```

4. 连接服务器:

```powershell
ssh -i "D:\pic\only_key.pem" root@49.235.59.19
```

5. 在服务器解压部署包，保留原有环境变量、证书和上传目录:

```bash
cp /opt/my-app/deploy/env/prod.env /tmp/my-app-prod.env.bak
cp -a /opt/my-app/deploy/nginx/certs /tmp/my-app-certs.bak
cp -a /opt/my-app/server/uploads /tmp/my-app-uploads.bak

tar -xzf /opt/my-app-prod-deploy.tar.gz -C /opt/my-app

cp /tmp/my-app-prod.env.bak /opt/my-app/deploy/env/prod.env
rm -rf /opt/my-app/deploy/nginx/certs && cp -a /tmp/my-app-certs.bak /opt/my-app/deploy/nginx/certs
rm -rf /opt/my-app/server/uploads && cp -a /tmp/my-app-uploads.bak /opt/my-app/server/uploads
```

6. 在服务器启动生产环境:

```bash
cd /opt/my-app
docker compose --env-file deploy/env/prod.env -f deploy/compose/docker-compose.prod.yml up -d --build
```

7. 查看运行状态:

```bash
docker compose --env-file deploy/env/prod.env -f deploy/compose/docker-compose.prod.yml ps
docker compose --env-file deploy/env/prod.env -f deploy/compose/docker-compose.prod.yml logs -f api
```

8. 查看 MySQL 慢查询、连接数与服务器监控:

```powershell
# 以下 .ps1 脚本在本地 Windows PowerShell 执行，会通过 SSH 连接服务器采集数据
powershell -ExecutionPolicy Bypass -File deploy\scripts\check-prod-mysql.ps1
powershell -ExecutionPolicy Bypass -File deploy\scripts\tail-prod-mysql-slowlog.ps1
powershell -ExecutionPolicy Bypass -File deploy\scripts\check-prod-host-metrics.ps1
```

如果已经 SSH 登录到 Linux 服务器，可直接执行:

```bash
bash /opt/my-app/deploy/scripts/check-prod-host-metrics.sh
# 或指定采样秒数，让 CPU / 网络速率更平滑
bash /opt/my-app/deploy/scripts/check-prod-host-metrics.sh 3
```

## 域名与证书

- `xysh88.com`、`admin.xysh88.com` 需要先解析到 `49.235.59.19`
- `deploy/nginx/nginx.prod.conf` 走 HTTPS，证书文件挂载目录为 `deploy/nginx/certs/prod`
- 如果项目放在 `/opt/my-app`，服务器证书实际放置目录为 `/opt/my-app/deploy/nginx/certs/prod`
- 当前生产已改为双证书模式：
  - 主站 `xysh88.com` / `www.xysh88.com` 使用 `fullchain.pem` 和 `privkey.pem`
  - 后台 `admin.xysh88.com` 使用 `admin.fullchain.pem` 和 `admin.privkey.pem`
- 证书目录内现在需要至少包含:
  - `fullchain.pem`
  - `privkey.pem`
  - `admin.fullchain.pem`
  - `admin.privkey.pem`

## 验证项

- 主站可访问: `https://xysh88.com`
- 后台可访问: `https://admin.xysh88.com`
- 健康检查: `https://xysh88.com/api/health`
- MySQL/Redis 仅映射到 `127.0.0.1`，不直接暴露公网
