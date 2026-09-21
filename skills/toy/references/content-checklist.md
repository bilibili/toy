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

## 3.5 让产物文件名带内容指纹（contenthash）—— 影响更新后的加载速度

**先说结论：这是一条「建议」，不带 contenthash 也能正常发布、正常访问，只是每次更新后用户要重新下载全部资源。**

平台侧对「资源文件名是否带内容指纹」有一条优化：若一次更新里某个资源**文件名与内容都没变**，平台可跨版本复用它，用户浏览器/CDN 的缓存直接命中，不必重新下载。判定完全在服务端自证，不需要你声明什么。

要吃到这条优化，产物文件名里得有内容指纹。主流构建工具**默认就是开的**：

| 工具 | 默认 | 产物形如 |
| --- | --- | --- |
| Vite | ✅ 默认开 | `assets/index-Ct-l33m_.js` |
| webpack 5 | 需配 | `output.filename: '[name].[contenthash].js'` |
| Rollup | 需配 | `output.entryFileNames: '[name]-[hash].js'` |

**检查办法**：构建后看 `dist/assets/` 里的文件名有没有一段随机字符。有就够了，不用改配置。

### 想让复用真正生效，还要把稳定内容拆出去

只有 hash 不够。默认配置下第三方依赖和业务代码常被打进**同一个** chunk，于是改一行业务代码就让整个几十 KB 换新文件名、复用不到。

实测一个 Vue 3 + Vite 项目（改一行业务代码后重新构建）：

| 产物 | 体积 | 拆分前 | 拆分后 |
| --- | --- | --- | --- |
| Vue 运行时 | 61 KB | 跟着换名 ❌ | **同名复用** ✅ |
| 图片 | 109 KB | 同名复用 ✅ | 同名复用 ✅ |
| 业务 JS | 8 KB | 换名 | 换名 |
| 业务 CSS | 7 KB | 换名 | 换名 |

拆分后 170 KB 复用、15 KB 重传。Vite 的写法：

```js
// vite.config.js
export default defineConfig({
  base: './',            // 这条是必须的，见 §1
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor'
        }
      }
    }
  }
})
```

### 两个反直觉的实测结论（别照直觉判断）

1. **Vue/Svelte 等 SFC 项目里，改 `<script>` 会让 CSS 文件名也变。** scoped 样式里嵌了由组件源码算出的 `data-v-xxxxxxx`，所以 CSS 内容真的变了。字节数往往一模一样，容易误判成「hash 算错了」。
2. **只换一张图片，引用它的 JS 文件名也会变。** 产物里内联了图片的带 hash URL，属 contenthash 的级联失效。

这两条都是「内容确实变了」，不是工具的 bug，**改 hash 的命名格式（如换成 `.hash.js` 后缀）不会有任何改变**。

### 什么情况下完全复用不了

`public/` 目录下的文件会被原样复制、**不加 hash**（Vite/webpack 皆如此）。这类文件如果内容变了而文件名没变，平台无法确认新旧是否一致，会保守地按「全部重传」处理。把需要稳定 URL 的文件（如 `robots.txt`）放这里是对的；但**大体积资源尽量走构建管线**，让它拿到 hash。

AI 提示：这条只报 **INFO/建议**，不阻断发布。发现产物没带 hash 时提一句「更新后用户需重新下载全部资源，可考虑开启 contenthash」即可，别拿它卡流程，也别替用户改构建配置。

## 4. 封面（poster）与图标（icon）是两回事

- **封面（`--poster`）**：列表卡片/详情头图用的大图。格式 `.png` / `.jpg` / `.jpeg`（官方）；建议 **4:3 横图**（约 `1200x900`），竖图在卡片里会被裁剪难看；优先**本地图**，别用远程热链（可能失效或显示成通用图）。
- **图标（`--icon`）**：另一个独立字段，不是封面的小尺寸版本，别把同一张图两边混着传。格式 `.png` / `.jpg` / `.jpeg`；另有体积与边长上限，取值**以 `--help-json` 的 flag usage 为准**。CLI 按**图片内容**校验，改扩展名不改内容是没用的。
- 两者都在打包上传前就近校验，不会传完才失败。

（封面格式出自官方 FAQ Q7；比例/本地图是踩坑补充。icon 的体积/边长上限由 CLI 校验，取值看 `--help-json`。）

## 5. slug（页面地址）发布后不可改

- 服务端实际约束：只含**字母、数字、下划线、连字符**（`[A-Za-z0-9_-]`），最长 **64 字节**。首字符无限制。
- 风格上建议小写连字符（lowercase-hyphen-case），便于分享 —— 但这是偏好，不是服务端规则。
- **发布后地址不可修改**，要换地址只能删了重发。所以 update 时**保留原 slug**，别为改名走删除-重建（除非用户明确要换地址）。

（官方 FAQ Q8。）

## 6. 发布≠立即可见；分享带 index.html

- 提交后进审核，通过才上线。审核四态：**审核中 / 已发布 / 未通过（看拒绝原因改了重提）/ 超时（可重提）**。别跟用户承诺「发完马上能开」。
- 分享时给 `https://www.bilibili.com/toy/<slug>/index.html`，不要只给裸 `/<slug>/`（目录兜底不保证，可能 `NoSuchKey`）。

（审核流程/四态出自官方 FAQ Q3/Q4；带 `index.html` 是踩坑补充。）

## 7. 用了云存储 / 排行榜：调用节奏（上线后才爆的那类）

前面 §1–6 是「现在就打不开」；这条不一样 —— **发布时一切正常，人一多才爆**。所以预览页看不出来，只能在发之前看代码形态。

云存储与排行榜接口按 Toy 限制调用频率，**同一个 Toy 的全部玩家共享一份额度**：自己测两下永远不会触发，上线后玩家越多，单人能摊到的请求越少。超限的请求被拒，SDK reject，错误 `type` 为 `http_error`、`code` 为 `307044`（「请求过于频繁，请稍后再试」）。

涉及的能力：`getCloudStorage` / `setCloudStorage` / `removeCloudStorage` / `submitScore` / `getRankList` / `getMyRank`。

> **具体阈值（QPS / 突发值）不对外公开，而且线上可调整。** 别在代码里写死数字做本地节流，也别向用户报一个具体数 —— 按下面的形态控制节奏即可，正常游玩不会触发。

五条形态要求（与官方 SDK 文档「频率限制与最佳实践」同源）：

1. **云存储当存档，不当内存**：游玩中先读写页面内存变量，只在结算、过关、页面隐藏这类关键节点落盘。不要每次得分、每次点击都写。
2. **批量代替循环**：一次 `setCloudStorage` 带多个键值对、一次 `getCloudStorage` 带多个 key，不要 `for` 循环逐 key 调。
3. **读结果本地缓存，不轮询**：榜单和存档拉一次后本地复用；确需刷新交给用户手动触发，不要 `setInterval` 定期拉。
4. **排行榜按事件提交**：`submitScore` 只增不减且幂等，结算时提交一次即可；重复提交同分不会覆盖成绩，但一样消耗额度。
5. **失败退避重试，不立即重试**：catch 后先判断是不是 `307044`，是则**指数退避**后再试并给玩家明确提示。原样立即重试会把偶发限流放大成持续限流。

```js
try {
  await toy.setCloudStorage({ coins: '100' })
} catch (error) {
  if (error.type === 'http_error' && error.code === 307044) {
    // 触发频率限制：建议指数退避后重试，并给玩家明确提示
  } else {
    // 其他错误（未登录 / 参数非法等），按业务逻辑处理
  }
}
```

`toy_doctor.py` 能机检其中一部分（轮询、循环内调用、高频回调内调用、有没有认 `307044`），都是 **WARN 不是 ERROR** —— 限流不会让页面打不开，且静态匹配对压缩产物必然有误判。**第 1 条「是否只在关键节点落盘」和第 4 条「是否按事件提交」机器判不了**，要看代码或问用户。

（出自官方 SDK 文档「频率限制与最佳实践」区块，阈值口径以线上文档为准。）

## 自动化预检：toy_doctor.py（推荐，跑不了再人肉）

带包体发布前**默认先跑这个**；只有环境没 python3、或 path 特殊跑不起来时，才退回到上面 §1–§6 人肉过一遍。它不是「爱跑不跑」，是预检的首选闸门。

仓库里带了 `scripts/toy_doctor.py`（相对本 skill 目录），零依赖，静态扫描目录 / ZIP / 单个 HTML 文件，把上面能机检的项查出来（分 ERROR / WARN，支持 `--json`，还会读 PNG/JPEG 尺寸校验封面比例）。资源引用只查 HTML/CSS；`.js` / `.mjs` 与内联 `<script>` 只做 §7 的频率限制形态检查（压缩产物里的字符串字面量拿去当资源路径查会大量误判）。**不校验包体/文件大小**——大小上限是服务端动态配置的，超限交由发布接口返回失败，doctor 不做静态卡限。在 `create` / `update` 前跑：

```bash
python3 "<skill-dir>/scripts/toy_doctor.py" <path> --poster cover.png --slug my-toy --json
```

- 有 ERROR（退出码 1）→ 先把问题给用户、修完再上传，别硬传。
- 关于页内锚点：`href="#section"` 页内锚点定位**已支持**（见第 2 节），`toy_doctor.py` 不再对其报错。`#/path`、`#!/path` 形式的框架 hash 路由本就正常。
- contenthash（§3.5）只在**所有** JS/CSS 产物都不带指纹、且资源数 ≥2 时报一条 WARN。资源太少（单文件 Toy、小 demo）直接跳过；`.min.js` / `.min.css` 不计入——这类手工引入的第三方库本来就不参与构建指纹。
- 它只是辅助，不是事实源；线上真实状态以预览链接和审核结果为准。
