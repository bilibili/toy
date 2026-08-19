---
name: toy
description: "通过 Toy CLI 完成 B站 Toy 平台的创作者操作（发布 / 更新 / 预览 / 查询 / 视频绑定 / 排查）。触发词：Toy 发布、发布 Toy、toy create、上传 Toy、Toy 更新、toy update、改 Toy 封面、改 Toy 密码、Toy 预览、Toy 提交审核、我的 Toy、toy mylist、Toy 列表、Toy 统计、toy stats、Toy PV/UV、Toy 登录、toy login、Toy 发布记录、toy history、toy cli、Toy 白屏、Toy 404、Toy 页面打不开、Toy 资源路径、Toy slug、Toy 绑定视频、绑视频、解绑视频、toy video、Toy 绑了哪些视频、视频页挂 Toy 入口、toy video mine。当用户需要把本地前端项目/HTML/zip 发布或更新到 Toy 平台、查看自己的 Toy、看访问统计、把视频与 Toy 绑定或解绑、排查发布后页面白屏/资源 404，或管理本地发布记录时使用此 skill。"
license: MIT
---

# toy: Toy 平台创作者 CLI

通过 `toy` 二进制（cobra CLI，服务端 OAuth 登录）完成 Toy 平台的创作者侧操作：打包发布、更新、预览、查询、视频绑定。本 skill 不写命令矩阵 —— CLI 自描述足够，写死字段名只会与代码漂移。Skill 只承载工作流和铁律。

## 何时使用

用户提到把本地项目/HTML/zip 发布到 toy、更新已有 Toy、看自己的 Toy 列表或访问统计、把视频与 Toy 绑定或解绑、查发布记录等创作者场景。

不要用于：

- 老的脚本式发布链路 —— 本 skill 取代它，统一走官方 `toy` 二进制。

## 前置条件

1. `toy` 已安装。检测 `command -v toy`，没装时引导安装（参见 `references/installation.md`）。
2. 已登录。任意 API 命令首次跑可能报「登录态已失效，请执行 `toy login`」，按铁律 4 处理。
3. 全局 flag 以 `--help-json` 实际输出为准。

## 发现机制（关键）

**不要凭记忆构造命令**。第一次用某个子命令前，跑：

```bash
toy --help-json
```

输出是结构化 JSON，包含全部命令树、位置参数、flag、`writes` 标记、`choices` 取值。需要单个子树时跑 `toy <cmd> --help-json`。

JSON 字段语义：

| 字段 | 用途 |
| --- | --- |
| `commands[].path` | 命令路径数组，如 `["create"]`、`["history","clear"]` |
| `commands[].args` | 位置参数 `{min, max, names, variadic}` |
| `commands[].flags` | 本层 flag 列表，每条含 `type/default/choices/required` |
| `commands[].writes` | true 表示业务写操作（如 `create`/`update`） |
| `global_flags` | 全局 flag（如 `--json`） |

### 缺功能时尝试升级

用户要的能力在 `--help-json` 里确实找不到（命令/flag 不存在，而非拼错或记错），可能是本地 `toy` 太旧、新功能还没到。这时可以升一次级（命令见 `references/installation.md`）再重查 `--help-json`。升级失败（dev 构建、未配置分发地址、离线）属正常，直接照现有能力回复用户"当前版本不支持"，别卡住或反复重试。

## 铁律

按以下顺序优先级执行：

### 1. AI 调用一律 `--json`

不管读还是写，AI 调 `toy` 都加 `--json`。读命令（`mylist`/`stats`/`history`）的表格输出会因列宽/超链接渲染变化而崩；写命令的中文成功提示也不如结构化响应好解析。`--json` 是唯一稳定契约。

### 2. 发布/更新是「预览 → 确认 → 提交审核」两段式，不是一步到位

`create` / `update`（`writes:true`）带包体时，CLI 先上传打包、生成 **preview_url**，**默认不提交审核**。提交审核由 `--yes` 触发，是真正的确认闸门（client 侧没有 risk 注解，预览即闸门）。

AI 的正确姿势：

1. **先不加 `--yes` 跑**（带 `--json`）。CLI 只回 `{"preview_url": "..."}`，不提交。
2. 把 `preview_url` 原样给用户，让用户在浏览器里检查。
3. **主动发起一次显式确认**（AskUserQuestion 或等价的明确询问），别只被动说「看完告诉我」。把「即将提交审核」+ 改动摘要（目标 Toy 的 `id`/`title`/`slug`、这次改了什么、slug 保持不变）一起摆出来，请用户明确回「提交 / 不提交」。**只有拿到明确肯定答复，才用同样的参数重跑并加 `--yes`。** 用户没回、回得含糊（如「嗯」「好」不指向提交动作）或说要再改，都不加 `--yes`。
4. 提交成功后 `--json` 会返回 `{id, status, preview_url}`，把 `id`/`status` 给用户。

铁律细节：

- 非交互场景（AI 调用）下，`--json` 不带 `--yes` = 只预览不提交；带 `--yes` = 直接提交。**绝不在用户看过预览并明确确认前加 `--yes`**。给出预览后要主动问一次「是否提交审核」，而不是被动等用户开口——弱提示（「看完告诉我」）容易让用户以为已经在走审核。
- 纯改标题/封面/可见性（`update` 不带 path）没有预览链接，是**直接提交审核**。这种也要先 AskUserQuestion 告知「即将提交审核：<改动摘要>」再加 `--yes`。
- `--visibility password` 必须配 `--access-password`（4-32 字符）；只传 `--access-password` 会按 password 档处理。具体取值/约束以 `--help-json` 的 `choices` 为准。

### 3. 带包体发布前先过内容自检

`toy` 只打包上传，**不校验包内容**。toy 页面跑在 `/toy/<slug>/` 子路径下，绝对路径资源、根绝对跳转等会让页面白屏 / 404 / 链接错乱——包能传、审核可能也过，但打开是坏的。（注：页内锚点 `href="#section"` 现已支持，不再是坑，见 `references/content-checklist.md` §2。）

`create` / `update` 带 path 前，按 `references/content-checklist.md` 对 `<path>` 做内容预检：优先用清单里提供的自动化预检手段，跑不了再照清单 §1–§6 人肉过一遍高频坑（绝对路径、hash 路由 vs history 路由、构建产物 vs 源码、封面、slug 不可改）。有 ERROR 先给用户、修完再传，别硬传。

详见 `references/content-checklist.md`（已用官方 FAQ 校准）。

### 4. 登录态失效是「重新 login」

错误信息含「登录态已失效」「请执行 `toy login`」或 envelope `code` 为会话失效码时：

```bash
toy login
```

`toy login` 会走浏览器 OAuth（会自动开浏览器，`--no-open` 可关）。登录后重试**原命令一次**。仍失败则停下报告用户，不要循环。详见 `references/error-codes.md`。

### 5. 破坏性本地操作要确认

`history clear` 会删除**本机全部**发布记录（仅本地流水，不影响线上 Toy）。它带 `--yes` 跳过确认。AI 要执行时必须先 AskUserQuestion 确认，再加 `--yes`。其余只读命令（`mylist`/`stats`/`whoami`/`history` 查看）直接跑。

### 6. 视频绑定是即时生效，不走预览/审核

`video bind` / `video unbind` 改的是绑定关系（绑定后视频页挂上该 Toy 入口），**调用即生效**：无预览、不产出版本、不进审核、没有 `--yes`。别套铁律 2 的两段式。

几条 `--help-json` 里读不出来的约束：

- **一个视频只能绑一个 Toy**（反之一个 Toy 可绑多个）。撞上「该视频已绑定其他作品」时讲清冲突、让用户决定，**别自己去别的 Toy 上解绑**。
- **重复绑定、解绑不存在的绑定都幂等**，不报错。不用先查后写。
- `video mine` **只返回已过审稿件** —— 找不到某个视频先看它过审了没。
- `bind`/`unbind` 的 `--json` 只回显你传的那个标识，另一个为空是设计行为。
- 解绑非破坏性（可以再绑回来），不必按铁律 5 确认；但解绑用户没点名的绑定关系要先问。

## 典型工作流

工作流只锚定**命令名 + 业务步骤**，具体参数 / flag / 取值都用 `--help-json` 取，避免与 CLI 漂移。

### A. 首次发布一个本地项目

1. 确认登录态（必要时 `toy login`）。
2. **内容预检**：按铁律 3 对 `<path>` 做内容预检（参考 `references/content-checklist.md`），有 ERROR 先修。
3. 跑 `create <path>`（带 `--json`，**不带 `--yes`**），`<path>` 可以是目录 / 单个 HTML / 现成 zip。可按需带 `--title`/`--slug`/`--poster`/`--visibility`（不传 title/slug 会从路径名推导）。
4. 拿到 `preview_url`，原样给用户，请用户在浏览器检查。
5. **按铁律 2 主动发起显式确认**（摆出改动摘要、请用户明确回「提交」），拿到肯定答复后再 **同参数 + `--yes`** 重跑，提交审核。
6. 解析返回的 `id`/`status` 给用户。

### B. 更新已有 Toy

1. 需要先知道 id：跑 `mylist`（带 `--json`）列出我的 Toy，从中选出目标 `id`。
2. 带包体更新：先按铁律 3 对 `<path>` 做内容预检，再 `update <id> <path>`（不带 `--yes`）→ 拿 `preview_url` → **按铁律 2 主动发起显式确认** → 拿到肯定答复后同参数 + `--yes` 提交。**保留原 slug，别为改地址走删除-重建**（slug 发布后不可改）。
3. 只改元信息（标题/封面/可见性/密码）：`update <id> --title ...`（无预览链接，直接提交），按铁律 2 先告知再加 `--yes`。
4. 改密码档：`--visibility password --access-password ...`；给现有密码档改密只传 `--access-password`。具体看 `--help-json`。

### C. 查看我的 Toy 与统计

1. `mylist`（带 `--json`，可 `--page`/`--size`）看列表与可见性。
2. 单 Toy 统计 `stats <id>`，默认近 7 天（截至昨天，当天未结算）；区间用 `--days N` 或 `--start/--end`（YYYY-MM-DD，最长 90 天），具体看 `--help-json`。脚本/JSON 务必显式传 `id`（不传会进交互选择，AI 环境会失败）。

### D. 用发布记录推断「新发布 vs 更新」

用户给一个本地路径说「发布到 toy」时，往往没说清是首发还是更新。先查发布记录消歧，别上来就 `create`：

1. 跑 `history <path>`（带 `--json`）查这个目录/文件过去有没有发过。记录按登录账号隔离，存的是历次成功 `create`/`update` 的快照（含 `id`/`title`/源路径等）。
2. 判断：
   - **查到记录**（有对应 `id`）→ 大概率是**更新**。用 `mylist` 核对该 `id` 仍存在，然后走工作流 B（`update <id> <path>`）。先跟用户确认是更新这条而不是新发。
   - **没查到记录** → 可能是首发，也可能是换了机器/换了账号/换了路径发过。别只凭本地记录拍板：可跑 `mylist` 看线上有没有同名/同 slug 的 Toy，再跟用户确认走 `create`（工作流 A）还是 `update`（工作流 B）。
3. **旧 `toy.yaml` 只当只读补充线索**（老发布链路的遗留物，不是本 skill 维护的文件）。`history` 查不到、又想再确认时，可以读目录里的 `toy.yaml`，取其中的 `id`/`slug`/`title` 当作**推测线索**——但必须用 `mylist --json` 核对该 `id` 在当前账号下仍存在，别直接拿来当事实。它可能过期、可能指向别人的项目。不要凭里面的 `owner_mid`/`uid` 判断账号。
4. `history` 和 `toy.yaml` 都只是本机线索（不影响线上、可能不全/过期），不是事实源。线上真实状态以 `mylist` 为准；拿不准就让用户选。

清空记录用 `history clear`（破坏性，按铁律 5 确认后 `--yes`）。

### E. 把视频绑定到 Toy

绑定后视频页会挂上这个 Toy 的入口。只能拿自己的视频绑自己的 Toy，归属由服务端校验。

1. **定 Toy**：用户没指明就跑 `mylist` 让用户确认是哪个。
2. **定视频**：用户给了 BV 号直接用；没有就跑 `video mine` 列候选给用户选（只有已过审稿件会出现）。
3. **看现状**（推荐）：`video list` 看这个 Toy 已绑了什么，顺带发现用户其实想换绑。
4. **绑定**：`video bind` 提交，即时生效、无预览无审核。解绑走 `video unbind`。
5. 撞上「该视频已绑定其他作品」→ 按铁律 6，讲清冲突让用户决定，别自己去解绑。

脚本/JSON 务必显式传 Toy id（不传会进交互选择，AI 环境会失败）；各命令收 id 的入口形态不同，以 `--help-json` 为准。

## 错误处理优先级

1. 登录态失效（「登录态已失效」/ 会话失效 code）→ `toy login`，重试一次，不循环。
2. 业务错误（envelope `code != 0` 的 message）→ 直接把 message 给用户，不要二次解释。
3. 非交互环境报「需要加 --yes」类提示 → 说明这是预览/提交闸门，按铁律 2 走预览-确认流程，不要无脑加 `--yes` 绕过。
4. flag/参数错误（cobra 报 `unknown flag` / `accepts N arg(s)`）→ 重新跑 `--help-json` 对齐参数形态。

## 不要做的事

- 不要解析人类 help 文本（`toy -h` 给用户看，AI 用 `--help-json`）。
- 不要凭记忆构造 flag（命令可能升级、也可能因构建渠道而不同，每次都验）。
- 不要在用户看过预览并**明确确认**前给 `create`/`update` 加 `--yes`；也不要被动等用户开口，要按铁律 2 主动问一次「是否提交审核」。
- 不要跳过内容预检就发包（绝对路径/根绝对跳转坑会让页面打开是坏的）；页内锚点 `href="#section"` 现已支持、不再报错，别再当成坑（见 `references/content-checklist.md` 第 2 节）。
- 不要为改 slug 走「删除-重建」，除非用户明确要换地址（slug 发布后不可改，更新时保留）。
- 不要默认创建/写入/维护 `toy.yaml`（本 skill 走官方 CLI 本地记录，`toy.yaml` 只做只读兼容）；也别把 `toy.yaml` 打进上传包。
- 不要循环重试登录态失效；不要把 session token 写进任何输出。
- 不要对 `history clear` 这类破坏性命令未经确认就加 `--yes`。
- 不要为绑定视频擅自解绑用户其他 Toy 上的绑定。
