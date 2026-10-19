# UML 图表目录

本目录存放**软件工程文档的 UML 图表**，源文件与导出图片一并提交。

## 一、产出清单

| 编号 | 图表 | 源文件 | 导出图片 | 状态 |
| --- | --- | --- | --- | --- |
| U7 | ER 图 | `er-diagram.mmd` | `er-diagram.png` / `.svg` | ✅ 已产出 |
| U1 | 用例图 | `use-case.mmd` | `use-case.png` / `.svg` | ✅ 已产出 |
| U2 | 类图 | `class-diagram.mmd` | `class-diagram.png` / `.svg` | ✅ 已产出 |
| U3 | 选课时序图 | `sequence-select-course.mmd` | 同名 `.png` / `.svg` | ✅ 已产出 |
| U4 | 退课时序图 | `sequence-drop-course.mmd` | 同名 `.png` / `.svg` | ✅ 已产出 |
| U5 | 冲突校验活动图 | `activity-conflict-check.mmd` | 同名 `.png` / `.svg` | ✅ 已产出 |
| U6 | 选课记录状态图 | `state-course-selection.mmd` | 同名 `.png` / `.svg` | ✅ 已产出 |
| — | 分层架构图（D2 用） | `architecture-layers.mmd` | 同名 `.png` / `.svg` | ✅ 已产出 |
| — | 候补补位活动图（D3 用） | `activity-promote-waitlist.mmd` | 同名 `.png` / `.svg` | ✅ 已产出 |
| — | 界面导航图（D3 用） | `ui-sitemap.mmd` | 同名 `.png` / `.svg` | ✅ 已产出 |
| U3 | 选课时序图 | `sequence-select-course.mmd` | `sequence-select-course.png` | 待产出 |
| U4 | 退课时序图 | `sequence-drop-course.mmd` | `sequence-drop-course.png` | 待产出 |
| U5 | 冲突校验活动图 | `activity-conflict-check.mmd` | `activity-conflict-check.png` | 待产出 |
| U6 | 选课记录状态图 | `state-course-selection.mmd` | `state-course-selection.png` | 待产出 |

---

## 二、为什么用 Mermaid

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| **Mermaid**（采用） | 纯文本、可版本控制、可 diff；GitHub / VS Code 原生渲染；与 Markdown 文档同源 | 布局自动化，精细排版能力弱于手工绘图 |
| PlantUML | 表达力强、图形规范 | 依赖 Java 运行时（**本机未安装**） |
| draw.io / Visio 手绘 | 排版最自由 | 二进制源文件无法 diff，改一处要重画 |

---

## 三、如何渲染

### 3.1 直接在 Markdown 里看

装了 Markdown 预览插件的 VS Code、或 GitHub 网页端，会直接渲染 `.mmd` 或文档中内嵌的代码块。

### 3.2 导出为 PNG / SVG（推荐 mermaid-cli）

```bash
npx @mermaid-js/mermaid-cli -i docs/diagrams/er-diagram.mmd \
    -o docs/diagrams/er-diagram.png -w 2400 -b white
```

### 3.3 备用方案：`render_mermaid.py`（本机无 Java / 无 mermaid-cli 时）

本机环境装不了 mermaid-cli（网络不稳），但装了 Chrome。该脚本用 Chrome 无头模式做两件事：
先加载 mermaid.js 把源码渲染成 SVG，再把 SVG 截图为 2 倍分辨率 PNG。

```bash
# 前置：准备 mermaid 运行时（只需一次）
mkdir -p "$TEMP/mmd"
curl -sSL -o "$TEMP/mmd/mermaid.min.js" \
  https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js

# 渲染
python docs/diagrams/render_mermaid.py docs/diagrams/er-diagram.mmd docs/diagrams
```

**踩过的坑（脚本里已处理）**：

| 现象 | 原因 | 对策 |
| --- | --- | --- |
| `ERR_FILE_NOT_FOUND` | 传给 Chrome 的是相对路径 | 必须用**绝对路径** |
| 图片右/下边缘出现滚动条 | 视口尺寸与图形尺寸完全相等时 Chrome 会画滚动条 | 窗口尺寸比图形多留 24px |
| `width="100%"` 导致截图尺寸不对 | Mermaid 默认 `useMaxWidth: true` | 改为按 `viewBox` 取绝对尺寸 |

> 脚本会把 SVG 与 PNG 一并写入指定目录，并在终端打印两者尺寸，便于核对。

---

## 四、约定

1. **图与文对应**：每张图在对应文档（D1~D4）中至少被引用一次，且图与正文描述一致。
2. **改了数据模型或流程，必须重画对应图**，并在同一提交里更新。
3. 图里的标识符用**英文**（与代码一致），中文说明放在字段注释或图例中。
4. 导出图片用 **2 倍分辨率**，保证打印与投影清晰。
