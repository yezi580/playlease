#!/bin/bash
set -e

# ⚠️ 先清掉上次部署残留的 /tmp 备份目录，否则 cp 会把旧备份内容拷进新备份造成
# certs/certs/certs... 无限嵌套（2026-08-22 实际发生，嵌套 5 层）
echo "=== 清理上次部署残留备份 ==="
rm -rf /tmp/my-app-prod.env.bak /tmp/my-app-certs.bak /tmp/my-app-uploads.bak \
  /tmp/my-app-admin-allowlist.bak /tmp/my-app-admin-allowlist-extra.bak \
  /tmp/my-app-admin-allowlist-own.bak /tmp/my-app-upstream.bak

echo "=== 备份原有配置 ==="
cp /opt/my-app/deploy/env/prod.env /tmp/my-app-prod.env.bak
# 证书只备份 prod 子目录内容（NGINX_CERTS_DIR=../nginx/certs/prod 是容器挂载源，
# 备份整个 certs 目录会把嵌套垃圾一并带回）
mkdir -p /tmp/my-app-certs.bak
cp -a /opt/my-app/deploy/nginx/certs/prod/. /tmp/my-app-certs.bak/
cp -a /opt/my-app/server/uploads /tmp/my-app-uploads.bak
# 线上生成的管理后台 IP 白名单（tar 包里是仓库空模板，不备份恢复会把白名单踩掉）
cp /opt/my-app/deploy/nginx/admin-allowlist.prod.conf /tmp/my-app-admin-allowlist.bak 2>/dev/null || true
cp /opt/my-app/deploy/nginx/admin-allowlist.extra.list /tmp/my-app-admin-allowlist-extra.bak 2>/dev/null || true
cp /opt/my-app/deploy/nginx/admin-allowlist.own.conf /tmp/my-app-admin-allowlist-own.bak 2>/dev/null || true
# 蓝绿 upstream 是线上运行状态（记录当前活跃色），tar 包里是默认模板，必须保回来
cp /opt/my-app/deploy/nginx/upstream-backend.conf /tmp/my-app-upstream.bak 2>/dev/null || true

echo "=== 解压部署包 ==="
# dist 先清空再解压：部署包内是完整自洽的构建产物，不清空会累积历史 hash chunk
# （旧 chunk 只有长时间未刷新的旧页面懒加载才会用到，index.html 本身不缓存，刷新即恢复）
# ⚠️ 只清空内容、保留目录 inode：dist 整目录挂载进 nginx 容器，rm 掉目录本身再由 tar
# 重建会换 inode，运行中的容器继续看到已脱离的旧空目录（2026-08-22 线上实际踩过，主站 403）
mkdir -p /opt/my-app/dist
rm -rf /opt/my-app/dist/* /opt/my-app/dist/.[!.]* 2>/dev/null || true
tar -xzf /opt/my-app-prod-deploy.tar.gz -C /opt/my-app

echo "=== 恢复原有配置 ==="
cp /tmp/my-app-prod.env.bak /opt/my-app/deploy/env/prod.env
# certs：⚠️ 容器挂载的是 certs/prod 子目录（NGINX_CERTS_DIR），prod 目录本身也必须保 inode，
# rm 掉再重建会让运行中 nginx 的挂载点脱离（2026-08-22 蓝绿切换 nginx -t 找不到证书即此因）。
# 只清 prod 内容 + certs 层的杂散文件，保留 certs 与 certs/prod 两个目录 inode
mkdir -p /opt/my-app/deploy/nginx/certs/prod
find /opt/my-app/deploy/nginx/certs -mindepth 1 -maxdepth 1 ! -name prod -exec rm -rf {} + 2>/dev/null || true
rm -rf /opt/my-app/deploy/nginx/certs/prod/* /opt/my-app/deploy/nginx/certs/prod/.[!.]* 2>/dev/null || true
cp -a /tmp/my-app-certs.bak/. /opt/my-app/deploy/nginx/certs/prod/
# uploads 同理：目录本身挂载进 api 容器，必须保 inode，只替换内容
mkdir -p /opt/my-app/server/uploads
rm -rf /opt/my-app/server/uploads/* /opt/my-app/server/uploads/.[!.]* 2>/dev/null || true
cp -a /tmp/my-app-uploads.bak/. /opt/my-app/server/uploads/
if [ -f /tmp/my-app-admin-allowlist.bak ]; then cp /tmp/my-app-admin-allowlist.bak /opt/my-app/deploy/nginx/admin-allowlist.prod.conf; fi
if [ -f /tmp/my-app-admin-allowlist-extra.bak ]; then cp /tmp/my-app-admin-allowlist-extra.bak /opt/my-app/deploy/nginx/admin-allowlist.extra.list; fi
if [ -f /tmp/my-app-admin-allowlist-own.bak ]; then cp /tmp/my-app-admin-allowlist-own.bak /opt/my-app/deploy/nginx/admin-allowlist.own.conf; fi
if [ -f /tmp/my-app-upstream.bak ]; then cp /tmp/my-app-upstream.bak /opt/my-app/deploy/nginx/upstream-backend.conf; fi

echo "=== 验证证书在挂载源就位 ==="
ls /opt/my-app/deploy/nginx/certs/prod/fullchain.pem /opt/my-app/deploy/nginx/certs/prod/privkey.pem \
  /opt/my-app/deploy/nginx/certs/prod/admin.fullchain.pem /opt/my-app/deploy/nginx/certs/prod/admin.privkey.pem

echo "=== 验证封禁逻辑已部署 ==="
grep -n "不能封禁管理员账号" /opt/my-app/server/routes/admin.routes.js

echo "=== 完成 ==="
