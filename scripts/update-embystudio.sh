#!/bin/sh
# Emby 封面工坊 Docker 镜像更新脚本（NAS）
# 用法：在 /vol2/1000/Docker/embycoverstudio 目录下执行
#   sh update-embystudio.sh          （有 docker 权限时）
#   sudo sh update-embystudio.sh     （NAS 上需要提权时）
set -e
cd "$(dirname "$0")"

echo "== 1/4 拉取最新镜像 =="
docker compose pull

echo "== 2/4 更新并重启容器 =="
docker compose up -d

echo "== 3/4 清理无用的旧镜像 =="
docker image prune -f

echo "== 4/4 完成，当前容器状态 =="
docker compose ps

echo "更新完成 ✅ 打开 http://NAS地址:9308 查看最新版本"
