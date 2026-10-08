#!/usr/bin/env bash
# Download a published image; the small cloud server never compiles Harness.
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
command -v curl >/dev/null
command -v docker >/dev/null
command -v sha256sum >/dev/null
version="$(sed -n 's/^[[:space:]]*"version": "\([0-9.]*\)".*/\1/p' "$root/package.json" | head -n 1)"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo '无法读取发行版本。'; exit 1; }
image="dayweave:harness-$version"
archive="dayweave-harness-$version.tar.gz"
folder="/opt/dayweave-images"
base="https://github.com/Xylonzzz/Dayweave/releases/download/v$version"
mkdir -p "$folder"
cd "$folder"
echo "正在下载时序 $version 的 Harness 镜像。原服务继续运行。"
curl --fail --location --retry 3 --connect-timeout 20 --max-time 1800 --output "$archive.part" "$base/$archive"
curl --fail --location --retry 3 --connect-timeout 20 --max-time 120 --output "$archive.sha256.part" "$base/$archive.sha256"
hash="$(awk 'NR==1 {print $1}' "$archive.sha256.part")"
[[ "$hash" =~ ^[a-f0-9]{64}$ ]] || { echo '下载的校验信息无效，服务未改变。'; exit 1; }
printf '%s  %s\n' "$hash" "$archive.part" | sha256sum --check -
mv -- "$archive.part" "$archive"
mv -- "$archive.sha256.part" "$archive.sha256"
echo '文件校验通过，正在导入镜像。'
docker load --input "$archive"
docker run --rm --entrypoint node "$image" --input-type=module -e '
import {APP_VERSION} from "./public/version.mjs";
import {harnessStatus} from "./harness/runtime.mjs";
const expected=process.argv[1],status=harnessStatus(process.env.HARNESS_ROOT);
if(APP_VERSION!==expected||!status.available)throw Error("镜像版本或 Harness 环境不匹配");
console.log(JSON.stringify({version:APP_VERSION,harness:status.available,harnessVersion:status.version}));' "$version"
echo '镜像检查通过，开始备份并切换服务。'
DAYWEAVE_IMAGE="$image" bash "$root/deploy/update-cloud.sh" --harness
echo '请刷新网页，在 AI 接口配置自己的密钥，再选择 DeepSeek Harness。'
