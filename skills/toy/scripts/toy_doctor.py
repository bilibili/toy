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
from dataclasses import dataclass
from pathlib import Path, PurePosixPath


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPG_SOI = b"\xff\xd8"
COVER_RATIO = 4 / 3
COVER_RATIO_TOLERANCE = 0.08

ATTR_RE = re.compile(
    r"""(?P<attr>\b(?:src|href|poster|data)\s*=\s*)(?P<quote>["'])(?P<url>[^"']+)(?P=quote)""",
    re.I,
)
SRCSET_RE = re.compile(r"""\bsrcset\s*=\s*(?P<quote>["'])(?P<value>[^"']+)(?P=quote)""", re.I)
CSS_URL_RE = re.compile(r"""url\(\s*(?P<quote>["']?)(?P<url>[^'")]+)(?P=quote)\s*\)""", re.I)
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)


@dataclass
class Finding:
    severity: str
    file: str
    message: str


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
        self._single_text: str | None = None
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
            return

        if self.is_single_html:
            if not self.root.is_file():
                self.reporter.error(str(self.root), "HTML file does not exist")
                return
            # 单个 HTML 会被 toy CLI 当作包根的 index.html 发布，按此建模：
            # 只有这一个文件，任何相对资源引用都会指向包外（缺失），正合预期。
            data = self.root.read_bytes()
            self._single_text = data.decode("utf-8", errors="replace")
            self.files.add("index.html")
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

    def read_text(self, rel: str) -> str:
        if self._single_text is not None:
            return self._single_text
        data = self.read_bytes(rel)
        return data.decode("utf-8", errors="replace")

    def read_bytes(self, rel: str) -> bytes:
        if self._zip:
            assert self._zip is not None
            return self._zip.read(rel)
        if self.is_single_html:
            return self.root.read_bytes()
        return (self.root / rel).read_bytes()

    def has_file(self, rel: str) -> bool:
        return rel in self.files

    def html_files(self) -> list[str]:
        return sorted(f for f in self.files if f.lower().endswith((".html", ".htm")))

    def css_files(self) -> list[str]:
        return sorted(f for f in self.files if f.lower().endswith(".css"))


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
    if not slug:
        return
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]*", slug):
        reporter.error("slug", "slug must contain only letters, numbers, and hyphens, and start with a letter or number")
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

    for match in CSS_URL_RE.finditer(text):
        check_local_ref(pkg, rel, match.group("url"), reporter)


def check_css(pkg: StaticPackage, rel: str, text: str, reporter: Reporter) -> None:
    for match in CSS_URL_RE.finditer(text):
        check_local_ref(pkg, rel, match.group("url"), reporter)


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
            for rel in pkg.html_files():
                try:
                    check_html(pkg, rel, pkg.read_text(rel), reporter)
                except Exception as exc:  # noqa: BLE001
                    reporter.error(rel, f"failed to inspect HTML: {exc}")
            for rel in pkg.css_files():
                try:
                    check_css(pkg, rel, pkg.read_text(rel), reporter)
                except Exception as exc:  # noqa: BLE001
                    reporter.error(rel, f"failed to inspect CSS: {exc}")
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
