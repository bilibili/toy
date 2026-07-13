# 内容自检清单（发布前）

下面这些是 Toy 平台特有的注意事项——包能传上去、审核也可能过，但页面在 `https://www.bilibili.com/toy/<slug>/` 下会白屏 / 404 / 链接错乱。**create / update 带包体前，先按本清单过一遍**（能跑 `toy_doctor.py` 就先跑，见末尾）。

规则按「官方 FAQ 明说的」+「踩坑攒出来」两类标注。官方 FAQ 见 https://www.bilibili.com/toy/publish/guide（FAQ 内容随版本更新，以线上为准）。

## 1. 资源路径：绝对路径 = 白屏（最高频）

页面实际跑在 `/toy/<slug>/` 子路径下，所以 `/assets/app.js` 会解析到**站点根**而不是包内，导致白屏 / CSS·JS 404 / 图片丢失。

- 用相对路径：`./assets/app.js` 或 `assets/app.js`，不要 `/assets/...`。
- 构建工具设相对 base：
  - Vite：`base: "./"`
  - Webpack：`output.publicPath = "./"`
  - Vue CLI：`publicPath: "./"`
  - CRA：`"homepage": "."`
- JS 里也别用根绝对跳转 `location.href = "/xxx"`，要么拼完整 Toy URL，要么用相对路径。

（官方 FAQ Q1 明说；构建工具配置是踩坑补充。）

## 2. hash：「hash 路由」和「页内锚点定位」都可用 —— 分清概念别混淆

这两件事容易打架，分清楚（**都支持，历史上「锚点不支持」的说法已过时**）：

- ✅ **前端路由的 hash 模式**（如 Vue Router / React Router 的 `#/page` 形式路由）**是推荐的**，兼容性最好：路由都在 `index.html` 内以 `#/xxx` 完成，直接访问 / 刷新都不会 404。
- ⚠️ **history 模式**（`/page2` 这种真实路径路由）：每条路由路径都得对应包内**真实存在的 HTML 文件**，否则刷新 / 直达会 404。要么改 hash 模式，要么为每条路由产出对应 HTML。普通页面间跳转用相对路径即可（如 `./page2.html`）。
- ✅ **页内锚点定位** `<a href="#section">` 跳到同页 `id="section"` 的元素 **已支持**：点击后浏览器在当前页面内解析 fragment、正常滚动定位，无需额外处理。（想要平滑滚动可自行用 JS 增强：`document.getElementById("section")?.scrollIntoView({ behavior: "smooth", block: "start" })`。）
- ⚠️ 慎用 `location.hash` / `history.pushState` / `history.replaceState` 直接改 URL 做页内导航，可能破坏分享与定位。

（背景：toy 内容链路自 `render_mode=2`「去 base」上线后，用户 HTML 不再被注入 `<base href>`，纯 `#` fragment 由浏览器在当前内容页文档内解析，页内锚点滚动即恢复正常。历史上「页内锚点不支持」的结论出自旧 `mode=1` 注入 `<base href>` 时代——那时 `#section` 会被 base 解析成跳向另一个域名而非页内滚动，已随去 base 修复。存量 `mode=0/1` 老 toy 仍共存，个别老页面可能沿用旧行为，但**新发布 / 更新一律走 mode=2**，创作者按「已支持」处理即可。）

## 3. 包结构与入口

- ZIP **根目录或恰好一个一级子目录**下必须有 `index.html`。多个一级 `index.html` 会有歧义，挑一个当包根。
- 框架项目**只传构建产物**（`dist` / `build`），不要传源码（`src/`、`package.json` 那一坨）。先 `npm run build`，确认产物里有 `index.html`。
- 上传支持 `.zip` / `.html` / `.htm` / 文件夹（文件夹会自动打包）。
- 别把 `.git`、`node_modules`、`__MACOSX`、`.DS_Store` 这类打进包里。
- 旧项目里的 `toy.yaml` 只作本地兼容线索读取，不是页面资源，别打进上传包（`toy_doctor.py` 已自动排除）。

（官方 FAQ Q6/Q7/Q11。）

## 4. 封面（poster）

- 格式：`.png` / `.jpg` / `.jpeg`（官方）。
- 优先**本地图**，别用远程热链（可能失效或显示成通用图）。
- 报告类封面建议 **4:3 横图**（约 `1200x900`）。竖图在列表卡片/详情头图里会被裁剪难看。

（格式出自官方 FAQ Q7；比例/本地图是踩坑补充。）

## 5. slug（页面地址）发布后不可改

- slug 用小写连字符（lowercase-hyphen-case），只含字母/数字/连字符、首字符为字母或数字。
- **发布后地址不可修改**，要换地址只能删了重发。所以 update 时**保留原 slug**，别为改名走删除-重建（除非用户明确要换地址）。

（官方 FAQ Q8。）

## 6. 发布≠立即可见；分享带 index.html

- 提交后进审核，通过才上线。审核四态：**审核中 / 已发布 / 未通过（看拒绝原因改了重提）/ 超时（可重提）**。别跟用户承诺「发完马上能开」。
- 分享时给 `https://www.bilibili.com/toy/<slug>/index.html`，不要只给裸 `/<slug>/`（目录兜底不保证，可能 `NoSuchKey`）。

（审核流程/四态出自官方 FAQ Q3/Q4；带 `index.html` 是踩坑补充。）

## 自动化预检：toy_doctor.py（推荐，跑不了再人肉）

带包体发布前**默认先跑这个**；只有环境没 python3、或 path 特殊跑不起来时，才退回到上面 §1–§6 人肉过一遍。它不是「爱跑不跑」，是预检的首选闸门。

仓库里带了 `scripts/toy_doctor.py`（相对本 skill 目录），零依赖，静态扫描目录 / ZIP / 单个 HTML 文件，把上面能机检的项查出来（分 ERROR / WARN，支持 `--json`，还会读 PNG/JPEG 尺寸校验封面比例）。**不校验包体/文件大小**——大小上限是服务端动态配置的，超限交由发布接口返回失败，doctor 不做静态卡限。在 `create` / `update` 前跑：

```bash
python3 "<skill-dir>/scripts/toy_doctor.py" <path> --poster cover.png --slug my-toy --json
```

- 有 ERROR（退出码 1）→ 先把问题给用户、修完再上传，别硬传。
- 关于页内锚点：`href="#section"` 页内锚点定位**已支持**（见第 2 节），`toy_doctor.py` 不再对其报错。`#/path`、`#!/path` 形式的框架 hash 路由本就正常。
- 它只是辅助，不是事实源；线上真实状态以预览链接和审核结果为准。
