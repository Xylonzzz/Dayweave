# Windows 原生部署与 MySQL 5.7 / Native Windows + MySQL 5.7

此方案复用已有 MySQL 服务，新增独立的 `dayweave` 数据库。应用使用 Node.js 原生进程和现有 Nginx，不需要 Docker、WSL、Electron 或重新安装 MySQL。现有数据库和网站不需要删除。

This deployment uses an existing MySQL service with a separate Dayweave database, a native Node.js process, and your existing Nginx. Docker, WSL, and Electron are not required.

## 兼容范围

- MySQL 模式：Node.js **22.2.0+**，已经用 Node.js 22.2.0 与真实 MySQL 5.7.44 验证。测试运行于 Windows 开发机，不代表已通过 Windows Server 2012 实机验收。
- SQLite 桌面/本地模式：仍要求 Node.js **24+**；不会自动把 SQLite 转为 MySQL。
- Node.js 22.2 的官方平台表将 Server 2012 列为实验性平台。先在目标服务器运行环境探针，不能用“已安装 Node”代替实际运行验证。[官方平台表](https://github.com/nodejs/node/blob/v22.2.0/BUILDING.md#platform-list)
- PDF 依赖声明需要 Node.js 22.3+；本工程在 22.2 上补齐其使用的 `process.getBuiltinModule`，文字提取已实测。`npm ci` 可能显示该依赖的 engine 警告；不要忽略安装失败或缺失原生模块，目标服务器仍须验收 PDF。
- 一个 Dayweave 数据库只允许一个后端实例，使用 MySQL 连接锁阻止重复启动；网络断开或 MySQL 重启后应重启应用。后台保活见下文。
- 日程、课程、作业、会话、AI 配置与同步记录使用 MySQL；API 解密密钥和 Harness 文件仍位于 `DATA_DIR`，不能只备份数据库。

## 1. 确认实际环境

在服务器 PowerShell 中执行：

```powershell
node -v
npm -v
Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,OSArchitecture
```

网页显示 Nginx 欢迎页只能证明 Nginx 可访问，不能证明 Node.js 或 MySQL 可用。

## 2. 在现有 MySQL 中创建独立数据库

用你现有的 MySQL 管理工具执行以下语句，先替换示例密码。`dayweave` 若已被别的程序占用，请换一个名字并同步修改后续配置；不要把本程序接到现有业务数据库。

```sql
CREATE DATABASE dayweave CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
CREATE USER 'dayweave'@'127.0.0.1' IDENTIFIED BY 'REPLACE_WITH_A_NEW_RANDOM_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE ON dayweave.* TO 'dayweave'@'127.0.0.1';
```

应用使用 `MYSQL_HOST=127.0.0.1` 的 TCP 连接。如果实例的本机账号解析为 `localhost`，按实际报错中的来源创建对应的本机账号；不要使用 `%` 开放全部来源，也不需要公开 3306。

应用只在自己的数据库中建表。若目标库已有其他程序的表而没有 Dayweave 标记，会拒绝启动。首次建表中断也会停止，需检查新建库，不会自动删除或重建已有表。

建议 `max_allowed_packet` 至少 16 MB，保存较多聊天记录时可以按需增大。先运行 `SHOW VARIABLES LIKE 'max_allowed_packet';` 检查；修改 MySQL 配置或重启既有服务前，评估该实例其他程序的使用。

## 3. 获取源码并填写配置

示例安装路径为 `C:\Dayweave`，数据目录为 `C:\DayweaveData`。可换路径；不使用会被网站静态目录公开的文件夹保存密钥。

```powershell
git clone https://github.com/Xylonzzz/Dayweave.git C:\Dayweave
Set-Location C:\Dayweave
npm ci --omit=dev
Copy-Item .env.mysql.example .env
notepad .env
```

如果没有 Git，可从仓库下载源码 ZIP，解压后在项目根目录执行后面三步。若已经有 `.env`，手动编辑，不要覆盖。

必须填写：

```dotenv
DB_DRIVER=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=dayweave
MYSQL_USER=dayweave
MYSQL_PASSWORD="在本机填写真实数据库密码"
HOST=127.0.0.1
PORT=3088
PUBLIC_ORIGIN=http://localhost:3088
DATA_DIR=C:/DayweaveData
ADMIN_USER=student
ADMIN_PASSWORD=
SHIXU_DEVELOPMENT=disabled
```

MySQL 账号是应用连接数据库用的；`ADMIN_USER` 是登录时序用的，两者不同。`ADMIN_PASSWORD` 留空会生成初始密码到数据目录的 `bootstrap.txt`。已有账号不会因修改环境变量而重置。

`DATA_DIR` 必须保持不变。连接已有 MySQL 账号数据时，如果缺少原来的 `secret.key`，应用会拒绝生成替代密钥，以免已有 AI 配置无法解密。

## 4. 只读检查与首次启动

```powershell
npm run check:server
npm start
```

探针显示 Node 版本、操作系统内核版本、MySQL 版本、字符集、数据包限制和独立数据库检查结果；不显示密码，不创建表，也不修改数据。

在服务器浏览器打开 `http://localhost:3088`。另一个 PowerShell 窗口可运行：

```powershell
Invoke-RestMethod http://127.0.0.1:3088/healthz
```

确认能登录，添加一条虚构事项，再重启应用检查保存情况。先不要迁移真实数据。

## 5. 复用 Nginx 和 HTTPS

为 Dayweave 分配独立域名或子域名，应用部署于根路径，不使用 `/dayweave` 子路径。下面的 `location` 放入**新域名对应的现有 HTTPS server 块**，不是覆盖整个 `nginx.conf`：

```nginx
client_max_body_size 12m;
location / {
    proxy_pass http://127.0.0.1:3088;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 300s;
}
```

保留原网站的 server 块，配置域名解析和证书，并将 `.env` 中 `PUBLIC_ORIGIN` 改为精确的 `https://你的域名`（不带路径和末尾斜杠），再重启 Dayweave。先运行 `nginx -t` 检查，再重新加载 Nginx。

只有公网 HTTP IP 可先验证静态入口或临时连通性，不能据此宣称手机 PWA、推送和桌面同步可用。当前客户端服务器连接要求 HTTPS（本机开发地址除外）。建议先在服务器本机登录验收，再完成 HTTPS。中国内地实例的域名对外服务还需按阿里云要求完成备案。

## 6. 开机启动与后台运行

首次测试时 `npm start` 在终端前台运行，关闭终端会停止。验收后使用 Windows 自带“任务计划程序”创建任务：

1. 使用有权限读取项目、`.env` 和数据目录的专用运行账号，选择“无论用户是否登录都运行”。凭据只在服务器任务窗口输入。
2. 触发器选择“启动时”，可延迟 30 秒，等待 MySQL 启动。
3. 操作的程序填写 `node.exe` 完整路径，参数填写 `"C:\Dayweave\server-supervisor.mjs"`，起始目录填写 `C:\Dayweave`。
4. 设置“如果任务已在运行：不启动新实例”，取消运行时长限制。不要创建多个相同任务。
5. 手动运行任务，核对 `DATA_DIR/server.log` 与 `/healthz`，再测试注销远程桌面后仍能访问。

`server-supervisor.mjs` 会隐藏子进程窗口，记录日志，在后端退出或健康检查持续失败时重启；日志限制为轮转的两份文件。它不会修改 Nginx、MySQL 配置、系统任务或防火墙。任务执行账号权限和 Server 2012 任务调度仍需在目标服务器验证。

云端不提供 Docker 开发沙箱。AI 普通 API 对话与排程可用；Harness 需要另外配置运行环境，不能认为已随 MySQL 适配完成。

## 7. 从原本地空间迁移

1. 在原时序中导出 JSON 备份。
2. 在云端登录，上传备份、预览内容，再确认导入。
3. 核对课程、作业提交时间、任务、灵感和复盘；在云端单独配置 AI 接口。
4. 桌面端添加此 HTTPS 同步地址，先预览双方差异，再执行同步。

此迁移不直接转换 `planner.sqlite`，也不携带原账号、聊天记录、API 密钥或推送订阅。已有同步范围与冲突处理见 [MANUAL_SYNC.md](MANUAL_SYNC.md)。

## 8. 完整备份与更新

MySQL 模式不要使用 `npm run backup:local`（该命令仅备份 SQLite）。使用 MySQL 5.7 自带 `mysqldump`；通过 `-p` 交互输入密码，不把密码写入命令历史：

```powershell
mysqldump --host=127.0.0.1 --port=3306 --user=dayweave -p --single-transaction --skip-lock-tables --no-tablespaces --set-gtid-purged=OFF --default-character-set=utf8mb4 --result-file=C:\DayweaveBackups\dayweave.sql dayweave
```

先创建备份目录，并为每次备份使用不同文件名。同步保存整个 `DATA_DIR`，尤其 `secret.key`；如果还使用 Harness 对话文件，停止后端后再做一致备份。数据库转储包含账户和个人内容，不可提交到 Git。

恢复时先停止 Dayweave，导入到新的空数据库，恢复匹配的密钥和数据目录，再调整 `.env`。不要把转储覆盖进现有其他程序数据库。先在相同版本恢复验收，再升级代码。

更新源码前保留旧源码、数据库转储与数据目录；停止计划任务中的后端，更新后执行 `npm ci --omit=dev`、`npm run check:server`，再启动任务。不要同时运行手动 `npm start` 和计划任务。

## 开发机验证

独立测试容器（仅用于开发机测试，不是 Server 2012 部署要求）：

```powershell
docker run --name dayweave-mysql-compat --rm -d -p 127.0.0.1:33317:3306 -e MYSQL_ROOT_PASSWORD=dayweave-fixture-only mysql:5.7.44 --max-allowed-packet=32M
$env:SHIXU_TEST_MYSQL='1'
node --test tests/mysql.test.mjs
docker stop dayweave-mysql-compat
```

测试固定连接该本机端口和虚构密码，创建随机测试数据库并在结束时删除；不会读取生产 `.env` 中的数据库地址。可以用 Node.js 22.2 的完整可执行文件路径替换 `node`。常规 `npm test` 默认跳过该 MySQL 集成测试。
