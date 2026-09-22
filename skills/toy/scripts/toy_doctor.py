#!/usr/bin/env python3
"""Preflight checks for Bilibili Toy static packages."""

from __future__ import annotations

import argparse
import json
import posixpath
import re
import struct
import urllib.parse
import zipfile
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPG_SOI = b"\xff\xd8"
COVER_RATIO = 4 / 3
COVER_RATIO_TOLERANCE = 0.08

# 与 toy CLI 的 slug 校验同源，**不要在这里收紧**：本地比服务端严会把合法 slug
# 报成 ERROR，按铁律 3 直接拦住一个本来能发的包。下划线合法，首字符无限制
# （曾误加过 `[A-Za-z0-9]` 开头约束）。以 CLI 的报错为准，别照直觉猜。
SLUG_RE = r"[A-Za-z0-9_-]+"
MAX_SLUG_BYTES = 64

ATTR_RE = re.compile(
    r"""(?P<attr>\b(?:src|href|poster|data)\s*=\s*)(?P<quote>["'])(?P<url>[^"']+)(?P=quote)""",
    re.I,
)
SRCSET_RE = re.compile(r"""\bsrcset\s*=\s*(?P<quote>["'])(?P<value>[^"']+)(?P=quote)""", re.I)
CSS_URL_RE = re.compile(r"""url\(\s*(?P<quote>["']?)(?P<url>[^'")]+)(?P=quote)\s*\)""", re.I)
# HTML 里 CSS 只在这两处。`url()` 是 CSS 语法，但这条正则带 re.I，拿去扫整份 HTML 会把
# JS 的 `new URL(x)` 当成资源引用：实测两个真实单文件档共报出 37 条假 ERROR（`URL(e)`、
# `URL(row.avatar)`），而 ERROR 会让退出码变 1，按铁律 3 挡下一个其实能发的包。
STYLE_BLOCK_RE = re.compile(r"<style\b[^>]*>(.*?)</style>", re.I | re.S)
STYLE_ATTR_RE = re.compile(r"""\bstyle\s*=\s*(["'])(.*?)\1""", re.I | re.S)
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
SCRIPT_RE = re.compile(r"<script\b[^>]*>(.*?)</script>", re.I | re.S)

# 大文档：此量级起，整份文档的下载时间开始主导首屏，且文档无法被缓存。
# 只报 WARN —— 包能发、审核能过，纯体验问题；且「文档小」推不出「加载快」。
LARGE_DOC_BYTES = 12 * 1024 * 1024
# 内联 payload 有两种装法，都得量：
#   ① 块体里 —— <script type="application/json">…</script>，一块就几十 MB；
#   ② 属性值里 —— <script data="…">，单文件打包器（TurboWarp packager 的 Plain HTML）
#      把 payload 切成成百上千个 80KB 属性块。
# 只量①的话，实测 78.6MB 那个档只能量到 3.4%，等于什么都没定位到。
TAG_OPEN_RE = re.compile(rb"<([a-zA-Z][-\w]*)((?:\s[^>]*)?)>")
INLINE_CLOSE_RE = re.compile(rb"</(?:script|style)\s*>", re.I)
ATTR_VALUE_RE = re.compile(rb"""([-\w:.]+)\s*=\s*(["'])(.*?)\2""", re.S)
# 小于这个的属性值不算 payload（正常属性不会有这个量级）。
ATTR_PAYLOAD_MIN = 4096
# 形态占比低于此值就不给 detail —— 一份 12MB 的档报「0.0% 是某个内联块」只会误导读者
# 去看一个 14 字节的 <script>。
MIN_DETAIL_SHARE = 0.10
# 说得上「打包器产物」要块数确实多。少数几个大属性值是别的东西（比如几张内联大图），
# 处方不同，别按打包器那套给建议。
PACKER_MIN_CHUNKS = 20
# 只取这两个属性做定位标签，且截断 —— payload 内容不出本进程。
BLOCK_LABEL_ATTRS = ("id", "type")
# 属性名和属性值都要截断。名字看着不像内容，但 `[-\w:.]+` 能匹配任意长的一串：
# 实测一个 3000 字符的属性名把报告撑到 3432 字节，等于把包内容写进了报告。
BLOCK_LABEL_MAX = 64

# 频率限制（云存储 / 排行榜按 Toy 共享额度，超限 reject 307044）静态启发式。
# 只报 WARN：限流不会让页面打不开，且下面全是正则近似，压缩产物里必然有误判。
# 有意不写具体阈值——线上值可热更新且不对外公开，这里只查调用形态。
RATE_LIMITED_METHODS = (
    "getCloudStorage",
    "setCloudStorage",
    "removeCloudStorage",
    "submitScore",
    "getRankList",
    "getMyRank",
)
# 方法名是属性访问，压缩后仍保留，所以能命中构建产物。
RATE_LIMITED_CALL_RE = re.compile(
    r"\.\s*(?P<method>" + "|".join(RATE_LIMITED_METHODS) + r")\s*\(",
)
RATE_LIMIT_ERROR_CODE = "307044"
# 「谁包着这个调用」靠反向括号配平找外层 opener，而不是拿固定字符窗口回看——
# 压缩后一行可能极长，平窗口会越过已闭合的块，把隔壁 setInterval 算到自己头上。
ENCLOSER_LOOKBEHIND = 200
MAX_ENCLOSERS = 6
# 每条都锚在 prefix 末尾：construct 头部与 opener 之间只允许回调样板
# （`async () => `、`(k) => ` 之类），不允许跨过 `;` / `{` / `}` 语句边界。
_TAIL = r"[^;{}]*[{(]?\s*$"
POLL_RE = re.compile(r"\bsetInterval\s*\(" + _TAIL)
LOOP_RE = re.compile(
    r"\b(?:for|while)\s*\([^{}]*\)\s*[{(]?\s*$"
    r"|\.\s*(?:forEach|map)\s*\(" + _TAIL,
)
HIGH_FREQ_RE = re.compile(
    r"\brequestAnimationFrame\s*\(" + _TAIL
    + r"""|["'](?:mousemove|pointermove|touchmove|scroll|wheel|drag|keydown|keypress)["']"""
    + _TAIL,
)
# `for(...)await x.setCloudStorage(...)`：循环头后直接跟调用，中间只允许
# 一个 await 和标识符链，不允许语句边界，避免顺着无关代码一路匹配。
BRACELESS_LOOP_RE = re.compile(
    r"\b(?:for|while)\s*\([^{}]*\)\s*(?:await\s+)?[\w$.\[\]]*$",
)


@dataclass
class Finding:
    severity: str
    file: str
    message: str


@dataclass
class InlinePayload:
    """一处内联 payload 的定位信息。只存标签名 / 白名单属性 / 行号 / 体积，不留内容。"""

    tag: str
    label: str
    line: int
    size: int


@dataclass
class DocComposition:
    """一份 HTML 的内联 payload 构成。两个桶互斥（属性只在开标签里量，块体只在标签之间量）。

    属性桶按 (标签, 属性名) 聚合而不是取最大的单个：打包器切出的块每个才 80KB，逐个看
    谁都不显眼（实测 967 个块合计 96%，而同一份文档里一个 base64 `<img src>` 就 0.26MB，
    取最大值会把结论报成 img）。
    """

    body_bytes: int = 0
    largest_body: InlinePayload | None = None
    # (tag, attr) -> [总字节, 块数, 首次出现行号]
    attr_groups: dict[tuple[str, str], list[int]] = field(default_factory=dict)

    def dominant_attr(self) -> tuple[tuple[str, str], list[int]] | None:
        if not self.attr_groups:
            return None
        return max(self.attr_groups.items(), key=lambda kv: kv[1][0])


class Reporter:
    def __init__(self) -> None:
        self.findings: list[Finding] = []

    def error(self, file: str, message: str) -> None:
        self.findings.append(Finding("ERROR", file, message))

    def warn(self, file: str, message: str) -> None:
        self.findings.append(Finding("WARN", file, message))

    @property
    def has_errors(self) -> bool:
        return any(f.severity == "ERROR" for f in self.findings)


class StaticPackage:
    def __init__(self, root: Path, reporter: Reporter) -> None:
        self.root = root
        self.reporter = reporter
        self.is_zip = root.suffix.lower() == ".zip"
        self.is_single_html = root.suffix.lower() in {".html", ".htm"}
        self.files: set[str] = set()
        self.sizes: dict[str, int] = {}
        self._zip: zipfile.ZipFile | None = None
        self._load()

    def close(self) -> None:
        if self._zip:
            self._zip.close()

    def _load(self) -> None:
        if self.is_zip:
            if not self.root.is_file():
                self.reporter.error(str(self.root), "ZIP file does not exist")
                return
            try:
                self._zip = zipfile.ZipFile(self.root)
            except zipfile.BadZipFile:
                self.reporter.error(str(self.root), "not a readable ZIP file")
                return
            for info in self._zip.infolist():
                name = clean_zip_name(info.filename)
                if name and not info.is_dir() and not is_excluded_posix(name):
                    self.files.add(name)
                    # 解压后大小才是浏览器要下的量，压缩后大小与加载体验无关。
                    self.sizes[name] = info.file_size
            return

        if self.is_single_html:
            if not self.root.is_file():
                self.reporter.error(str(self.root), "HTML file does not exist")
                return
            # 单个 HTML 会被 toy CLI 当作包根的 index.html 发布，按此建模：
            # 只有这一个文件，任何相对资源引用都会指向包外（缺失），正合预期。
            # 内容按需读（见 read_bytes）—— 超大单文件档在这里整份进内存会直接吃爆。
            self.files.add("index.html")
            self.sizes["index.html"] = self.root.stat().st_size
            return

        if not self.root.exists():
            self.reporter.error(str(self.root), "path does not exist")
            return
        if not self.root.is_dir():
            self.reporter.error(str(self.root), "path must be a directory, ZIP, or HTML file")
            return
        for path in self.root.rglob("*"):
            if path.is_file():
                rel = path.relative_to(self.root).as_posix()
                if not is_excluded_posix(rel):
                    self.files.add(rel)
                    self.sizes[rel] = path.stat().st_size

    def read_text(self, rel: str) -> str:
        data = self.read_bytes(rel)
        return data.decode("utf-8", errors="replace")

    def read_bytes(self, rel: str) -> bytes:
        if self._zip:
            assert self._zip is not None
            return self._zip.read(rel)
        if self.is_single_html:
            return self.root.read_bytes()
        return (self.root / rel).read_bytes()

    def size_of(self, rel: str) -> int:
        return self.sizes.get(rel, 0)

    def has_file(self, rel: str) -> bool:
        return rel in self.files

    def html_files(self) -> list[str]:
        return sorted(f for f in self.files if f.lower().endswith((".html", ".htm")))

    def css_files(self) -> list[str]:
        return sorted(f for f in self.files if f.lower().endswith(".css"))

    def js_files(self) -> list[str]:
        # 只用于频率限制检查：构建产物里 SDK 调用都在这里，HTML 扫不到。
        # 不对 JS 跑资源引用检查——压缩后的字符串字面量会大量误判。
        return sorted(f for f in self.files if f.lower().endswith((".js", ".mjs")))


def clean_zip_name(name: str) -> str:
    name = name.replace("\\", "/")
    while name.startswith("/"):
        name = name[1:]
    return posixpath.normpath(name) if name and name != "." else ""


def is_excluded_posix(rel: str) -> bool:
    parts = PurePosixPath(rel).parts
    if not parts:
        return True
    for part in parts:
        if part in {"__MACOSX", "node_modules"}:
            return True
        if part.startswith("."):
            return True
    return parts[-1] in {".DS_Store", "toy.yaml"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check Bilibili Toy static package readiness.")
    parser.add_argument("path", help="Static directory, ZIP file, or single HTML file")
    parser.add_argument("--poster", help="Local poster/cover image path")
    parser.add_argument("--require-poster", action="store_true", help="Fail if no poster is provided")
    parser.add_argument("--slug", help="Toy slug to validate")
    parser.add_argument("--require-root-index", action="store_true", help="Require index.html at package root")
    parser.add_argument("--json", action="store_true", help="Emit JSON report")
    return parser.parse_args()


def validate_slug(slug: str | None, reporter: Reporter) -> None:
    """Mirror the CLI's slug rule exactly; anything stricter blocks valid input.

    ERROR here stops the publish, so a local rule tighter than the server's turns
    a publishable package into a hard failure. Underscores are legal and there is
    no first-character restriction. Style preferences stay WARN.
    """
    if not slug:
        return
    if not re.fullmatch(SLUG_RE, slug):
        reporter.error("slug", "slug must match [A-Za-z0-9_-]")
    # 上限按字节而非字符数，与服务端口径一致。
    if len(slug.encode("utf-8")) > MAX_SLUG_BYTES:
        reporter.error("slug", f"slug must be at most {MAX_SLUG_BYTES} bytes")
    if slug.lower() != slug:
        reporter.warn("slug", "lowercase hyphen-case is preferred for shareable Toy URLs")


def validate_index(pkg: StaticPackage, require_root: bool, reporter: Reporter) -> None:
    root_index = "index.html" in {f.lower(): f for f in pkg.files}
    first_level = [
        f for f in pkg.files
        if f.lower().endswith("/index.html") and len(PurePosixPath(f).parts) == 2
    ]

    if require_root and not root_index:
        if first_level:
            reporter.error(".", "script publishing requires index.html at package root; use the first-level child as --dir or repack it")
        else:
            reporter.error(".", "missing root index.html")
        return

    if not root_index:
        if len(first_level) == 1:
            reporter.warn(".", f"index.html is in first-level folder {first_level[0]}; official UI may accept this, CLI script will not")
        elif len(first_level) > 1:
            reporter.error(".", "multiple first-level index.html files found; choose one package root")
        else:
            reporter.error(".", "missing index.html at root or first-level folder")


def block_label(attrs: bytes) -> str:
    """Whitelisted identifying attributes only, truncated."""
    text = attrs.decode("utf-8", errors="replace")
    parts = []
    for name in BLOCK_LABEL_ATTRS:
        match = re.search(rf"""\b{name}\s*=\s*(["'])(.*?)\1""", text, re.I | re.S)
        if match:
            parts.append(f'{name}="{match.group(2)[:BLOCK_LABEL_MAX]}"')
    return " ".join(parts)


def attr_payloads(tag: str, attrs: bytes, line: int, comp: DocComposition) -> None:
    """把开标签里超长的属性值按 (标签, 属性名) 累加。只记属性名和体积，不记值。"""
    if len(attrs) < ATTR_PAYLOAD_MIN:
        return
    for match in ATTR_VALUE_RE.finditer(attrs):
        size = len(match.group(3))
        if size < ATTR_PAYLOAD_MIN:
            continue
        name = match.group(1).decode("ascii", errors="replace").lower()
        key = (tag, name[:BLOCK_LABEL_MAX])
        group = comp.attr_groups.get(key)
        if group is None:
            comp.attr_groups[key] = [size, 1, line]
        else:
            group[0] += size
            group[1] += 1


def scan_document(data: bytes) -> DocComposition:
    """统计内联 payload 的构成。

    Collects tag names, whitelisted attributes, line numbers, and byte sizes only —
    payload bytes are never retained, so package contents stay out of the report.
    Strings and comments are not parsed, so this stays a heuristic: a `>` inside an
    attribute value truncates that tag.
    """
    comp = DocComposition()
    body_end = 0    # 已计入块体的位置，之前的标签都在块里，不再单独看
    line = 1
    counted = 0     # 已数过换行的位置
    for match in TAG_OPEN_RE.finditer(data):
        if match.start() < body_end:
            continue
        line += data.count(b"\n", counted, match.start())
        counted = match.start()
        # 标签名和属性名都截断：`[-\w]*` 没有长度上限（理由见 BLOCK_LABEL_MAX）。
        tag = match.group(1).decode("ascii", errors="replace").lower()[:BLOCK_LABEL_MAX]
        attr_payloads(tag, match.group(2), line, comp)
        # 只有 script/style 的块体才是 payload；别的标签之间是标记和文本。
        if tag not in ("script", "style"):
            continue
        close = INLINE_CLOSE_RE.search(data, match.end())
        if not close:
            continue
        size = close.start() - match.end()
        body_end = close.end()
        comp.body_bytes += size
        if comp.largest_body is None or size > comp.largest_body.size:
            comp.largest_body = InlinePayload(tag, block_label(match.group(2)), line, size)
    return comp


def check_large_document(pkg: StaticPackage, rel: str, reporter: Reporter) -> None:
    """WARN on an oversized HTML document, naming the form the payload takes.

    The size gate is O(1), so the scan only runs for documents already over the line.
    """
    size = pkg.size_of(rel)
    if size < LARGE_DOC_BYTES:
        return
    try:
        comp = scan_document(pkg.read_bytes(rel))
    except Exception:  # noqa: BLE001 — 定位失败不影响体积这条结论
        comp = DocComposition()
    # 哪种形态占主导，按两个桶的**总量**比（同一口径）；报的时候属性桶报聚合、块体桶报
    # 最大那一块（打包器切成上千块，逐块看谁都不显眼；单个巨块则那一块就是全部）。
    detail = ""
    dominant = comp.dominant_attr()
    attr_total = dominant[1][0] if dominant else 0
    if dominant and attr_total >= comp.body_bytes and attr_total / size >= MIN_DETAIL_SHARE:
        (tag, attr), (total, count, line) = dominant
        if count >= PACKER_MIN_CHUNKS:
            what = (
                f'{count} <{tag} {attr}="..."> chunks starting at line {line}, '
                "which is what a single-file packer emits"
            )
        else:
            noun = "value" if count == 1 else "values"
            what = f'{count} oversized <{tag} {attr}="..."> {noun} starting at line {line}'
        detail = f"; {total / size:.1%} of it is {what}"
    elif comp.largest_body and comp.largest_body.size / size >= MIN_DETAIL_SHARE:
        hit = comp.largest_body
        label = f" {hit.label}" if hit.label else ""
        detail = (
            f"; {hit.size / size:.1%} of it is one inline <{hit.tag}>{label} "
            f"starting at line {hit.line}"
        )
    reporter.warn(
        rel,
        f"HTML document is {size / 1048576:.1f} MB{detail}. A document this size is "
        "downloaded in full before anything renders and cannot be cached, so every "
        "visit pays for it. See content-checklist section 8 for the per-tool fix; "
        "never rewrite or move the inline payload by hand.",
    )


def validate_framework_source(pkg: StaticPackage, reporter: Reporter) -> None:
    if "package.json" in pkg.files and any(f.startswith(("src/", "app/", "pages/")) for f in pkg.files):
        reporter.warn(
            ".",
            "package looks like a framework source root; upload the static build output such as dist/build instead",
        )


def is_ignored_url(url: str) -> bool:
    url = url.strip()
    if not url:
        return True
    lower = url.lower()
    return (
        url.startswith("#")
        or lower.startswith(("javascript:", "mailto:", "tel:", "data:", "blob:", "about:"))
        or lower.startswith(("http://", "https://", "//"))
        or "{{" in url
        or "${" in url
    )


# 资源路径长度上界。包内文件名来自文件系统 / zip，不可能有这个量级，所以更长的
# 「路径」只能是误命中：ATTR_RE 的 `data=` 会撞上 JS 里的 const DATA="<base64>"，
# 一条命中吞掉整份文档（实测 17MB 单文件档报出 36MB 报告、内容整段进 stdout）。
# 这类既报不出真问题，又把包内容写进报告，直接不当资源引用看。
MAX_REF_LEN = 512


def clean_ref(url: str) -> str:
    url = url.strip()
    url = url.split("#", 1)[0].split("?", 1)[0]
    return urllib.parse.unquote(url)


def resolve_ref(from_file: str, url: str) -> str:
    cleaned = clean_ref(url)
    base = PurePosixPath(from_file).parent.as_posix()
    if base == ".":
        base = ""
    return posixpath.normpath(posixpath.join(base, cleaned))


def check_local_ref(pkg: StaticPackage, from_file: str, url: str, reporter: Reporter) -> None:
    if is_ignored_url(url):
        return
    if len(url) > MAX_REF_LEN:
        return
    if url.startswith("/"):
        reporter.error(from_file, f"root-relative local resource is unsafe under /toy/<slug>/: {url}")
        return
    target = resolve_ref(from_file, url)
    if target.startswith("../"):
        reporter.warn(from_file, f"resource points outside package root: {url}")
        return
    if target and not pkg.has_file(target):
        reporter.error(from_file, f"referenced local resource not found: {url} -> {target}")


def check_html(pkg: StaticPackage, rel: str, text: str, reporter: Reporter) -> None:
    if not TITLE_RE.search(text):
        reporter.warn(rel, "missing <title>; Toy title cannot be inferred from HTML")

    # 页内锚点 href="#section" 自 render_mode=2「去 base」上线后已支持（浏览器在当前
    # 内容页文档内解析 fragment、正常滚动定位），不再报错。历史上曾因旧 mode=1 注入
    # <base href> 导致纯 # 被解析成跨域跳转而失效，去 base 后修复。

    for pattern in ("location.hash", "history.pushState", "history.replaceState"):
        if pattern in text:
            reporter.warn(rel, f"URL mutation may break Toy navigation or sharing: {pattern}")

    if re.search(r"""(?:window\.)?location(?:\.href)?\s*=\s*["']/""", text):
        reporter.error(rel, "root-relative JavaScript navigation found; build a full Toy URL or use relative paths")

    for match in ATTR_RE.finditer(text):
        attr = match.group("attr").split("=", 1)[0].strip().lower()
        url = match.group("url").strip()

        if attr in {"src", "href", "poster", "data"}:
            check_local_ref(pkg, rel, url, reporter)

    for match in SRCSET_RE.finditer(text):
        for candidate in match.group("value").split(","):
            url = candidate.strip().split(" ", 1)[0]
            check_local_ref(pkg, rel, url, reporter)

    # 只在 CSS 出现的地方找 url()，别扫整份 HTML（理由见 STYLE_BLOCK_RE）。
    for pattern, group in ((STYLE_BLOCK_RE, 1), (STYLE_ATTR_RE, 2)):
        for fragment in pattern.finditer(text):
            for match in CSS_URL_RE.finditer(fragment.group(group)):
                check_local_ref(pkg, rel, match.group("url"), reporter)


def check_css(pkg: StaticPackage, rel: str, text: str, reporter: Reporter) -> None:
    for match in CSS_URL_RE.finditer(text):
        check_local_ref(pkg, rel, match.group("url"), reporter)


def enclosing_prefixes(text: str, pos: int) -> list[str]:
    """Text right before each unclosed `(`/`{` that still encloses `pos`.

    Walks backward keeping a paren/brace balance so an already-closed block does
    not get credited with enclosing the call. String and comment contents are not
    parsed, so this stays a heuristic.
    """
    prefixes: list[str] = []
    depth = 0
    i = pos - 1
    while i >= 0 and len(prefixes) < MAX_ENCLOSERS:
        char = text[i]
        if char in ")}]":
            depth += 1
        elif char in "({[":
            if depth == 0:
                prefixes.append(text[max(0, i - ENCLOSER_LOOKBEHIND):i + 1])
            else:
                depth -= 1
        i -= 1
    return prefixes


def check_rate_limits(rel: str, text: str, reporter: Reporter) -> bool:
    """Flag call shapes that burn a Toy's shared cloud-storage/leaderboard quota.

    Returns whether any rate-limited SDK call was seen at all, so the caller can
    decide if the package needs 307044 handling.
    """
    calls = list(RATE_LIMITED_CALL_RE.finditer(text))
    if not calls:
        return False

    seen: set[tuple[str, str]] = set()
    for match in calls:
        method = match.group("method")
        prefixes = enclosing_prefixes(text, match.start())
        # 无花括号的单语句循环体（压缩产物常见：`for(...)await x.setCloudStorage(...)`）
        # 没有未闭合的 opener，配平找不到它，用紧邻调用点的一小段单独判。
        # 这段不并进 prefixes——平窗口喂给 poll / 高频式会把隔壁已闭合的块算进来。
        immediate = text[max(0, match.start() - ENCLOSER_LOOKBEHIND):match.start()]
        braceless_loop = bool(BRACELESS_LOOP_RE.search(immediate))

        for label, hit, hint in (
            (
                "poll",
                any(POLL_RE.search(p) for p in prefixes),
                "polling burns the quota even when nothing changed; cache the result and refresh on user action",
            ),
            (
                "loop",
                braceless_loop or any(LOOP_RE.search(p) for p in prefixes),
                "pass multiple keys to one call instead of looping per key",
            ),
            (
                "high-frequency handler",
                any(HIGH_FREQ_RE.search(p) for p in prefixes),
                "keep state in memory and persist only at checkpoints such as settle, level end, or page hide",
            ),
        ):
            if hit and (method, label) not in seen:
                seen.add((method, label))
                reporter.warn(
                    rel,
                    f"{method} appears inside a {label}; {hint} "
                    f"(cloud storage and leaderboard quota is shared by all players of one Toy)",
                )
    return True


def check_rate_limit_handling(uses_rate_limited: bool, handles_error: bool, reporter: Reporter) -> None:
    if uses_rate_limited and not handles_error:
        reporter.warn(
            ".",
            f"cloud storage or leaderboard calls found but no reference to rate-limit code {RATE_LIMIT_ERROR_CODE}; "
            "on reject, tell the code apart from other errors and retry with backoff instead of retrying immediately",
        )


def check_contenthash(pkg: "StaticPackage", reporter: Reporter) -> None:
    """建议产物文件名带内容指纹，使更新时未变资源可被复用。

    纯建议：不带指纹照样能发、能访问，只是每次更新都让访客重新下载全部资源。
    只报一条 WARN（不按文件逐条刷），资源太少的包直接跳过——单文件 Toy、
    小 demo 本来就没什么可复用的，提示只会变噪音。
    """
    assets = [
        rel
        for rel in pkg.js_files() + pkg.css_files()
        if not rel.lower().endswith((".min.js", ".min.css"))
    ]
    # 少于 2 个资源时更新也几乎不重传，不值得提示。
    if len(assets) < 2:
        return
    # 指纹判据：文件名里出现「分隔符 + 含数字或 _- 的字母数字串」。
    # 要求必须含数字或分隔符，是为了把 components.js、application.css
    # 这类纯单词名排除掉，只认 index-Ct-l33m_.js / app.a1b2c3.js 这种。
    fingerprint = re.compile(r"[-._][A-Za-z0-9_-]*[0-9_-][A-Za-z0-9_-]*\.(?:js|css)$")
    if any(fingerprint.search(PurePosixPath(rel).name) for rel in assets):
        return
    reporter.warn(
        ".",
        f"{len(assets)} 个 JS/CSS 产物的文件名都不含内容指纹（形如 assets/index-Ct-l33m_.js）；"
        "每次更新访客都要重新下载全部资源。多数构建工具默认已开启："
        "Vite 开箱即用，webpack 配 output.filename '[name].[contenthash].js'。"
        "仅为建议，不影响本次发布",
    )


def image_dimensions(path: Path) -> tuple[int, int] | None:
    data = path.read_bytes()
    if len(data) >= 24 and data.startswith(PNG_SIGNATURE):
        return struct.unpack(">II", data[16:24])
    if data.startswith(JPG_SOI):
        return jpeg_dimensions(data)
    return None


def jpeg_dimensions(data: bytes) -> tuple[int, int] | None:
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        i += 2
        if marker in {0xD8, 0xD9}:
            continue
        if i + 2 > len(data):
            return None
        length = int.from_bytes(data[i:i + 2], "big")
        if length < 2 or i + length > len(data):
            return None
        if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
            height = int.from_bytes(data[i + 3:i + 5], "big")
            width = int.from_bytes(data[i + 5:i + 7], "big")
            return width, height
        i += length
    return None


def validate_poster(poster: str | None, require: bool, reporter: Reporter) -> None:
    if not poster:
        if require:
            reporter.error("poster", "poster is required for create")
        return
    path = Path(poster).expanduser()
    if not path.is_file():
        reporter.error("poster", f"poster file does not exist: {path}")
        return
    if path.suffix.lower() not in {".png", ".jpg", ".jpeg"}:
        reporter.error("poster", "official guide supports poster formats .png, .jpg, .jpeg")
        return
    dims = image_dimensions(path)
    if dims is None:
        reporter.warn("poster", "could not read poster dimensions")
        return
    width, height = dims
    if height <= 0:
        reporter.error("poster", "poster has invalid height")
        return
    ratio = width / height
    if height > width:
        reporter.warn("poster", f"portrait poster may crop poorly in Toy cards: {width}x{height}")
    if abs(ratio - COVER_RATIO) > COVER_RATIO_TOLERANCE:
        reporter.warn("poster", f"4:3 landscape cover is preferred; found {width}x{height}")


def run_checks(args: argparse.Namespace) -> Reporter:
    reporter = Reporter()
    root = Path(args.path).expanduser().resolve()
    validate_slug(args.slug, reporter)
    validate_poster(args.poster, args.require_poster, reporter)

    pkg = StaticPackage(root, reporter)
    try:
        if not reporter.has_errors:
            validate_index(pkg, args.require_root_index, reporter)
            validate_framework_source(pkg, reporter)
            uses_rate_limited = False
            handles_rate_limit_error = False
            for rel in pkg.html_files():
                try:
                    # 体积闸门是 O(1)，绝大多数包到这里就返回了，不会读文件。
                    check_large_document(pkg, rel, reporter)
                    text = pkg.read_text(rel)
                    check_html(pkg, rel, text, reporter)
                    # 内联 <script> 里的 SDK 调用：单文件 Toy 全在这里。
                    for script in SCRIPT_RE.finditer(text):
                        body = script.group(1)
                        uses_rate_limited |= check_rate_limits(rel, body, reporter)
                        handles_rate_limit_error |= RATE_LIMIT_ERROR_CODE in body
                except Exception as exc:  # noqa: BLE001
                    reporter.error(rel, f"failed to inspect HTML: {exc}")
            for rel in pkg.css_files():
                try:
                    check_css(pkg, rel, pkg.read_text(rel), reporter)
                except Exception as exc:  # noqa: BLE001
                    reporter.error(rel, f"failed to inspect CSS: {exc}")
            for rel in pkg.js_files():
                try:
                    text = pkg.read_text(rel)
                    uses_rate_limited |= check_rate_limits(rel, text, reporter)
                    handles_rate_limit_error |= RATE_LIMIT_ERROR_CODE in text
                except Exception as exc:  # noqa: BLE001
                    reporter.warn(rel, f"failed to inspect JavaScript: {exc}")
            check_rate_limit_handling(uses_rate_limited, handles_rate_limit_error, reporter)
            check_contenthash(pkg, reporter)
    finally:
        pkg.close()
    return reporter


def emit_report(reporter: Reporter, as_json: bool) -> int:
    if as_json:
        payload = {
            "ok": not reporter.has_errors,
            "findings": [finding.__dict__ for finding in reporter.findings],
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        for finding in reporter.findings:
            print(f"{finding.severity}: {finding.file}: {finding.message}")
        if reporter.has_errors:
            print(f"FAILED: {sum(1 for f in reporter.findings if f.severity == 'ERROR')} error(s)")
        else:
            warn_count = sum(1 for f in reporter.findings if f.severity == "WARN")
            print(f"OK: Toy static checks passed with {warn_count} warning(s)")
    return 1 if reporter.has_errors else 0


def main() -> int:
    args = parse_args()
    reporter = run_checks(args)
    return emit_report(reporter, args.json)


if __name__ == "__main__":
    raise SystemExit(main())
