#!/bin/bash
set -e

echo "=== 备份原有配置 ==="
cp /opt/my-app/deploy/env/prod.env /tmp/my-app-prod.env.bak
cp -a /opt/my-app/deploy/nginx/certs /tmp/my-app-certs.bak
cp -a /opt/my-app/server/uploads /tmp/my-app-uploads.bak

echo "=== 解压部署包 ==="
tar -xzf /opt/my-app-prod-deploy.tar.gz -C /opt/my-app

echo "=== 恢复原有配置 ==="
cp /tmp/my-app-prod.env.bak /opt/my-app/deploy/env/prod.env
rm -rf /opt/my-app/deploy/nginx/certs && cp -a /tmp/my-app-certs.bak /opt/my-app/deploy/nginx/certs
rm -rf /opt/my-app/server/uploads && cp -a /tmp/my-app-uploads.bak /opt/my-app/server/uploads

echo "=== 验证封禁逻辑已部署 ==="
grep -n "不能封禁管理员账号" /opt/my-app/server/routes/admin.routes.js

echo "=== 完成 ==="
