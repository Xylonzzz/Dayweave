# 可选托管：Railway 单实例 + 持久卷

当前首选自托管和中国平台，见 [SELF_HOST.md](SELF_HOST.md)。本文件保留为可选方案。

适合当前的个人应用：无需先购买域名或手动维护 Linux，平台提供 HTTPS 域名，单实例搭配持久卷保存 SQLite 和密钥。

2026-09-06 查询官方定价：Hobby 最低每月 5 美元，包含 5 美元资源用量；超出部分额外收费。AI 和邮件服务费用不包含在内。这不是总价固定 5 美元的承诺。

官方参考：[定价](https://railway.com/pricing)、[持久卷](https://docs.railway.com/volumes/reference)、[自动域名与 HTTPS](https://docs.railway.com/networking/public-networking)。

## 需要你完成的账号步骤

注册/登录 Railway，根据平台提示开通所需套餐。支付信息由你在平台填写。API Key 在应用设置页面填写，不要发到聊天里。

## 部署参数

1. 在 Railway 新建项目，通过 CLI 上传此目录，或关联你选择的私有 Git 仓库。项目内的 `Dockerfile` 和 `railway.json` 已准备好。不要把 `data`、`.env` 和缓存上传。
2. 为应用服务添加 **Volume**，挂载路径设置为 `/app/data`。必须在第一次正式启动前挂载，避免后来挂卷导致初始数据不可见。
3. 配置变量：
   - `HOST=0.0.0.0`
   - `DATA_DIR=/app/data`
   - `ADMIN_USER=student`
   - `ADMIN_PASSWORD=你设置的至少12位随机密码`
   - `VAPID_SUBJECT=mailto:你的联系邮箱`
   - `PUBLIC_ORIGIN=https://平台生成的域名`（生成域名后填写并重新部署）
   - `PORT` 使用平台提供值；没有自动值时设为 `3088`，公开端口对应同一值。
4. 在 Networking 中 Generate Domain。平台负责 HTTPS，不需要在 Railway 运行 compose/Caddy。
5. 保持 **单实例**，关闭 Serverless/App Sleeping 等休眠选项，以便没有人打开页面时提醒仍能运行。不要横向扩容 SQLite 实例。
6. 根据实际用量设置预算提醒；如设置硬性消费上限，触顶停机会同时中断后台提醒。
7. 可选填写 `.env.example` 中 SMTP 配置。测试邮件和手机通知，不能用“API 返回成功”代替锁屏接收测试。

## 上线验收

- 电脑新建任务，Android 使用移动网络刷新，确认可见；反向修改同样验证。
- 重启服务后课表和 API 配置仍存在。
- 上传你的真实课表核对时间、周次与单双周。
- 用真实模型生成草稿，验证撞课被阻止，提交后不再安排。
- Android 开启通知，分别测试页面打开、关闭、锁屏和省电模式。
- 手机在日常网络打不开平台域名时，先暂停付费扩展；再选更适合该网络的托管区域或服务器。

目前未登录 Railway、未创建云资源、未产生托管费用，也未上传个人数据。
