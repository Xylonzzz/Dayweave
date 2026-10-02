# 定制我的工具 · 快速上手

本指南面向开源使用者，介绍如何用自然语言让 AI 帮你开发、测试、审查并整合对时序的改动。所有说明以当前源码为准，主要参考 `public/customize.mjs`、`development/routes.mjs`、`development/customize.mjs`、`development/workspace.mjs`、`development/sandbox.mjs` 与 `docs/SELF_CUSTOMIZATION.md`。

开始前请先理解一个重要的区别：**“整合”指的是把候选副本中的源码改动写回当前安装的源码目录**；**“重启后端”是另一个独立动作**。静态页面改动（`public/` 下的 `.html`、`.css`、`.js`、`.mjs` 等）刷新浏览器即可加载；涉及 `server.mjs` 等后端源码的改动，在“整合”之后仍必须手动重启服务才会生效。当前版本**不会**自动重启服务、不会热更新。

---

## 1. 入口

在浏览器中，从「偏好与 AI 设置」进入「定制我的工具」工作台（`public/customize.mjs` 中的 `customizeMarkup` 构建该页面）。

- 在**离线本地空间**下，页面只显示说明，不提供开发表单，也不调用开发接口。
- 在已登录的本机直连环境（默认可访问）下，页面提供完整工作台：环境检查、需求表单、API 选择、整合方式选择、定制记录与执行详情。
- 服务器环境默认只对本机回环地址开放；管理员可通过设置 `SHIXU_DEVELOPMENT=enabled` 开放已登录的远程访问，或设为 `disabled` 关闭（见 `development/routes.mjs` 的 `developmentAllowed`）。

也可以通过命令行闭环操作（见 `development/cli.mjs`，`npm run customize`）：

```text
npm run customize -- --doctor                 # 检查环境
npm run customize -- --request 需求.txt         # 自动开发、测试、审查并整合
npm run customize -- --request 需求.txt --provider 接口ID
npm run customize -- --request 需求.txt --review-only   # 仅生成候选版本
npm run customize -- --rollback 记录ID          # 恢复已整合的源码
```

---

## 2. 环境检查

工作台顶部「开发环境」区域会请求 `/api/development/status`，同时检查两件事：

1. **Harness**：固定版本的执行引擎是否可用。
2. **Docker**：是否有一个可用的 **Linux 容器**环境。

`status` 接口返回的 `available` 只有在 `allowed && harness.available && docker.available` 全为真时才为真；只有此时「开始定制」按钮才可用。缺少环境时不会调用模型（见 `routes.mjs` 的 `report` 与 `customize.mjs` 开头的检查）。

Docker 检查由 `development/environment.mjs` 的 `inspectEnvironment` 实现：

- 优先按 `SHIXU_DOCKER_PATH`（若已配置）查找 Docker 可执行文件。
- 在 Windows 上会从常见的 Docker Desktop 安装目录探测；同时读取 WSL 状态，并在有未完成重启时给出提示步骤。
- 只认可 `linux` 容器引擎；若当前是 Windows 容器，会提示切换到 Linux 容器。
- 检查结果会显示“已就绪 / 等待重启 / 未安装 / 引擎不可用”等不同状态，并给出对应步骤和 WSL 原始状态（可在页面展开查看）。

点击「重新检查」可重跑检查。命令行用 `npm run customize -- --doctor` 输出 harness 与 docker 的 JSON 报告，环境不满足时以非零退出码结束。

---

## 3. API 选择

Web 表单中的「开发与审查使用的 API」下拉框只会列出格式为 `openai`（兼容 OpenAI 格式）的已配置接口（`customize.mjs` 前端 `customizeMarkup` 中 `p.format==='openai'` 的过滤）。若没有兼容接口，下拉框会提示“请先在设置中添加兼容 API”。

提交任务时，后端会再次校验所选接口必须为 `openai` 格式，否则报错“请选择兼容 OpenAI 格式的开发接口”（`routes.mjs` 的 `POST /jobs`）。

命令行方式下有两种选择：

- 设置 `SHIXU_DEV_API_KEY`（可配套 `SHIXU_DEV_BASE_URL`、`SHIXU_DEV_MODEL`）直接使用环境变量指定的接口。
- 否则会读取时序数据库里已保存的接口列表，默认选择第一个 `openai` 格式接口，可用 `--provider 接口ID` 指定。

开发过程中，必要的源码会发送给所选模型服务，并消耗该接口额度。测试不使用你的真实日程、密钥或账号数据。

---

## 4. 自动整合与候选模式

提交需求时，Web 表单「通过测试和审查后」一栏决定结果去向：

- **自动整合源码**：`autoApply=true`。开发、测试、审查都通过后，自动把改动写回当前源码目录。
- **保留候选版本，稍后整合**：`autoApply=false`（命令行对应 `--review-only`）。通过后任务进入「候选版本已就绪（ready）」状态，改动仍留在副本中，由你稍后手动整合。

无论哪种模式，后端都会按以下流程执行（见 `development/customize.mjs`）：

1. 准备源码副本（`prepare`），保存原始副本与候选副本。
2. 构建独立测试环境（Docker Linux 镜像，`npm ci --ignore-scripts`）。
3. 开发会话读取、改写候选副本，并用 `dev_test` 运行测试验证。
4. 宿主再次强制运行“候选测试”与“原始回归测试”（`testSandbox` 会恢复原始 `tests/` 做第二轮回归）。
5. 独立审查会话用 `dev_verdict` 提交结论，只有 `approved=true` 才能整合。
6. 测试或审查失败时，把失败信息反馈给开发会话继续修正，最多三轮；三轮后仍未通过则任务置为 `failed`，不会整合源码。

---

## 5. 查看记录、日志与源码对照

工作台右侧「定制记录」列出历史任务（`GET /api/development/jobs`），「执行详情」展示单条任务的进度、事件、审查结论、改动文件与测试日志（`GET /api/development/jobs/:id`）。

- 点击某条记录可查看 `phase`（准备中 / 开发与修正 / 运行测试 / 独立审查 / 正在整合 / 已整合源码 / 候选版本已就绪 / 已恢复源码 等）和进度说明。
- 审查通过后会显示“AI 审查结论”摘要。
- 每条记录列出本次改动文件；点击文件名会加载“修改前 / 修改后”的源码对照（`GET /api/development/jobs/:id/file`）。
- 最近多轮的“实际测试输出”以日志形式可展开查看（`test-*.log`）。

这些数据存放在 `.shixu-development/<记录ID>/` 目录下，包含原始副本（`original`）、候选副本（`candidate`）、开发/审查会话摘要、实际测试日志、审查结论（`verified.json`）与恢复点（`rollback`），不进入 Git。

---

## 6. 取消

- 任务尚未结束（未进入 `integrated` / `ready` / `failed` 等终态）时，详情页会显示「停止本次开发」按钮，点击后调用 `POST /api/development/jobs/:id/cancel`，触发 `AbortController.abort()`，任务进入 `cancelled`。
- 任务属于服务端进程：**关闭或刷新页面并不会取消任务**，后台会继续运行。
- 命令行方式下按 `Ctrl+C`（SIGINT）会中止当前任务。
- 若服务器在任务运行期间重启，中断的任务会被标记为 `interrupted`（已中断），不会假装继续运行。

---

## 7. 整合（写入源码）

- 候选模式下（`ready`），详情页显示「整合此候选版本」按钮，调用 `POST /api/development/jobs/:id/apply`。
- 只有处于 `ready` 且审查 `approved` 的任务才能整合；整合前会校验候选副本与 `verified.json` 中记录的验证结果一致。
- `integrate` 会先做乐观的整源冲突检查：若当前安装源码相对原始基线已经发生了其他改动，会停止自动整合，避免覆盖。整合在一个主机锁下执行，并先写出恢复到 `rollback` 目录的备份，再同步应用改动；普通写入异常会回退已应用的改动（`development/workspace.mjs`）。
- 整合成功后任务进入 `integrated`，事件记录“源码已整合；后端改动需重启后加载”。

## 8. 恢复

- 只有已整合（`integrated`）的任务，详情页才显示「恢复到本次修改前的源码」按钮，调用 `POST /api/development/jobs/:id/rollback`。
- 恢复依据整合时保存的 `rollback.json` 清单执行；如果某文件在整合之后又被后续修改过（内容与整合后的结果不一致），会阻止覆盖并报错，而不是强行回退。
- 恢复成功进入 `rolledBack`，事件记录“源码已恢复；后端改动需重启后加载”。命令行对应 `npm run customize -- --rollback 记录ID`。

---

## 9. 当前不支持的能力（以源码为准，勿作过度承诺）

以下能力当前版本**尚未实现**，不要声称已支持：

- **EXE / 桌面安装包自动更新**：没有版本目录切换、下载分发或更新机制。
- **远程构建产物分发**：没有把本机构建结果分发到其他机器的能力。
- **在线运行预览**：源码对照（修改前后文本对比）不等于把候选版本运行起来预览。
- **数据库自动迁移**：若改动涉及数据库结构，需要人工单独设计并执行迁移，本流程不会自动迁移数据。

此外，本流程**不会自动重启服务**，也不会进行生产健康检查；后端改动整合后需你手动重启。参见 `docs/SELF_CUSTOMIZATION.md` 关于“后续产品界面与开源方向”的说明。
