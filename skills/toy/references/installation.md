# 安装

`toy` 是面向创作者的客户端二进制，走服务端 OAuth 登录。

## 一键安装

**macOS / Linux：**

```bash
curl -fsSL https://boss.hdslb.com/toy-cli/toy/install.sh | bash
```

**Windows（PowerShell）：**

```powershell
irm https://boss.hdslb.com/toy-cli/toy/install.ps1 | iex
```

二进制装到 `~/.local/bin/toy`（macOS/Linux）或 `%LOCALAPPDATA%\Programs\toy`（Windows）。可用环境变量 `VERSION` 指定版本、`BIN_DIR` 自定义安装目录（PowerShell 用 `$env:VERSION` / `$env:BIN_DIR`）。安装脚本会自动加 PATH 提示。

## 验证

```bash
toy version
toy --help-json | python3 -m json.tool | head -20
```

## 升级

```bash
toy upgrade --check   # 只检查是否有新版本，不安装
toy upgrade           # 直接升到最新
```

只有远端严格新于当前版本才会替换（原子替换 + sha256 校验），否则无操作。（`upgrade`/`version` 是纯文本输出，不吃 `--json`。）

## 登录

首次使用任意 API 命令（create/update/mylist/stats/whoami）前都要先：

```bash
toy login
```

会走服务端 OAuth：自动打开浏览器走 B 站授权，授权完成后本地只保存登录会话信息。`--no-open` 可不自动开浏览器（自己复制链接）。

登出 / 切号：

```bash
toy logout
```

后续会话失效（命令报「登录态已失效，请执行 `toy login`」）时，**直接重跑 `toy login`** 即可。
