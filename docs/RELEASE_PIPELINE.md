# 一次准备版本，分别更新三个位置

GitHub 保存源码和发行文件；云端容器提供在线服务；Windows 安装包更新电脑上的程序。新增发布流程负责把同一提交构建成两个平台的安装材料，不连接任何私人服务器，也不自动覆盖已安装 EXE 或用户定制源码。

## 普通用户

- Windows：在“我的账户 → 版本与更新”检查新版，下载正式 Release 的安装包。安装前关闭窗口并从托盘退出，保留数据目录。
- 云端管理员：正式版本发布后，拉取匹配源码，执行 `bash deploy/install-harness-image.sh`。脚本备份原容器配置和数据后切换镜像，详见 [阿里云教程](ALIYUN.md)。
- Android：刷新同一 HTTPS 网页或 PWA；离线资源需要联网准备。更换服务器和数据同步是单独操作。

Release 草稿尚未公开，用户的更新检查不会把它当成正式新版。

## 维护者：只构建，不发布

仓库打开 **Actions → Build release packages → Run workflow**。`ref` 选择 `main` 或明确的分支/标签，保持 `publish_draft` 未勾选。

流程会固定同一个提交，并依次检查：

1. package.json、package-lock.json 与页面版本一致，公开文件检查通过。
2. Windows 后端测试、Edge 界面测试、打包与独立 Electron 窗口验收。
3. Linux 构建固定版本 Harness，在容器内用模拟模型执行真实引擎测试；不读取用户 API 密钥，不使用付费模型。
4. 整理两个平台的产物及 SHA256；缺失、额外文件或校验错误会阻止后续步骤。

Windows 构建会编译并包含用于进程识别的 .NET 小程序。桌面后台正常启动直接读取进程创建时间，不调用 PowerShell/WMI；旧式数字进程锁的兼容检查仍会查询命令行。桌面数据目录、原有定制源码和运行中的服务锁均保留。

成功后在该次 Actions 的 Artifacts 下载 `release-bundle`。其中包含安装 EXE、Harness 镜像归档、两份 SHA256 和 `release-manifest.json`。清单只包含版本、提交与文件校验，不包含本机构建路径。产物默认保留七天；它是构建结果，不是已发布正式版。

这些步骤的本地验证和 GitHub 托管运行结果应分别记录；配置了流程不等于已经完成干净电脑、Android 实机或云端上线验收。窗口验收使用未安装的打包程序，不替代 NSIS 安装/卸载实机测试。

## 维护者：准备新版和发布草稿

确认工作区只包含打算发布的内容，然后执行（版本仅为示例）：

```bash
npm run release:prepare -- 0.1.6
npm run release:check
npm run check:public -- --history
npm test
npm run test:ui
```

`release:prepare` 同时更新 package、lockfile、页面版本和离线缓存标识。它不修改个人数据，不自动提交或推送。新版本必须高于当前版本；元数据不一致时先修正原因。

审查改动后提交并创建匹配标签。不要用 `git add .` 收集未经审查的文件：

```bash
git add package.json package-lock.json public/version.mjs public/sw.js
git commit -m "Prepare release 0.1.6"
git tag v0.1.6
git push origin HEAD:main
git push origin v0.1.6
```

如本次还包含功能代码，需要先把相应文件纳入审查与提交。推送新标签会构建并创建 **Draft Release**；也可以手动运行工作流，`ref` 填完整匹配的 `v0.1.6`，勾选 `publish_draft`。标签与源码版本不同会失败，已有 Release 的版本也会被拒绝，不覆盖旧发行包。

最后在 Releases 中审查草稿：测试结果、文件校验、说明和下载文件都确认后，再点击 **Publish release**。随后分别升级云端和电脑。源码定制过的桌面空间不会被官方包静默覆盖，应单独审查整合。

工作流使用 GitHub 自带的临时令牌，只在整理草稿的任务授予仓库内容写权限；不需要在公开仓库配置服务器 IP、SSH 密钥或模型密钥。官方：[工作流触发](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)、[工作流语法与权限](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)。

## 本机构建时

```bash
npm run build:windows
npm run build:installer
node release-tools.mjs stage-installer
```

安装包清单与源码摘要必须匹配；打包后又改了源码，需要重新打包，不能把旧 EXE 当作新提交的产物。公开镜像应从相同提交构建，再按工作流中的导出方式保存同版本归档和校验文件；两个产物齐全后用 `node release-tools.mjs verify-assets` 检查。

检查只能验证所声明的版本、源码摘要和文件一致性，不是数字签名。当前 Windows 安装包尚未代码签名；不得把 SHA256 当成发布者身份认证。
