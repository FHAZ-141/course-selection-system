#!/usr/bin/env node
'use strict';

/**
 * 生成「提交材料」目录
 *
 * 为什么用脚本而不是手工复制：
 *   交付文档的**唯一来源**是 docs/。若手工把文件复制到提交目录，
 *   改一处文档就要记得同步两遍，迟早不一致。这里每次全量重建，
 *   并在 README 里写明"本目录由脚本生成，勿直接编辑"。
 *
 * 用法：npm run pack:submission
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'docs');
const DEST = path.join(ROOT, '提交材料');
const DIAGRAM_DEST = path.join(DEST, 'diagrams');

/** 需要打包的文档（按提交阅读顺序） */
const DOCS = [
  { file: '00-需求确认清单.md', desc: '需求基线：24 项决策 + 9 条推导规则 + 11 项功能范围' },
  { file: '01-需求规格说明书.md', desc: '12 条功能需求（FR-00~FR-11），每条含可测的验收标准' },
  { file: '02-概要设计说明书.md', desc: '分层架构、模块划分、关键设计决策、部署结构' },
  { file: '03-详细设计说明书.md', desc: '类设计、4 个关键算法、6 张动态行为图、界面设计与错误码' },
  { file: '04-数据库设计文档.md', desc: 'ER 图、7 张表逐字段说明、约束与索引、容量估算' },
  { file: '05-测试用例与测试报告.md', desc: '118 条用例与实测结果、9 个缺陷记录、覆盖率分析与未覆盖项' },
  { file: '06-项目总结报告.md', desc: '开发过程回顾、技术难点、问题与教训、不足与改进方向' }
];

/** 需要打包的图表（每张含 .mmd 源文件 + .png + .svg） */
const DIAGRAMS = [
  { name: 'use-case', code: 'U1', title: '用例图', where: 'D1 第三节' },
  { name: 'class-diagram', code: 'U2', title: '类图', where: 'D2 第 4.2 节' },
  { name: 'architecture-layers', code: '—', title: '分层架构图', where: 'D2 第 3.1 节' },
  { name: 'sequence-select-course', code: 'U3', title: '选课时序图', where: 'D3 第 4.1 节' },
  { name: 'sequence-drop-course', code: 'U4', title: '退课时序图', where: 'D3 第 4.2 节' },
  { name: 'activity-conflict-check', code: 'U5', title: '冲突校验活动图', where: 'D3 第 4.3 节' },
  { name: 'activity-promote-waitlist', code: '—', title: '候补补位活动图', where: 'D3 第 4.4 节' },
  { name: 'state-course-selection', code: 'U6', title: '选课记录状态图', where: 'D3 第 4.5 节' },
  { name: 'ui-sitemap', code: '—', title: '界面导航图', where: 'D3 第 5.1 节' },
  { name: 'er-diagram', code: 'U7', title: '数据库 ER 图', where: 'D4 第三节' }
];

/** 尚未产出的交付物，在 README 里如实标注（全部完成后为空数组） */
const PENDING = [];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(from, to) {
  const size = fs.statSync(from).size;
  fs.copyFileSync(from, to);
  return size;
}

function main() {
  // 全量重建，避免旧文件残留
  fs.rmSync(DEST, { recursive: true, force: true });
  ensureDir(DIAGRAM_DEST);

  const report = { docs: [], diagrams: [], totalBytes: 0 };

  for (const doc of DOCS) {
    const from = path.join(SRC, doc.file);
    if (!fs.existsSync(from)) {
      console.warn(`  ⚠️ 跳过（源文件不存在）：${doc.file}`);
      continue;
    }
    const bytes = copyFile(from, path.join(DEST, doc.file));
    report.docs.push({ ...doc, bytes });
    report.totalBytes += bytes;
  }

  for (const d of DIAGRAMS) {
    const copied = [];
    for (const ext of ['.mmd', '.png', '.svg']) {
      const from = path.join(SRC, 'diagrams', d.name + ext);
      if (!fs.existsSync(from)) continue;
      const bytes = copyFile(from, path.join(DIAGRAM_DEST, d.name + ext));
      copied.push(ext);
      report.totalBytes += bytes;
    }
    if (copied.length > 0) report.diagrams.push({ ...d, exts: copied });
  }

  fs.writeFileSync(path.join(DEST, 'README.md'), buildReadme(report), 'utf-8');

  console.log(`\n已生成：${path.relative(ROOT, DEST)}`);
  console.log(`  文档 ${report.docs.length} 份，图表 ${report.diagrams.length} 组，` +
    `合计约 ${(report.totalBytes / 1024).toFixed(0)} KB`);
  console.log('\n文档清单：');
  report.docs.forEach((d) => console.log(`  · ${d.file}`));
  console.log('\n图表清单：');
  report.diagrams.forEach((d) => console.log(`  · [${d.code}] ${d.title}（${d.exts.join(' ')}）`));
  console.log();
}

function buildReadme(report) {
  const today = new Date().toISOString().slice(0, 10);
  const version = require(path.join(ROOT, 'package.json')).version;

  const docRows = report.docs
    .map((d) => `| \`${d.file}\` | ${d.desc} | ${(d.bytes / 1024).toFixed(0)} KB |`)
    .join('\n');

  const figRows = report.diagrams
    .map((d) => `| ${d.code} | ${d.title} | \`diagrams/${d.name}.png\` | ${d.where} |`)
    .join('\n');

  const pendingRows = PENDING.length
    ? PENDING.map(([code, name]) => `| ${code} | ${name} | ⬜ 待产出 |`).join('\n')
    : '| — | 全部 14 项交付物均已产出 | ✅ |';

  return `# 提交材料

> **本目录由 \`npm run pack:submission\` 自动生成，请勿直接编辑。**
> 修改内容请改 \`docs/\` 下的源文件，然后重新执行该命令。

| 项目 | 内容 |
| --- | --- |
| 项目名称 | 高校选课系统 |
| 代码版本 | v${version} |
| 生成日期 | ${today} |
| 仓库地址 | <https://github.com/FHAZ-141/course-selection-system> |

---

## 一、文档清单

| 文件 | 内容 | 大小 |
| --- | --- | --- |
${docRows}

**建议阅读顺序**：需求确认清单 → 需求规格说明书 → 概要设计说明书 → 详细设计说明书 → 数据库设计文档。
第一份是"为什么这么定"，后面依次是"要做成什么"、"整体怎么搭"、"每个类怎么实现"、"数据怎么存"。

## 二、图表清单

| 编号 | 图表 | 文件 | 所在文档 |
| --- | --- | --- | --- |
${figRows}

每张图均提供三种文件：

- \`.png\`：2 倍分辨率位图，可直接插入 Word / PPT
- \`.svg\`：矢量图，放大不失真，Word 2016+ 支持直接插入
- \`.mmd\`：Mermaid 源文件，可修改后重新导出（导出方法见仓库 \`docs/diagrams/README.md\`）

![用例图](diagrams/use-case.png)

![类图](diagrams/class-diagram.png)

![选课时序图](diagrams/sequence-select-course.png)

![数据库 ER 图](diagrams/er-diagram.png)

## 三、交付物完成情况

| 编号 | 名称 | 状态 |
| --- | --- | --- |
${pendingRows}

> 完整清单含 6 份文档（D0~D6 中除 D0 外的正文）与 7 张 UML 图（U1~U7），
> 另有 3 张辅助图（分层架构、补位活动、界面导航）。

## 四、运行方式

拿到本目录所在的项目压缩包后：

1. 安装 Node.js 20 或以上（<https://nodejs.org>）
2. 双击项目根目录的 \`start.bat\`
3. 浏览器会自动打开 <http://localhost:3000>

演示账号（密码均为 \`123456\`）：\`admin\` 管理员、\`T1001\` 教师、\`2024010101\` 学生

详细步骤见项目根目录的 \`README.md\` 与 \`PROGRESS.md\`。
`;
}

main();
