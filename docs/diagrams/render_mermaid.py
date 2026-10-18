"""把 docs/diagrams/er-diagram.mmd 渲染成 SVG 与 PNG。

思路：本机没有 Java/PlantUML，也装不上 mermaid-cli（网络不稳），
但装有 Chrome。于是用 Chrome 无头模式承担两件事：
  1) 跑 mermaid.js 把 Mermaid 源码渲染成 SVG（--dump-dom）
  2) 把 SVG 截图为 PNG（--screenshot，窗口尺寸取自 SVG 的 viewBox）

用法：python render_mermaid.py <mmd文件> <输出目录>
"""

import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

# 浏览器：可用 CHROME_PATH 环境变量覆盖；默认按 Chrome → Edge 顺序探测
CHROME_CANDIDATES = [
    os.environ.get("CHROME_PATH", ""),
    r"C:/Program Files/Google/Chrome/Application/chrome.exe",
    r"C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    r"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    r"C:/Program Files/Microsoft/Edge/Application/msedge.exe",
]
CHROME = next((p for p in CHROME_CANDIDATES if p and Path(p).exists()), "")

# mermaid 运行时：可用 MERMAID_JS 环境变量覆盖
MERMAID_JS = os.environ.get(
    "MERMAID_JS",
    str(Path(tempfile.gettempdir()) / "mmd" / "mermaid.min.js"),
)


def strip_comments(text: str) -> str:
    return "\n".join(line for line in text.splitlines() if not line.strip().startswith("%%"))


def run_chrome(args, timeout=120):
    cmd = [
        CHROME,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--no-first-run",
        "--disable-extensions",
        "--default-background-color=FFFFFFFF",
        *args,
    ]
    return subprocess.run(cmd, capture_output=True, timeout=timeout)


def main():
    if not CHROME:
        print("❌ 未找到 Chrome/Edge，请设置环境变量 CHROME_PATH 指向浏览器可执行文件")
        return 1
    if not Path(MERMAID_JS).exists():
        print(f"❌ 未找到 mermaid 运行时：{MERMAID_JS}")
        print("   请先下载：")
        print('   curl -sSL -o "<路径>/mermaid.min.js" \\')
        print("     https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js")
        return 1

    mmd_path = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    stem = mmd_path.stem
    source = strip_comments(mmd_path.read_text(encoding="utf-8")).strip()

    work = Path(tempfile.mkdtemp(prefix="mmd-render-"))
    html_path = work / "diagram.html"
    html_path.write_text(
        "<!DOCTYPE html><html lang='zh-CN'><head><meta charset='utf-8'>"
        "<style>body{margin:0;padding:24px;background:#ffffff;}"
        "</style></head><body>"
        f"<pre class='mermaid'>{source}</pre>"
        f"<script src='file:///{MERMAID_JS}'></script>"
        "<script>mermaid.initialize({startOnLoad:true,theme:'default',"
        "er:{layoutDirection:'TB',minEntityWidth:120,minEntityHeight:60,"
        "entityPadding:14,useMaxWidth:false},"
        "flowchart:{useMaxWidth:false}});</script>"
        "</body></html>",
        encoding="utf-8",
    )

    # 1) 渲染并导出 DOM
    result = run_chrome(["--virtual-time-budget=15000", "--window-size=2600,2200",
                         "--dump-dom", f"file:///{html_path.as_posix()}"])
    dom = result.stdout.decode("utf-8", "replace")
    if "<svg" not in dom:
        print("❌ Chrome 未渲染出 SVG，DOM 前 500 字符：")
        print(dom[:500])
        return 1

    start = dom.index("<svg")
    end = dom.rindex("</svg>") + len("</svg>")
    svg = dom[start:end]

    # 2) 规整尺寸：Mermaid 常输出 width="100%"，改为按 viewBox 的绝对尺寸
    vb = re.search(r'viewBox="([\d.\-\s]+)"', svg)
    if not vb:
        print("❌ 未找到 viewBox")
        return 1
    vb_parts = [float(x) for x in vb.group(1).replace(",", " ").split()]
    _, _, vw, vh = vb_parts

    svg = re.sub(r'\swidth="[^"]*"', "", svg, count=1)
    svg = re.sub(r'\sheight="[^"]*"', "", svg, count=1)
    svg = svg.replace(
        "<svg",
        f'<svg width="{vw:.0f}" height="{vh:.0f}"',
        1,
    )
    if "xmlns=" not in svg[:400]:
        svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1)

    # 白色背景板，避免 PNG 透明
    svg = svg.replace(
        ">",
        f'><rect x="0" y="0" width="{vw:.0f}" height="{vh:.0f}" fill="#ffffff"/>',
        1,
    )

    svg_path = out_dir / f"{stem}.svg"
    svg_path.write_text(svg, encoding="utf-8")
    print(f"✅ SVG: {svg_path}  ({svg_path.stat().st_size} 字节, {vw:.0f}x{vh:.0f})")

    # 3) 截图为 PNG（2 倍分辨率，便于放进报告）
    #    窗口比图形多留 24px：视口与内容严丝合缝时 Chrome 会画出滚动条，截进图里很难看
    scale = 2
    pad = 24
    png_path = (out_dir / f"{stem}.png").resolve()
    shot = run_chrome([
        f"--force-device-scale-factor={scale}",
        f"--window-size={int(vw) + pad},{int(vh) + pad}",
        f"--screenshot={png_path.as_posix()}",
        f"file:///{svg_path.resolve().as_posix()}",   # 必须绝对路径，否则 Chrome 报 ERR_FILE_NOT_FOUND
    ])
    if not png_path.exists():
        print("❌ PNG 未生成：", shot.stderr.decode("utf-8", "replace")[:400])
        return 1
    data = png_path.read_bytes()
    w = int.from_bytes(data[16:20], "big")
    h = int.from_bytes(data[20:24], "big")
    print(f"✅ PNG: {png_path}  ({len(data)} 字节, {w}x{h} 像素)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
