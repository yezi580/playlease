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

## 推荐部署步骤

1. 本地构建前端:

```powershell
npm install
npm run build
```

2. 将项目上传到服务器，例如:

```powershell
scp -i "D:\pic\only_key.pem" -r D:\zuhao\my-app root@49.235.59.19:/opt/
```

3. 连接服务器:

```powershell
ssh -i "D:\pic\only_key.pem" root@49.235.59.19
```

4. 在服务器启动生产环境:

```bash
cd /opt/my-app
docker compose --env-file deploy/env/prod.env -f deploy/compose/docker-compose.prod.yml up -d --build
```

5. 查看运行状态:

```bash
docker compose --env-file deploy/env/prod.env -f deploy/compose/docker-compose.prod.yml ps
docker compose --env-file deploy/env/prod.env -f deploy/compose/docker-compose.prod.yml logs -f api
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
