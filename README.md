# 时序 · 学生时间管理

面向 Windows 和 Android 的个人时间规划网页。课程、作业、项目任务与灵感统一保存到服务端。支持自己的电脑/NAS、腾讯云、阿里云及其他 Node.js/Docker 主机。尚未部署到公网。

## 本地启动

需要 Node.js 24。双击 `start.cmd`，或执行 `npm install`、`npm start`，访问 http://localhost:3088 。

首次启动会生成 `data/bootstrap.txt`，其中包含用户名与初始密码；也可在首次启动前通过 `.env` 设置 `ADMIN_USER` 和 `ADMIN_PASSWORD`。已有账号不会被环境变量覆盖。登录后在设置中修改密码。

`data/` 包含数据库和密钥，不要公开、提交到 Git 或单独丢弃密钥文件。

需要 AI 改造时序时，在 Windows x64 本机打开「设置 → 定制我的工具 → 一键准备定制环境」。向导按需准备 WSL、Docker 和 Harness，保存配置进度，支持重启后继续。日常日程功能不需要这些开发组件。详见 [定制环境与使用说明](docs/SELF_CUSTOMIZATION.md)。

## 已实现

- 本地空间可手动连接多个同步目标，先预览双方差异，选择合并或单向覆盖；冲突逐条选择，断网重试不重复写入。详见 [手动同步与恢复](docs/MANUAL_SYNC.md) 和 [工程后续顺序](docs/ROADMAP.md)。

- “跟 AI 说”：一句话拆分多个固定活动和作业，完整信息可自动加入并撤销；缺少钟点等信息先集中补充。活动锁定并检查撞课，作业截止点显示在周历。当前支持新增事项，不自动修改或删除已有日程。

- 登录、密码修改、服务端 SQLite 持久化；每 15 秒读取更新，版本号防止两台设备覆盖修改。冲突时保留表单供用户复制，刷新后重试。
- 学期课表：手动新增、修改，教学周、单双周、课程地点；周视图。
- 作业与项目任务：截止时间、预估耗时、优先级、所属课程/项目、要求和提交入口。作业完成与提交分离，支持实际提交时间补录。
- 灵感：记录、编辑、关联项目、预填为项目任务；不会自动发给 AI。
- 多 API 配置：OpenAI Chat Completions 兼容格式、Anthropic Messages 格式；服务端 AES-256-GCM 加密 API Key，浏览器不回读明文。调用入口包括连接测试、生成排程、课表提取。
- AI 草稿：保留已有日程，检查课程/草稿重叠、截止日期、作息、任务状态和预计耗时，确认后才能应用。可清除未来未锁定日程后重排；手动调整使用时间编辑表单，尚无拖拽。
- XLSX 结构化课程明细优先直接解析（无需 AI）；其他 XLSX、文字 PDF、CSV/TXT 提取后交给所选模型识别，再预览修改和确认导入。只有节次时支持批量补全上下课钟点。旧 `.xls` 需另存为 `.xlsx`；扫描 PDF 暂无 OCR。
- Service Worker / Web Push 订阅、测试通知、后台定时任务、可选 SMTP 邮件；勿扰时间内不发送，后台中断超过 15 分钟的提醒不会补发。
- 服务器地址切换、版本化 JSON 导出与预览恢复（含恢复点）、响应式布局、PWA 清单。本地空间支持离线编辑、待同步数量和手动合并；首次手动同步后可开启前台自动同步，冲突暂停待处理，默认关闭。

## 云端部署

详见 [自托管与中国平台指南](docs/SELF_HOST.md)，以及 [开源准备情况](OPEN_SOURCE.md)。

需要一台可持续运行 Docker 的服务器、域名 DNS 指向服务器，以及开放 80/443 端口。不要使用会休眠的纯静态托管来运行后台提醒。

1. 复制 `.env.example` 为 `.env`，填写 `SITE_DOMAIN=你的域名`、`PUBLIC_ORIGIN=https://你的域名`、`HOST=0.0.0.0`、强密码 `ADMIN_PASSWORD`。首次部署前设置即可。
2. 执行 `docker compose up -d --build`。Caddy 申请 HTTPS 证书，应用数据保存在命名卷 `planner-data`。
3. 在手机和电脑打开同一 HTTPS 地址，使用同一账号登录。Android Chrome 中选择“添加到主屏幕 / 安装应用”。
4. 在设置中添加 API 配置。Base URL 需要包括版本路径，如服务商要求的 `/v1`，不要附加 `/chat/completions` 或 `/messages`。API 以服务商实际格式为准。
5. 在两台设备分别开启通知并发送测试。再测试关闭页面、锁屏、省电模式及移动网络下的接收。浏览器推送受系统与网络影响，服务端发送成功不等于设备收到。
6. 配置 `SMTP_HOST/PORT/SECURE/USER/PASS/MAIL_FROM/MAIL_TO` 并重启，启用邮件备用。填写真实 VAPID 联系邮箱。未配置不会发送邮件。

实例目前是单用户个人空间，无公开注册。不要让不可信用户共享账号。部署前应更换密码并限制服务器访问权限。

## 备份

网页可导出课程、任务、灵感和偏好 JSON。完整迁移需备份整个 `data` 目录或 Docker 的 `planner-data` 卷，包括 `secret.key`，备份时先停止应用以保持 SQLite 文件一致。网页支持导入预览、确认替换和下载导入前恢复点。JSON 不携带账号、API Key 和推送订阅，换服务器后需单独配置。

## 验证与边界

`npm test` 运行排程规则与服务端集成测试。`npm run test:ui` 运行 Windows Edge 的桌面/手机视口交互测试（需要已安装 Edge）。测试使用独立目录，不接触个人数据。

真实课表的识别准确率、真实模型响应、付费部署、邮件投递、Android 锁屏通知，必须取得配置或实机之后继续验收。模型可提出时间安排，但无法保证任务在估计时长内完成。

协议参考：[OpenAI Chat API](https://developers.openai.com/api/reference/resources/chat)、[Anthropic Messages](https://platform.claude.com/docs/en/api/messages)、[MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)。


## AI 自定义开发（实验性）

`npm run customize -- --doctor` 检查环境。第一版通过 DeepSeek Harness 在独立副本中开发、容器测试、独立审查，通过后自动整合源码并保存恢复点。需 Docker Linux 容器及已配置的 Harness；日常时间管理不受此可选依赖影响。使用方法和限制见 [自定义开发说明](docs/SELF_CUSTOMIZATION.md)。

页面入口位于「偏好与 AI 设置 → 定制我的工具」，支持后台任务、实际测试日志、源码对照、手动整合和恢复。远程开发权限由 `SHIXU_DEVELOPMENT` 控制，默认只允许本机直接连接。
