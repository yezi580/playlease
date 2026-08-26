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
# ⚠️ upstream 用 cat > 原地写保 inode：它也是单文件挂载进 nginx 的（conf.d/upstream.conf），
# cp 到已存在路径虽保 inode，但若 tar 曾解压出同名文件（旧打包未排除时）inode 已被换掉
if [ -f /tmp/my-app-upstream.bak ]; then cat /tmp/my-app-upstream.bak > /opt/my-app/deploy/nginx/upstream-backend.conf; fi

echo "=== 验证证书在挂载源就位 ==="
ls /opt/my-app/deploy/nginx/certs/prod/fullchain.pem /opt/my-app/deploy/nginx/certs/prod/privkey.pem \
  /opt/my-app/deploy/nginx/certs/prod/admin.fullchain.pem /opt/my-app/deploy/nginx/certs/prod/admin.privkey.pem

echo "=== 检查 nginx 单文件挂载是否脱离 ==="
# upstream-backend.conf 单文件挂载为容器内 /etc/nginx/conf.d/upstream.conf，bind mount 绑定的是
# 解压/覆盖那一刻的宿主机 inode；若本次部署链路换了 inode（如旧 tar 包没排除该文件），
# 运行中的 nginx 会永远读到旧内容——蓝绿 switch 静默失效、回滚同样失效（2026-08-26 实际发生）。
# 脱离时自动 restart nginx 重新绑定：此刻文件内容=部署前备份（活跃色未变），秒级中断且无流量切换
host_upstream_inode=$(stat -c %i /opt/my-app/deploy/nginx/upstream-backend.conf 2>/dev/null || true)
container_upstream_inode=$(docker exec my-app-prod-nginx-1 stat -c %i /etc/nginx/conf.d/upstream.conf 2>/dev/null || true)
if [ -n "$host_upstream_inode" ] && [ -n "$container_upstream_inode" ] && [ "$host_upstream_inode" != "$container_upstream_inode" ]; then
  echo "⚠️  upstream 挂载 inode 已脱离（宿主 $host_upstream_inode ≠ 容器 $container_upstream_inode），重新绑定 nginx..."
  docker restart my-app-prod-nginx-1
  echo "✓ nginx 已重启，挂载重新绑定到当前 upstream 文件"
else
  echo "✓ upstream 挂载 inode 一致（${host_upstream_inode:-未知/新部署}）"
fi

echo "=== 验证封禁逻辑已部署 ==="
grep -n "不能封禁管理员账号" /opt/my-app/server/routes/admin.routes.js

echo "=== 完成 ==="
