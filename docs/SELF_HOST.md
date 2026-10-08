# 自托管：自己的设备、腾讯云、阿里云

时序运行在 Node.js 上，默认使用 SQLite，也支持 MySQL 5.7，不依赖特定云平台。前端、接口和后台提醒在同一个服务；一套实例支持多个独立个人账户，管理员可管理注册与邀请码。也可以各自部署并配置自己的 AI API。已有 Windows/MySQL 环境见 [原生部署指南](WINDOWS_MYSQL.md)，Alibaba Cloud Linux 3 + Nginx + IP HTTPS 见 [阿里云新手指南](ALIYUN.md)。

## 部署位置

| 位置 | 适合情况 | 准备 |
| --- | --- | --- |
| 自己的电脑 / NAS / 小主机 | 已有全天在线设备 | 持续开机、稳定网络、手机可访问入口 |
| 腾讯云轻量应用服务器 | 希望国内平台付费 | Linux 实例、域名、HTTPS |
| 阿里云轻量应用服务器 | 已有阿里云账号或偏好阿里云 | 同上，部署代码完全相同 |

个人版本建议从 2 核 / 2 GB 内存试用，这是起步建议，尚未压测。计费看购买页面的地区、带宽、流量和续费价格，不把限时促销当长期成本。AI API、邮件费用另算。

国内平台与服务器地域是两回事：腾讯云、阿里云均提供中国内地和中国香港等地域。内地托管公网网站需按平台要求办理 ICP 备案；香港地域按阿里云说明无需 ICP 备案。具体以所选服务商和部署用途要求为准。

官方参考：[腾讯云轻量服务器](https://cloud.tencent.com/product/lighthouse)、[阿里云域名与备案](https://help.aliyun.com/zh/simple-application-server/user-guide/register-and-resolve-domain-names/)、[地域与备案说明](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-server-access-information-check)。

## 公网服务器 + 自动 HTTPS

1. 在 Linux 服务器安装 Docker Engine 和 Compose 插件。应用部署于域名根路径，不支持 `/planner` 子路径。
2. 上传源码，不携带 `data/`、`.env`、`node_modules/`。
3. 复制 `.env.example` 为 `.env`，填写：

   ```dotenv
   SITE_DOMAIN=plan.example.com
   PUBLIC_ORIGIN=https://plan.example.com
   ADMIN_USER=student
   ADMIN_PASSWORD=替换为至少12位随机密码
   VAPID_SUBJECT=mailto:你的邮箱
   ```

4. 域名 A 记录指向公网 IP，云防火墙和系统防火墙放行 80/443。Caddy 通过这些端口申请并续期证书；应用 3088 不直接暴露公网。
5. 在项目根目录执行：

   ```sh
   docker compose up -d --build
   docker compose ps
   docker compose logs --tail=100 app
   ```

6. 手机和电脑打开同一个 HTTPS 地址登录，在设置里配置 AI、通知。SMTP 邮件通过 `.env` 配置。健康检查路径 `/healthz`。

Compose 项目名固定为 `shixu`，移动源码目录不会因默认项目名改变而新建空数据卷。多个独立实例请用 `docker compose -p 其他名字 ...` 分别管理，并分配不同端口。

## 自己的电脑 / NAS，或已有反向代理

本机仍可双击 `start.cmd`。Docker 设备复制好 `.env` 后运行：

```sh
docker compose -f compose.local.yaml up -d --build
```

默认仅绑定 `127.0.0.1:3088`。已有宿主机反向代理时，由代理提供 HTTPS 并转发到该地址，同时将 `PUBLIC_ORIGIN` 改为外部 HTTPS 根地址。Docker 网络中的代理可自行调整容器网络连接。

在外面的手机需要能访问家中设备的公网入口，或通过 VPN 接入家中网络。校园网 / 家宽可能没有可用公网入口，需先核对网络条件。电脑关机、睡眠、断网时提醒会停止；当前版本不补发中断超过 15 分钟的提醒。

## 切换与迁移

本地优先模式已有独立 `/api/sync/v1` 协议，可保存多个 HTTPS 服务器连接，预览差异、选择冲突并手动或自动同步。详细范围和操作以 [同步说明](MANUAL_SYNC.md) 为准。客户端需要服务器上的时序账号，不需要阿里云 AccessKey；同步连接不转发 AI 请求，聊天库和 AI 密钥不在同步范围。

登录页和“偏好与 AI 设置 → 我的服务器”都可以输入另一套时序的 HTTPS 根地址。确认后前往新实例登录。当前仅检查地址格式，可用性以实际打开结果为准。

这是整个网页实例的切换，不是在旧网页跨域调用新 API。各服务器账号、Cookie、密钥相互独立，不会自动传送旧数据。已安装的 PWA 绑定原站点，换地址后在新站点重新安装和开启通知；同域名迁移可保持原入口。

迁移个人内容：旧实例导出 JSON → 新实例导入预览 → 勾选确认替换。备份采用 `shixu-backup` 格式、版本 `1`，包含课程、任务、灵感、日程和偏好；不含账号、AI Key 和通知订阅。也兼容第一版原始 JSON。

导入前的数据自动保留一个恢复点，可在设置中下载再导入。并发修改会阻止过期导入。网页导入上限 1.5 MB；更大迁移用完整数据卷。

完整搬家：先停止应用，备份数据卷（直接运行 Node 时备份整个 `data/`），将 SQLite 和 `secret.key` 一起迁移。同版本恢复验证后再升级。完整迁移会保留账号和 AI 配置；换域名仍需重新登记手机通知。

不要使用 `docker compose down -v`，除非明确要删除持久数据。

## 更新和验收

先备份，在原实例更新源码，执行 `docker compose up -d --build`。当前仅支持单实例，不要给 SQLite 配置多副本。

上线核对：重启后数据不丢、两端修改同步、真实课表识别、真实 AI 排程、移动网络及锁屏提醒。服务端发送成功不代表设备实际收到。

开发机已用于 Docker 隔离开发验收，但这不等同于完成阿里云部署验收。公网 HTTPS、Android 实机和移动网络仍需实际部署后验证。Railway 仅是可选平台，原说明在 [RAILWAY.md](RAILWAY.md)。
