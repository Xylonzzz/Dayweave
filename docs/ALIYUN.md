# 阿里云部署：新手操作指南

适用：全新 Alibaba Cloud Linux 3 x64 实例，Nginx + Docker + SQLite，可直接用公网 IPv4 和 HTTPS。所有地址均为示例，不是维护者的服务器。命令在**阿里云远程连接的 Linux 终端**执行，不是在 Windows PowerShell 执行。

已有服务直接看第 8 节，避免重新创建空数据空间。Windows/MySQL 环境见 [Windows 部署](WINDOWS_MYSQL.md)。域名 + Compose/Caddy 是另一条路线，见 [自托管指南](SELF_HOST.md)；两条路线默认使用不同数据卷，不要直接切换。

## 1. 准备服务器和入口

个人及少量朋友使用可从 2 vCPU、2 GB 内存、40 GB 磁盘试用，尚未做并发容量压测。默认 SQLite，无需另购 GPU 或云数据库；AI 调用远程 API，费用由模型服务商收取。流量、续费以订单为准。

控制台打开“实例 → 网络与安全组 → 添加入方向规则”：

| 用途 | 协议/端口 | 来源 |
| --- | --- | --- |
| HTTP 与证书验证 | TCP 80 | `0.0.0.0/0` |
| HTTPS 网页 | TCP 443 | `0.0.0.0/0` |
| SSH（需要时） | TCP 22 | 管理电脑公网 IP，使用 `/32` |

`0.0.0.0/0` 表示所有 IPv4 来源，不是服务器地址。无需开放 3088 或数据库端口。系统防火墙若启用，也需允许 80/443。参考：[安全组入门](https://help.aliyun.com/zh/ecs/user-guide/start-using-security-groups)。备案及访问要求按地域和用途向平台确认，证书申请成功不代表其他手续自动完成。

在远程终端设置变量，把文档示例地址替换成**自己的公网 IPv4**：

```bash
SERVER_IP=203.0.113.10
APP_VERSION=0.1.5
```

变量只在当前终端有效，重新连接后需再次设置。后续 `$SERVER_IP` 会替换成此值；不要照抄提示符和输出。

## 2. 安装工具

`docker --version` 已有输出时跳过 Docker 安装。下列安装方法对应阿里云官方 Alibaba Cloud Linux 3，不能直接用于 Ubuntu，也不卸载已有 Docker。

```bash
dnf install -y git curl nginx
curl -fL http://mirrors.cloud.aliyuncs.com/docker-ce/linux/centos/docker-ce.repo -o /etc/yum.repos.d/docker-ce.repo
sed -i 's|https://mirrors.aliyun.com|http://mirrors.cloud.aliyuncs.com|g' /etc/yum.repos.d/docker-ce.repo
dnf install -y dnf-plugin-releasever-adapter --repo alinux3-plus
dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker --version
```

`dnf install` 安装工具；`enable --now` 表示立即启动并设置开机启动。参考：[阿里云安装 Docker](https://help.aliyun.com/zh/ecs/user-guide/install-and-use-docker)。镜像包含 Node.js，不需要另装它。

## 3. 下载程序

```bash
git clone https://github.com/Xylonzzz/Dayweave.git /opt/dayweave
mkdir -p /opt/dayweave-images
cd /opt/dayweave-images
ARCHIVE="dayweave-harness-${APP_VERSION}.tar.gz"
RELEASE="https://github.com/Xylonzzz/Dayweave/releases/download/v${APP_VERSION}"
curl -fL --retry 3 -o "$ARCHIVE" "$RELEASE/$ARCHIVE"
curl -fL --retry 3 -o "$ARCHIVE.sha256" "$RELEASE/$ARCHIVE.sha256"
sha256sum -c "$ARCHIVE.sha256"
docker load -i "$ARCHIVE"
```

代码提供部署脚本；镜像是装好程序、Node.js 和 Harness 的模板。校验出现 `OK` 后再导入。0.1.5 压缩包约 606 MiB，导入后占用更多磁盘，不需要在小服务器上编译 Harness。下载失败先解决网络或上传同版本文件，不跳过校验。

## 4. 启动时序

```bash
docker run -d \
  --name dayweave \
  --restart unless-stopped \
  -p 127.0.0.1:3088:3088 \
  -v dayweave-data:/app/data \
  -e HOST=0.0.0.0 \
  -e DB_DRIVER=sqlite \
  -e DATA_DIR=/app/data \
  -e PUBLIC_ORIGIN="https://${SERVER_IP}" \
  -e ADMIN_USER=student \
  -e SHIXU_DEVELOPMENT=disabled \
  "dayweave:harness-${APP_VERSION}"
curl --max-time 10 http://127.0.0.1:3088/healthz
```

看到 `"status":"ok"` 表示后端启动。`-d` 后台运行；`--restart` 自动恢复服务；`127.0.0.1` 只供服务器自身访问；`dayweave-data` 单独保存数据库与密钥。关闭云端源码定制不影响日常 Harness 对话。

已有同名容器时停止照抄，改走第 8 节，不要删除原数据卷。

## 5. 配置 IP HTTPS

以下仅用于全新、没有其他网站的 Nginx。已有配置应合并对应 `server`，不要覆盖其他网站。

```bash
mkdir -p /var/www/dayweave-acme/.well-known/acme-challenge
cat > /etc/nginx/conf.d/dayweave.conf <<EOF
server {
    listen 80;
    server_name ${SERVER_IP};
    location /.well-known/acme-challenge/ { root /var/www/dayweave-acme; }
    location / { return 404; }
}
EOF
nginx -t
systemctl enable --now nginx
systemctl reload nginx
printf 'dayweave-ok\n' > /var/www/dayweave-acme/.well-known/acme-challenge/check
```

Nginx 是公网入口，暂时只提供验证文件。在手机/电脑访问 `http://你的公网IP/.well-known/acme-challenge/check`，应看到 `dayweave-ok`。看不到先检查安全组、防火墙、Nginx 配置以及是否命中默认测试页。

准备独立的 Certbot 环境：

```bash
dnf install -y python3.11 python3.11-pip
python3.11 -m venv /opt/certbot
/opt/certbot/bin/pip install --upgrade pip certbot
/opt/certbot/bin/certbot --version
```

IP + webroot 需要 Certbot **5.4 或以上**。软件源若没有 Python 3.11 包，按 [Certbot 官方安装说明](https://certbot.eff.org/instructions?ws=other&os=pip) 准备受支持的 Python，不要替换系统 Python。

```bash
/opt/certbot/bin/certbot certonly \
  --webroot --webroot-path /var/www/dayweave-acme \
  --preferred-profile shortlived \
  --ip-address "$SERVER_IP"
```

填写自己的邮箱并阅读服务条款，邮件订阅可自行选择。证书在 `/etc/letsencrypt/live/你的公网IP/`。IP 证书有效期约六天，必须自动续期。[官方说明](https://letsencrypt.org/2026/03/11/shorter-certs-certbot)。

将同一个配置文件改为 HTTPS 转发：

```bash
cat > /etc/nginx/conf.d/dayweave.conf <<EOF
server {
    listen 80;
    server_name ${SERVER_IP};
    location /.well-known/acme-challenge/ { root /var/www/dayweave-acme; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    server_name ${SERVER_IP};
    ssl_certificate /etc/letsencrypt/live/${SERVER_IP}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${SERVER_IP}/privkey.pem;
    client_max_body_size 20m;
    location / {
        proxy_pass http://127.0.0.1:3088;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_read_timeout 600s;
    }
}
EOF
nginx -t && systemctl reload nginx
```

先检查语法，通过才重新加载。`proxy_buffering off` 让 AI 回复逐步显示。打开 `https://你的公网IP`，应看到登录页且浏览器认可证书。

## 6. 自动续期

每六小时检查，需要时续期并让 Nginx 加载新证书：

```bash
cat > /etc/systemd/system/dayweave-cert-renew.service <<'EOF'
[Unit]
Description=Renew Dayweave TLS certificate
[Service]
Type=oneshot
ExecStart=/opt/certbot/bin/certbot renew --quiet --deploy-hook "/usr/sbin/nginx -t && /usr/bin/systemctl reload nginx"
EOF
cat > /etc/systemd/system/dayweave-cert-renew.timer <<'EOF'
[Unit]
Description=Check certificate renewal every six hours
[Timer]
OnBootSec=5min
OnUnitActiveSec=6h
RandomizedDelaySec=15min
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now dayweave-cert-renew.timer
systemctl list-timers dayweave-cert-renew.timer --no-pager
/opt/certbot/bin/certbot renew --dry-run --run-deploy-hooks \
  --deploy-hook "/usr/sbin/nginx -t && /usr/bin/systemctl reload nginx"
```

出现 `all simulated renewals succeeded` 才说明模拟续期通过。Nginx 的 `syntax is ok` 即使出现在 hook 的 error output 中，也不是失败，以最终结论为准。超时先检查公网 80 通路，不要直接关闭所有防火墙规则。用 `journalctl -u dayweave-cert-renew.service --no-pager -n 50` 查看任务记录。

## 7. 登录、朋友注册和 AI

读取首次生成的初始账户：

```bash
docker exec dayweave cat /app/data/bootstrap.txt
```

密码仅自己查看，不贴入 Issues、聊天或截图。登录后修改密码，在“我的账户”管理注册方式与邀请码，让朋友注册独立账户。各账户数据、对话和 AI 配置独立。

每位用户在 AI 设置填写接口地址、模型和密钥，测试连接后选择 Harness。镜像不含用户密钥或免费模型额度，参见 [Harness 集成](HARNESS_INTEGRATION.md)。离线记录需通过同步入口上传。

验收：登录/退出、独立账户、添加任务后重启仍存在、电脑和 Android 移动网络访问、同步预览及冲突、AI 对话与工具调用。本文是通用指南，实际实例仍需逐项验收。

## 8. 更新与备份

已有 `dayweave` 容器、SQLite 数据卷及外部 Nginx 的实例执行：

```bash
cd /opt/dayweave
git pull --ff-only origin main
bash deploy/install-harness-image.sh
```

脚本读取源码版本、下载并校验镜像、备份原数据与配置后切换；启动失败尝试恢复旧容器。它要求已有容器，**不能代替首次启动**。有本地源码修改先处理冲突，不用 `reset --hard` 覆盖。历史清理后不能快进的旧克隆应另建源码目录，保留原数据卷和部署配置。

完整恢复需要数据库、`secret.key` 和配置，网页 JSON 不包含账户和 AI 密钥。不要将 `.env`、`data/`、个人日志与备份上传到公开仓库。备份与恢复见 [账户与云端升级](ACCOUNTS_AND_CLOUD.md)。GitHub 推送、云端更新、Windows 安装包升级是三个动作，不会自动同时完成。
