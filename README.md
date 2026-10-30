# bilibili Toy — Agent Skill + DSH 插件

[English](README.en.md) · 简体中文

两种独立的方式让 AI Agent 驱动 B 站 **Toy** 创作者平台：

- **Agent Skill（技能包）** — [`skills/toy`](skills/toy/SKILL.md)，采用 [Vercel skills](https://github.com/vercel-labs/skills) 格式。一条命令即可安装到 Claude Code、Codex、Cursor、DeepSeek Harness 等 50+ 主流 Agent。
- **DSH 插件** — [`dsh/`](dsh/)，[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件 bundle，内置完整 Web UI 和 `toy_*` 模型工具。

二者都封装官方 [`toy`](https://github.com/bilibili/toy) CLI。Skill 承载文档与工作流；插件则把安全闸门（**预览 → 显式确认 → 提交审核**）落实为代码约束。

## 目录

- [核心特性](#核心特性)
- [快速开始](#快速开始)
- [Skill](#skill)
- [DSH 插件](#dsh-插件)
- [项目结构](#项目结构)
- [开发与贡献](#开发与贡献)
- [License](#license)

## 核心特性

| | Skill | DSH 插件 |
|---|---|---|
| 定位 | 工作流 + 检查清单 | Web UI + 模型工具 |
| 安全闸门 | 文档约束 | **代码强制**（预览 → 确认 → 提交、包体指纹、预检拦截） |
| 安装方式 | `npx skills add` | `dsh plugin --profile web add <tgz>` |
| 覆盖 Agent | Claude Code · Codex · Cursor · DSH · … 50+ | 仅 DSH |
| 更新方式 | `npx skills update` | 重新 `add` 新 Release tarball |

### 插件安全模型速览

- **预览 → 显式确认 → 提交审核**：发布只上传包体生成预览链接（纯元信息变更则生成变更计划）；提交审核必须在 UI/模型工具拿到明确的人类确认后，用完全相同的参数 + `--yes` 重跑。
- **包体指纹前置**：预览上传前先生成内容指纹；若预览到提交之间包被改动，提交会被拒绝，必须重新生成预览。
- **本地预检拦截**：上传前先跑预检，ERROR 直接拦截；入口 HTML 体积超限、绝对路径等常见白屏陷阱在上传前就暴露。
- **破坏性操作需要 ticket**：`history clear` 这类 `--yes` 操作，需要 Host 在人类确认后下发一次性 ticket，避免误调用抹掉本地流水。

详细设计见 [`dsh/packages/toy/README.md`](dsh/packages/toy/README.md)。

## 快速开始

### 安装 Skill（适合所有 Agent）

```sh
# 交互式：让 CLI 帮你选择目标 Agent
npx skills add bilibili/toy

# 非交互式，指定单个 Agent
npx skills add bilibili/toy -a claude-code      # 项目内：.claude/skills
npx skills add bilibili/toy -a codex -g         # 全局：  ~/.agents/skills
npx skills add bilibili/toy -a codex            # 项目内：.agents/skills
```

`npx skills` 会扫描仓库顶层 [`skills/`](skills/) 目录下的技能。不带 `-a` 时安装到所有支持的 Agent；只想装某一个就显式指定。DSH 自身监控 `<项目>/.agents/skills`（rank 200）和 `~/.agents/skills`（rank 500），所以 `codex` 目标就是 DSH 能识别的那份。

### 安装 DSH 插件

```sh
dsh plugin --profile web add https://github.com/bilibili/toy/releases/latest/download/bilibili-dsh-toy.tgz
```

锁版本、源码构建与重启说明见 [package README](dsh/packages/toy/README.md#install)。

### 前置条件

| 依赖 | 版本 | 说明 |
|---|---|---|
| DeepSeek Harness | `0.2.1-rc.2`（`0.2.x` 线） | 插件 `engines.dsh` 声明的范围，不兼容的运行时会在加载前被拒 |
| `toy` CLI | `v0.6.x` | 需在主机安装，并完成 `toy login` |
| 登录态 | — | 面板的「登录」按钮或 `toy_account action=login` 启动 OAuth |
| Node.js | `22.20+` | 仅 `npx skills` 安装与源码构建需要 |

## Skill

### 包含什么

| 文件 | 作用 |
|---|---|
| [`SKILL.md`](skills/toy/SKILL.md) | 技能定义 + 铁律、工作流、错误处理 |
| `references/installation.md` | CLI 安装与登录指引 |
| `references/content-checklist.md` | Toy 包内容预检清单（白屏陷阱、HTML 体积限制等） |
| `references/error-codes.md` | CLI 错误码与应对方式 |
| `scripts/toy_doctor.py` | 零依赖静态预检脚本，一键跑清单 |

Skill 的本质是一个目录，内含 `SKILL.md`，frontmatter 带小写连字符 `name`（与目录名一致）和 `description`；详见 [Vercel skills 源格式](https://vercel-labs-skills.mintlify.app/guides/source-formats)。

### 更新

```sh
npx skills check
npx skills update
```

### 关键原则（摘录）

- **AI 调用一律 `--json`**：人类可读表格会因列宽/超链接渲染变化而崩，`--json` 是唯一稳定契约。
- **发布不是一步到位**：带包体的 `create` / `update` 先不加 `--yes` 跑，拿到 `preview_url` 请用户检查，再**主动发起一次显式确认**，明确拿到「提交」答复后才用同参数 + `--yes` 重跑。
- **先过内容预检再发包**：ERROR 必须修、WARN 必须逐条说给用户听（WARN 不改退出码，汇总行照样 `passed`，不说等于没查）。
- **登录态失效只重试一次**：执行 `toy login` 后重试**原命令一次**，仍失败就停下，不循环。
- **破坏性本地操作要确认**：`history clear` 删除本机全部发布记录，必须先确认再加 `--yes`。

完整铁律与 5 个典型工作流（首发、更新、统计、发布记录消歧、视频绑定）见 [`SKILL.md`](skills/toy/SKILL.md)。

## DSH 插件

[`dsh/`](dsh/) 是一个轻量 pnpm workspace，用于构建 [`@bilibili/dsh-toy`](dsh/packages/toy/package.json)。DSH 加载后，左侧栏会出现 **bilibili Toy** 面板入口。

### Web UI 功能一览

| Tab | 能做什么 |
|---|---|
| **My Toys** | 我的 Toy 卡片（封面/标题/slug/id/状态/可见性），刷新、选中目标 |
| **Stats** | PV/UV 柱状图、次日留存、点赞/收藏/评论/分享汇总，支持 7/30/90 天窗口 |
| **Publish / Update** | 创建或更新；包体/封面/图标路径（带历史建议）；标题/slug/分类/可见性/密码/主题/水印/活动；本地预检（ERROR/WARN）；**生成预览**；预览后需勾选「我已检查预览」才解锁 **提交审核** |
| **History** | 本地发布/更新流水；清空需要两步确认 |

顶栏显示登录账号、解析到的 `toy` 二进制路径、CLI 版本，以及登录/登出。

访问密码只传给 CLI：在所有网络负载、摘要与确认弹窗中都会被掩码（`••••`），不会进入模型 transcript 或页面 DOM。

### 模型工具

同一套 Host 实现还向模型暴露了 `toy_*` 工具，与 Web UI 共享同一套安全闸门——不会出现 UI 拦住了而工具端漏过的情况。

### 插件不内嵌 Skill

插件不会附带自己的 Skill 副本。Skill 通过上面的 [Skill](#skill) 一节单独安装/更新。面板里的 **Skill** 卡片会展示已安装版本（skills CLI 的 lock 文件哈希）、内容哈希与更新时间，并提供安装/更新入口（运行固定命令、显示输出，不接收自由参数）。

### 配置

所有配置项均可选，默认值以 [`cordis.patch.yml`](dsh/packages/toy/cordis.patch.yml) 注释为准。

| 字段 | 默认 | 作用 |
|---|---|---|
| `binary` | `''` | `toy` 二进制路径；空则先查 PATH，再到 `~/.local/bin/toy` |
| `timeoutMs` | `60000` | 只读 CLI 调用超时 |
| `uploadTimeoutMs` | `600000` | 包体上传与提交超时 |
| `loginTimeoutMs` | `300000` | 浏览器 OAuth 等待超时 |
| `maxOutputBytes` | `8388608` | 单次调用捕获的 stdout/stderr 上限 |
| `precheck` | `block` | `block` / `warn` / `off` |
| `pendingTtlMs` | `1800000` | 预览 → 提交的有效期窗口 |
| `agentsHome` | `''` | 扫描/安装 Skill 的 agents 根目录；空 = `$DSH_AGENTS_HOME` 或 `~/.agents` |
| `skillAgent` | `codex` | `npx skills add` 使用的 agent 名（决定安装路径） |
| `skillTimeoutMs` | `180000` | Skill 安装/更新超时 |
| `env` | `{}` | 传给 `toy` 进程的额外环境变量 |

CLI 进程继承环境时会剔除 harness 凭据（`DSH_*` 及 `*_KEY`/`*_TOKEN`/`*_SECRET`/`*_PASSWORD` 均不透传），缺什么通过 `env` 显式补充。

### 已知限制

- **包体路径必须是主机路径**。浏览器端还不能从页面拖拽上传，Wizard 接收的是 dsh 所在机器上的目录 / `.zip` / `.html` 路径（历史建议可辅助填写）。
- **纯元信息更新没有预览链接**。CLI 本身不为这类更新生成预览，确认弹窗会展示计划变更的字段。
- **slug 发布后不可改**。更新时拒绝 `slug`；换地址只能删除重建，本 bundle 不做这件事。
- **预检不是最终权威**。上传大小上限跟账号有关，本地不强制，由服务端/CLI 决定。
- **Skill 安装位置有优先级**。项目级（`.agents/skills`）高于用户级（`~/.agents/skills`）；面板卡片更新的是全局作用域，项目内的需自行运行 `npx skills`。

## 项目结构

```
skills/
  toy/
    SKILL.md              # 技能定义（YAML frontmatter: name, description）
    references/           # 按需加载的支持文档
      installation.md
      content-checklist.md
      error-codes.md
    scripts/
      toy_doctor.py       # 零依赖静态预检脚本
dsh/
  package.json            # 私有 pnpm workspace（构建/测试工具链）
  packages/toy/           # @bilibili/dsh-toy bundle：Host、Web UI、测试
  packages/dsh-typert-protocol/  # 构建目标使用的 vendored Typert 协议
.github/workflows/        # CI：构建/测试，以及 tag 驱动的 Release tarball
```

## 开发与贡献

```sh
pnpm --dir dsh install    # 安装构建/测试工具链
pnpm --dir dsh check      # build + node:test 套件（用 fake-toy.mjs，不碰真实平台）
```

贡献者与 AI Agent 的工作规则、验证手册与 Release checklist 见根目录 [`AGENTS.md`](AGENTS.md)；插件开发另见 [`dsh/AGENTS.md`](dsh/AGENTS.md)。

**重要约束（摘录）**

- 永远不要用 Toy 写命令（publish / update / submit / bind / shared-storage 写入 / history clear / login / logout）打真实平台；测试统一使用 `fake-toy.mjs` + 一次性 `DSH_HOME`。只读查询（list / stats / history）允许。
- 不要给插件内嵌一份 Skill 副本，也不要加 `skill/` 构建步骤。
- 不走 npm 发布渠道；CI 使用自动 `GITHUB_TOKEN` 创建 Release。
- 不推 tag、不 force-push `main`、不合并 PR，除非人类明确要求该操作。

## License

[MIT](LICENSE)
