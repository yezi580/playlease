# sparks.pub 测试环境部署说明

2026-09-28 首次部署。与正式站(xysh88.com / 49.235.59.19)相互独立。

## 服务器信息

- 公网 IP: `43.136.77.251`(sparks.pub 解析于此)
- 系统: Rocky Linux 9.4,2C4G
- SSH 密钥: `D:\pic\sparks.pem`,用户 `root`
- 项目目录: `/opt/my-app`
- 部署包: `/opt/xysh-test-deploy.tar.gz`(留档)

## 架构(与正式站的差异)

- **边缘层是宿主机 nginx**(非容器):占用 80/443,certbot 续期链保留
  - 站点配置: `/etc/nginx/conf.d/xysh-test.conf`(源文件 `deploy/nginx/nginx.sparks-host.conf`)
  - 旧组队大厅配置备份在 `/etc/nginx/conf.d/df33.conf.disabled`
- **容器栈**(`deploy/compose/docker-compose.test.yml`):mysql + redis + api + ai-service,**不起 nginx 容器**(避免与宿主机抢 80/443)
- 真实密钥在服务器 `deploy/env/test.env`(DB_PASSWORD / AI_LLM_API_KEY / AI_SERVICE_TOKEN),本地仓库保持占位符
- 演示数据: `deploy/mysql/seed-demo-data.sql` 已灌入(4 卖家 + 12 商品 + 客服/管理员,幂等可重跑)

## 演示账号与登录方式

两种登录方式并存于主站登录弹窗(「验证码登录 / 密码登录」双 tab):

- **密码登录**:`DEMO_PASSWORD_LOGIN=true` 启用 `/api/auth/password/login`(演示账号统一密码 **Demo@123456**;管理员账号在该端点被拒,仅可进后台)
- **验证码登录**:统一固定 **123456**(`SMS_PROVIDER=console` + `DEV_SMS_CODE=123456`,短信只打 api 容器日志不真实下发;`CAPTCHA_PROVIDER=console` 前端不弹滑块)

以上均为演示/测试环境专用开关,生产环境不设这些变量,行为不受影响。

| 角色 | 手机号 | 密码 | 登录入口 |
|---|---|---|---|
| 普通用户/卖家 | `18500006601` / `18600006602` / `18700006603` / `18800006604` | Demo@123456 | https://sparks.pub 登录弹窗(两种方式均可) |
| 客服 | `18900006605`(客服-演示) | Demo@123456 | 主站登录后进「客服后台」 |
| 管理员 | `19900006606`(演示管理员) | —(后台仅验证码) | https://admin.sparks.pub,验证码 123456 |

- 演示时也可用**任意手机号**现场注册新账号(未注册号码会自动走注册流程,验证码同样 123456;新号无密码,只能验证码登录)
- 每个号码发码间隔 60s、每日 10 次,演示时注意节奏

## 常用运维

```bash
cd /opt/my-app

# 状态 / 日志
docker compose --env-file deploy/env/test.env -f deploy/compose/docker-compose.test.yml ps
docker compose --env-file deploy/env/test.env -f deploy/compose/docker-compose.test.yml logs -f api

# 更新发布(本地重新打 tar 上传解压到 /opt/my-app 后)
docker compose --env-file deploy/env/test.env -f deploy/compose/docker-compose.test.yml up -d --build

# 重灌演示数据
DBPASS=$(grep "^DB_PASSWORD=" deploy/env/test.env | cut -d= -f2-)
docker exec -i my-app-test-mysql-1 mysql -uroot -p"$DBPASS" --default-character-set=utf8mb4 game_rental < deploy/mysql/seed-demo-data.sql
```

## 本地打包命令

```bash
tar -czf deploy/artifacts/xysh-test-deploy.tar.gz \
  --exclude=server/node_modules --exclude=server/uploads --exclude=server/.env \
  --exclude=ai-service/.venv --exclude=ai-service/cache --exclude=ai-service/__pycache__ --exclude=ai-service/.env \
  --exclude=deploy/artifacts \
  deploy dist server ai-service
scp -i "D:/pic/sparks.pem" deploy/artifacts/xysh-test-deploy.tar.gz root@43.136.77.251:/opt/
```

## 待办

(无 —— admin.sparks.pub 的 DNS 与证书已于 2026-09-28 配好:证书 SAN 覆盖
`sparks.pub + www.sparks.pub + admin.sparks.pub`,有效期至 2026-12-27,certbot 自动续期)

## 回滚到组队大厅(df33)

```bash
mv /etc/nginx/conf.d/df33.conf.disabled /etc/nginx/conf.d/df33.conf
mv /etc/nginx/conf.d/xysh-test.conf /etc/nginx/conf.d/xysh-test.conf.disabled
nginx -t && systemctl reload nginx
systemctl start df33        # /opt/df33 应用文件一直保留未动
# 停 xysh 栈:docker compose -p my-app-test down(数据卷保留)
```
