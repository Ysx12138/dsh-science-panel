# Claude Science 中文面板 for DeepSeek Harness

在 DeepSeek Harness（DSH）的主区域打开 Claude Science：包含中文界面、独立运行环境、模型服务设置和产物下载。项目内已包含汉化词典、后台源码及 macOS Apple Silicon 构建，不需要另装 CSSwitch。

这是社区开发稿，与 Anthropic、DeepSeek、OpenCode 和 CSSwitch 没有官方关联。当前仅支持 Apple Silicon Mac；全新用户环境的端到端安装尚未验证。

## 开始使用

1. 安装并打开 DeepSeek Harness。版本范围见 `package.json` 的 `engines.dsh`。
2. 从 [Claude Science 官网](https://claude.com/product/claude-science)安装官方应用，并将其放入 macOS 的“应用程序”文件夹。Science 本体由 Anthropic 提供，本仓库不包含该应用。使用官方软件及账号须遵守其服务条款和可用性要求。
3. 克隆本仓库。在终端进入克隆后的目录，运行 `pwd` 并复制显示的完整路径。
4. 在 DSH 中进入「插件」→「添加插件」→「安装第三方插件」，粘贴刚才的**本地目录路径**并安装。DSH 不会自动发现新克隆的文件夹。发布到 GitHub 后，也可在此输入仓库地址。
5. 在 DSH 左侧打开「Claude Science」→「模型设置」。默认选择 **OpenCode / Qwen3.8 Flash**，填写该服务的 API Key（模型服务密钥）并保存；已有 Anthropic 官方 API Key 的用户也可选择对应预设。点击「启动隔离 Science」。

预设会自动填写服务地址和模型名。要使用其他支持 Anthropic Messages 接口的服务，选择「自定义」，再填写服务地址、模型名和对应的 Key。切换到不同服务时需要重新填写 Key，避免把原服务的密钥发给新服务。Key 保存在本机私有文件中，权限限制为当前用户，但文件内容是明文；请求会发送给所选模型服务并可能产生费用。

可在克隆目录运行 `./scripts/check-prerequisites.sh` 检查本机架构和官方 Science 是否就位。该命令只检查，不安装或修改应用。

## 能力与边界

- 中文词典覆盖常见导航、按钮、提示和动态状态；词典未覆盖的内容仍显示英文。代码和输入区域不会被汉化脚本改写；原始对话及文档数据不因界面翻译而改变。
- 原汉化包的中文回答提示词也在 `lib/localization/prompt_zh.txt` 中。如希望固定模型的回答语言，可将其内容加入 Science 的自定义提示；插件不会自动覆盖已有提示。
- Science 在 DSH 独立目录下运行。项目只提供界面和运行桥接，不包含个人历史会话、私有技能、MCP 配置或学术服务密钥。
- 文件下载保存到“下载”文件夹，同名文件自动编号。
- 当前只支持 Anthropic 兼容接口。OpenCode 的 DeepSeek V4.1 Flash 在其[官方模型表](https://opencode.ai/v2/docs/console/models/)中使用 OpenAI 兼容接口，不能直接作为本项目的 Anthropic 预设使用；默认选用表中支持 Anthropic 接口的 Qwen3.8 Flash。可用模型、服务权限和价格以服务商为准。
- Science 本体、模型服务与 API Key 是不同的东西：前者提供工作界面，后者提供模型能力。

## 已验证与待验证

已在现有 Apple Silicon Mac 上验证隔离 Science 的启动、停止、真实对话、旧对话预览、中文显示和文档下载；在独立 DSH 测试配置中验证了本地目录可作为插件安装并注册。自动测试使用模拟服务和测试 Key。

**尚未完成全新 macOS 用户从克隆到真实模型回复的端到端测试**。使用现有 OpenCode Key 测试预设时，服务返回 Cloudflare HTTP 403（1010），没有获得模型回复，也无法据此判断 Key 是否有效；Anthropic 官方预设尚未用真实 Key 验证。模型服务可能更改地址、协议或权限。Intel Mac 和其他系统不受当前构建支持。

## 开发和许可

`npm test` 运行插件测试。`backend-source/` 包含对应的 CSSwitch 修改源码；`third-party/` 包含许可、二进制来源和已收集的依赖声明。后台为临时签名构建，没有 Apple Developer 身份签名，可能受到 macOS 安装限制。

CSSwitch 使用 MIT 许可。依赖声明及许可证清单已收集，但打包后二进制的依赖、前端资源和发行许可仍需完整复核，完成后再公开发布。Claude Science 属于 Anthropic，须由用户从官方渠道安装；请不要将用户的 Key、历史数据或该应用本体提交到仓库。
