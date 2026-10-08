#!/usr/bin/env bash
# Upgrade the single-container SQLite installation behind an existing Nginx proxy.
set -euo pipefail
umask 077
cd "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
container="${DAYWEAVE_CONTAINER:-dayweave}"
bind_port="${DAYWEAVE_BIND_PORT:-3088}"
[[ "$container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || exit 1
[[ "$bind_port" =~ ^[0-9]+$ ]] || exit 1
mode="${1:---accounts}"
case "$mode" in --accounts|--harness) ;; *) echo '用法：bash deploy/update-cloud.sh --accounts 或 --harness'; exit 1;; esac
command -v docker >/dev/null
volume="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}' "$container")"
[[ "$volume" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || { echo '未找到 /app/data 的命名数据卷，请先检查部署方式。'; exit 1; }
driver="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container" | sed -n 's/^DB_DRIVER=//p')"
[[ "$driver" = sqlite ]] || { echo '本脚本仅用于当前 SQLite 部署。'; exit 1; }
docker exec "$container" node -e "fetch('http://127.0.0.1:3088/healthz').then(r=>{if(!r.ok)process.exit(1)})"
stamp="$(date +%Y%m%d-%H%M%S)"
image="dayweave:upgrade-$stamp"
backup="${DAYWEAVE_BACKUP_DIR:-/opt/dayweave-backups}/$stamp"
mkdir -p "$backup"
docker inspect "$container" > "$backup/container.json"
docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container" > "$backup/runtime.env"
if [[ -n "${DAYWEAVE_IMAGE:-}" ]];then
  docker image inspect "$DAYWEAVE_IMAGE" >/dev/null
  image="$DAYWEAVE_IMAGE"
elif [[ "$mode" = --harness ]]; then
  memory_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
  if [[ "$memory_kb" -lt 6291456 ]];then
    echo 'Harness 源码构建需要更多内存。请导入预构建镜像，再设置 DAYWEAVE_IMAGE 运行此脚本。原服务未停止。'
    exit 1
  fi
  echo '正在构建包含 Harness 的版本。正式服务此时仍继续运行。'
  docker build -f deploy/Dockerfile.harness -t "$image" .
else
  echo '正在构建注册与独立账户版本。正式服务此时仍继续运行。'
  docker build --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:24-bookworm-slim -t "$image" .
fi
if [[ "$mode" = --harness ]];then
  sed -i '/^HARNESS_ROOT=/d' "$backup/runtime.env"
  printf '\nHARNESS_ROOT=/opt/harness\n' >> "$backup/runtime.env"
fi
# SQLite's online backup API includes committed WAL data; the private archive also keeps secret.key.
echo '正在备份全部账户数据和密钥。'
docker exec "$container" node --input-type=module -e '
import fs from "node:fs";import {DatabaseSync,backup} from "node:sqlite";
const file="/app/data/.upgrade-backup.sqlite",db=new DatabaseSync("/app/data/planner.sqlite");
await backup(db,file);db.close();'
docker cp "$container":/app/data/.upgrade-backup.sqlite "$backup/planner.sqlite"
docker cp "$container":/app/data/secret.key "$backup/secret.key"
docker exec "$container" node -e 'require("node:fs").unlinkSync("/app/data/.upgrade-backup.sqlite")'
old="$container-previous-$stamp"
docker stop "$container" >/dev/null
docker rename "$container" "$old"
rollback(){
  echo '新版本未启动成功，正在恢复旧容器。'
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker rename "$old" "$container"
  docker start "$container" >/dev/null
  echo "备份保存在 $backup。旧容器已重新启动。"
}
if ! docker run -d --name "$container" --restart unless-stopped \
  -p 127.0.0.1:"$bind_port":3088 -v "$volume:/app/data" --env-file "$backup/runtime.env" "$image" >/dev/null; then
  rollback;exit 1
fi
healthy=false
for attempt in $(seq 1 30);do
  if docker exec "$container" node -e "fetch('http://127.0.0.1:3088/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1;then healthy=true;break;fi
  sleep 2
done
if [[ "$healthy" != true ]];then rollback;exit 1;fi
docker update --restart=no "$old" >/dev/null
echo "更新成功。数据备份：$backup；旧容器：$old。"
echo '浏览器刷新后，在设置的「我的账户」里查看邀请码。'
if [[ "$mode" = --harness ]];then echo '在 AI 时间管家选择 DeepSeek Harness；每个账户需先配置自己的 API。';fi
