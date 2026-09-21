# Aureum Atelier

<img src="build/icon.svg" alt="Aureum Atelier icon" width="112" />

A museum-inspired desktop coding workspace for Codex, built with Electron, React, and TypeScript.

把美术馆的氛围带进编程工作台：名画背景、本地代码编辑器、Codex 对话、终端与 Git 面板，放在同一个桌面应用里。

## 功能

- **名画工作台**：60 幅内置名画，支持每日轮换、收藏、跳过与背景强度调节；Gallery、Atelier、Monastic 三种主题。
- **本地项目编辑**：目录树、工作区搜索、Monaco 编辑器与文件保存。
- **Codex 对话**：基于本机 Codex app-server，支持多个会话、流式消息、工作区上下文与审批交互。
- **附件输入**：图片、视频关键帧以及文档内容解析。视频以关键帧送入模型，实际理解能力取决于所用模型。
- **集成终端**：使用 node-pty 与 xterm.js，继承本机 shell 环境。
- **Git 面板**：工作区变更、差异查看和提交历史图。
- **可调布局**：侧栏、聊天区与终端支持折叠或调整尺寸。

## 本地运行

项目目前以 **macOS** 为主要开发和打包平台，版本为 `0.1.0`。Windows/Linux 尚未完成验证。

需要 Node.js 22.13+、npm、Git 和 ripgrep（`rg`，用于工作区搜索）。Codex 功能还需要自行安装并完成认证的 Codex CLI；它不包含在本仓库中。

```bash
git clone https://github.com/pivoine-maker/aureum-atelier.git
cd aureum-atelier
npm ci
npm run dev
```

安装过程中会下载 Electron、FFmpeg 等依赖。内置名画已经随源码提供，无需先运行素材下载脚本。

### Codex 配置

应用复用本机 Codex 的认证、模型和配置。先确保终端中的 Codex 可以正常运行：

```bash
codex --version
codex app-server --help
```

当前桥接使用 `codex -c features.code_mode_host=false app-server --stdio`，依赖实验性的 app-server 协议。发布准备时检查的本机 CLI 版本为 `0.146.0`；不同版本的协议支持可能不同。目标、技能及 Guardian 审批等功能也取决于对应 CLI 和服务端能力。Aureum Atelier 是独立项目，与 OpenAI 无隶属关系。

如应用找不到 Codex，可在启动前指定可执行文件：

```bash
CODEX_BINARY=/absolute/path/to/codex npm run dev
```

使用自建 LiteLLM 代理时，桥接会继承 `LITELLM_PROXY_API_KEY`，或读取 `AUREUM_LITELLM_PROXY_API_KEY`。代码中的 `aureum-local` 是本地回退占位值，不提供任何托管服务访问权限。真实密钥由使用者在本机配置。

## 开发与验证

```bash
npm test -- --run     # 单元与组件测试
npm run typecheck    # TypeScript 类型检查
npm run build        # 构建 Electron 主进程、preload 与渲染界面
npm run verify       # 按顺序运行以上三项
```

macOS 本地打包：

```bash
npm run pack:mac     # release/ 下生成应用目录
npm run dist:mac     # release/ 下生成 DMG 和 ZIP
```

现有打包配置不包含 Developer ID 签名或公证。仓库发布的是源码；自行分发安装包前需配置签名、公证，并保留依赖要求的版权与许可证文件。

## 项目结构

```text
src/main/          Electron 主进程、Codex、终端、文件与 Git 服务
src/preload/       主进程和渲染界面的 IPC 桥接
src/renderer/      React 界面、编辑器、主题与内置名画
src/shared/        共享类型、校验与名画目录
scripts/           原生依赖修复、素材下载与界面预览辅助脚本
build/             应用图标
docs/superpowers/  开发过程中的设计说明与实现计划
```

设计文档保留了项目演进过程，部分描述属于历史方案；当前行为以源码和测试为准。`preview:capture` 使用独立的模拟界面数据，不能替代真实 Codex 对话验证。

需要重新生成名画离线缩略图时，安装 ImageMagick（提供 `magick` 命令），再运行 `npm run artworks:download`。此命令从目录所列的来源下载图片，部分 Wikimedia 图片会经由 wsrv.nl 代理。

## 数据与权限

工作区文件由应用在本机读取和保存；设置与附件缓存保存在 Electron 用户数据目录。发送的消息、上下文和附件会交给所配置的模型服务处理。

**当前 Codex 桥接显式设置 `approvalPolicy: "never"` 和 `sandbox: "danger-full-access"`**，并继承启动应用时的环境。这允许模型发起的操作使用当前用户的本机权限，通常不会逐项请求确认；选择一个工作区不等同于文件系统隔离。请仅在受信任的工作区和模型配置下使用，或先调整 `src/main/codex/codexExecService.ts` 中的 `codexPermissionParams()`。界面中的审批事件支持取决于 CLI，不构成操作必定需要确认的保证。

## 许可证与素材

项目原创代码采用 [MIT License](LICENSE)。名画、字体、FFmpeg 和其他第三方依赖保留各自的许可条件，不因本项目的 MIT 许可证而改变。完整名画来源和直接依赖说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

欢迎通过 [Issues](https://github.com/pivoine-maker/aureum-atelier/issues) 报告问题，或提交 Pull Request。提交前请运行 `npm run verify`，并避免加入个人配置、凭据或工作区内容。
