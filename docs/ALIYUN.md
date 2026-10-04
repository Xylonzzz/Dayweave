# 阿里云个人试用部署

已有 Windows Server、Node.js 22.2 和 MySQL 5.7 时，使用 [Windows 原生部署与 MySQL](WINDOWS_MYSQL.md)，复用现有 MySQL 与 Nginx，不要求安装 Docker。Server 2012 必须做目标机器验证；以下 Linux/Docker 方案是另一条部署路线。

建议从轻量应用服务器、2 vCPU / 2 GB 内存、40 GB 以上磁盘、Ubuntu 24.04 LTS x64（购买页可选时）开始。这是个人同步与 API 调用的试用起点，尚未经性能压测。无需购买 GPU 或云数据库；当前用单实例 SQLite。AI 定制的 Docker 测试仍在个人电脑运行，不按远程开发服务器配置采购。

想先尽快验收可选中国香港地域、一个月试用，再配一个域名。选择中国内地地域时，对外提供网站服务前需完成备案；阿里云规定用于备案的轻量实例购买时长需满三个月。地域库存、套餐、首购和续费价以购买页为准，比较流量额度与超额规则。

官方依据（2026-10-04 核对）：[使用须知](https://help.aliyun.com/zh/simple-application-server/product-overview/usage-notes)、[创建实例](https://help.aliyun.com/zh/simple-application-server/user-guide/create-a-server/)、[计费规则](https://help.aliyun.com/zh/simple-application-server/product-overview/billing-faq)。

## 部署前需要的信息

- 实例地域、操作系统、CPU/内存/磁盘与公网 IP。
- 域名及可修改 DNS 解析的权限，内地实例另需确认备案状态。
- 在本机可用的 SSH 连接（主机、端口、用户名、密钥路径），或用户已登录的控制台终端。密码与私钥不贴入聊天。
- 是否迁移旧数据；默认先用独立测试账号验收，不自动上传个人数据。

按 [自托管说明](SELF_HOST.md) 配置 Compose、Caddy、域名 A 记录和 80/443 端口；3088 不直接暴露公网。部署后验证 `/healthz`、同步协议探测、登录、差异预览、确认写入、重启保留、Windows 与 Android 移动网络访问。全部通过后才称为该实例可用。

时序设置中填写 `https://你的域名` 和时序账号，而不是云厂商 AccessKey。一个服务器实例目前是一套个人空间，不提供多人独立账号。聊天记录、AI 密钥不随日程同步，云端 AI 需另行配置。
