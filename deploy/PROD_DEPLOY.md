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
- 生产编排文件: `deploy/compose/docker-compose.prod.yml`（蓝绿双 api：`api-blue`/`api-green`）
- 生产 MySQL 配置: `deploy/mysql/my.cnf`
- 生产 Nginx 主配置: `deploy/nginx/nginx.main.conf`（挂载为 `/etc/nginx/nginx.conf`）
- 生产 Nginx 站点配置: `deploy/nginx/nginx.prod.conf`
- 蓝绿上游切换文件: `deploy/nginx/upstream-backend.conf`（线上运行状态，勿手改）
- 蓝绿发布脚本: `deploy/scripts/blue-green-deploy.sh`
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

## 时区约定（全站北京时间）

- MySQL 与 api 容器均已设置 `TZ=Asia/Shanghai`，`my.cnf` 设置 `default-time-zone = '+08:00'`，
  `NOW()`/`CURRENT_TIMESTAMP`/Node `new Date()` 落库均为北京墙钟
- 2026-08-18 已执行一次性迁移：全库 DATETIME 列 +8 小时（历史数据原为 UTC 墙钟），
  迁移脚本 `deploy/scripts/migrate-datetime-to-beijing.sh` 仅在重演同类问题时使用，
  **勿重复执行**（会再加 8 小时）
- 注意：api 容器（alpine）内 shell `date` 显示 UTC 是缺 tzdata 的显示怪癖，
  Node 的默认时区是正确的 Asia/Shanghai，不影响业务

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

- 当前生产配置以 `deploy/env/prod.env` 为准；若启用汇付，请同步补齐支付查单、关单、退款、退款查单、余额支付、余额支付查单相关 `HUIFU_*` 变量
- 生产环境已启用支付配置启动校验（`PAYMENT_PROVIDER_STRICT_STARTUP_CHECK=true`），汇付配置缺失将阻止应用启动
- ⚠️ **汇付商户控台的「自动结算」必须保持未开启**：客服「冻结资金」功能依赖买家付款后资金停留在平台汇付账户（仅手动取现才流出）。一旦开启自动结算，资金会在 D1/T1 自动划到平台银行卡，导致冻结后给买家退押金（`htRefund`）时因汇付账户余额不足或风控而失败。当前商户为「标准结算 + 自动结算未开启」，请勿改动。详见 [`docs/freeze-funds-and-settlement.md`](../docs/freeze-funds-and-settlement.md)
- 实名认证模块已从当前业务主链路移除，无需再维护相关 `KYC_*` 配置
- 微信支付与腾讯云 FaceID 相关配置当前不再需要
- 文件上传走腾讯云 COS 存储，`FILE_STORAGE_DRIVER=cos`，需补齐 `COS_*` 配置
- 如需改回本地存储，将 `FILE_STORAGE_DRIVER` 改为 `local` 即可
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
  --exclude=deploy/nginx/admin-allowlist.prod.conf `
  --exclude=deploy/nginx/admin-allowlist.extra.list `
  --exclude=deploy/nginx/admin-allowlist.own.conf `
  deploy dist server
```

当前这套打包方式会避开本地大依赖和不该被覆盖的线上数据，重点不上传这些内容:

- `server/node_modules`
- `server/uploads`
- `server/.env`
- `deploy/nginx/certs`
- `deploy/nginx/admin-allowlist.prod.conf` / `admin-allowlist.extra.list` / `admin-allowlist.own.conf`（线上由 update-admin-allowlist.sh 生成维护；上传仓库空模板会覆盖线上白名单，导致管理后台对全网开放。全新服务器初始化时需先跑一次该脚本再启动 nginx）

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
# 先清掉上次部署残留的备份目录，避免 cp 把内容拷贝进旧目录导致嵌套
rm -rf /tmp/my-app-prod.env.bak /tmp/my-app-certs.bak /tmp/my-app-uploads.bak
cp /opt/my-app/deploy/env/prod.env /tmp/my-app-prod.env.bak
cp -a /opt/my-app/deploy/nginx/certs /tmp/my-app-certs.bak
cp -a /opt/my-app/server/uploads /tmp/my-app-uploads.bak

# ⚠️ dist / certs / uploads 目录本身都挂载进了容器（nginx / api），
# 只清空内容、保留目录 inode：rm 掉目录再重建会换 inode，
# 运行中的容器会继续看到已脱离的旧目录（主站 403 / 上传丢失），必须重建容器才能恢复
mkdir -p /opt/my-app/dist
rm -rf /opt/my-app/dist/* /opt/my-app/dist/.[!.]* 2>/dev/null || true
tar -xzf /opt/my-app-prod-deploy.tar.gz -C /opt/my-app

cp /tmp/my-app-prod.env.bak /opt/my-app/deploy/env/prod.env
mkdir -p /opt/my-app/deploy/nginx/certs
rm -rf /opt/my-app/deploy/nginx/certs/* /opt/my-app/deploy/nginx/certs/.[!.]* 2>/dev/null || true
cp -a /tmp/my-app-certs.bak/. /opt/my-app/deploy/nginx/certs/
mkdir -p /opt/my-app/server/uploads
rm -rf /opt/my-app/server/uploads/* /opt/my-app/server/uploads/.[!.]* 2>/dev/null || true
cp -a /tmp/my-app-uploads.bak/. /opt/my-app/server/uploads/

# 确认服务正常后删除临时备份，回收磁盘（uploads 备份有 8G+）
# rm -rf /tmp/my-app-certs.bak /tmp/my-app-uploads.bak
```

6. 在服务器发布（蓝绿，零停机）:

```bash
cd /opt/my-app
bash deploy/scripts/blue-green-deploy.sh deploy
```

脚本流程：构建新镜像（tag `my-app-api:current`）→ 只重建**闲置色**容器（活跃色不动）→ 等它
healthcheck 变 healthy（超时 240s 自动中止，流量不受影响）→ `cat >` 原地重写
`deploy/nginx/upstream-backend.conf` 交换 down 标记 → `nginx -t` 校验 → `nginx -s reload`
平滑切流量。旧色保持运行，既是热备也是回滚目标：

```bash
# 回滚 / 手动切换活跃色（不构建）
bash deploy/scripts/blue-green-deploy.sh switch

# 查看活跃色与双色健康状态
bash deploy/scripts/blue-green-deploy.sh status
```

蓝绿要点（踩过的坑都记在这）：

- **切流量只靠 nginx reload**（平滑，旧 worker 靠 `worker_shutdown_timeout 30s` 收尾存量连接，
  websocket 客户端会自动重连到新色），不再需要每次部署 `restart nginx`。
- **`upstream-backend.conf` 是线上运行状态**（记录当前活跃色），`remote-deploy-extract.sh`
  会备份恢复，不要手工编辑；脚本重写它必须 `cat >` 原地写保 inode。
- **两色并存时周期任务靠跨实例 Redis 锁互斥**（`JOBS_LOCK_TTL_MS`，Redis 不可用时 fail-open），
  同一轮任务全局只执行一次。
- **不要对活跃色手工 `up --force-recreate`**——那会重启正在接流量的容器，回到有停机窗口的
  旧模式。`docker compose up -d` 只在这些场景使用：首次部署、编排文件变化（mysql/redis/nginx
  配置或挂载）、全量重建。
- 宿主机 `127.0.0.1:3101/3102` 分别映射 blue/green（调试用；nginx 走容器内网不依赖它们）。
- api 保留优雅停机：SIGTERM 后 `/api/health` 置 503、停周期任务、排干在途请求再退出
  （应用内上限 15s = `SHUTDOWN_DRAIN_TIMEOUT_MS`，容器宽限 30s = `stop_grace_period`，
  前者必须小于后者）。停机窗口内到达的支付回调由渠道侧重试 + 资金对账任务自动补齐。

⚠️ 仅当 **nginx 自身配置/挂载变更**（如 `nginx.prod.conf`、`nginx.main.conf`、证书目录）时才需要
重建 nginx 容器（有秒级中断，低频操作）：

```bash
docker compose --env-file deploy/env/prod.env -f deploy/compose/docker-compose.prod.yml up -d --force-recreate nginx
```

7. 查看运行状态:

```bash
bash /opt/my-app/deploy/scripts/blue-green-deploy.sh status
# 或直接看容器/日志
docker compose --env-file deploy/env/prod.env -f deploy/compose/docker-compose.prod.yml ps
docker compose --env-file deploy/env/prod.env -f deploy/compose/docker-compose.prod.yml logs -f api-blue
```

8. 如需维护生产管理员账号，可在服务器执行:

```bash
bash /opt/my-app/deploy/scripts/reset-prod-admin.sh <旧手机号> <新手机号> <新密码>
```

说明:

- 该脚本会把指定旧手机号对应的用户改成新的管理员手机号和密码
- 会同步更新后台显示用户名为脱敏手机号，例如 `176****1608`
- 会清理该管理员已绑定的 Passkey、受信任设备，并尽量注销现有登录会话
- 运行前请先确认 `api-blue`/`api-green`、`mysql`、`redis` 容器已正常启动（脚本自动选活跃色执行）

9. 查看 MySQL 慢查询、连接数与服务器监控:

```bash
bash /opt/my-app/deploy/scripts/check-prod-mysql.sh
bash /opt/my-app/deploy/scripts/tail-prod-mysql-slowlog.sh
bash /opt/my-app/deploy/scripts/check-prod-host-metrics.sh
# 或指定采样秒数，让 CPU / 网络速率更平滑
bash /opt/my-app/deploy/scripts/tail-prod-mysql-slowlog.sh 200
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
- `docker compose ps` 中 `api-blue`/`api-green` 应显示 `(healthy)`（启动后有 60s 的 `start_period` 宽限），nginx upstream 指向的那一色为活跃色
- MySQL/Redis 仅映射到 `127.0.0.1`，不直接暴露公网
