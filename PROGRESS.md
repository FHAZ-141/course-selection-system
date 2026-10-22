# 项目进度台账

> **用途**：记录"做到哪一步、下一步做什么、怎么接着做"，保证隔一段时间回来（或换人接手）能立即续上。
> **最后更新**：2026-10-22 17:30
> **维护约定**：每完成一个交付物就更新本文件，与代码同一次提交。

---

## 一、当前状态快照

| 项目 | 状态 |
| --- | --- |
| 代码版本 | **v0.3.0**（功能完整 + 数据库迁移到 PostgreSQL） |
| 最新提交 | 以 `git log --oneline -1` 为准 |
| 标签 | `v0.0.1`（初始化）、`v0.1.0`（骨架）、`v0.2.0`（全功能）、`v0.2.1`（文档 + 一键启动器）、**`v0.3.0`（PostgreSQL 迁移）** |
| 提交总数 | 53 |
| 远端仓库 | <https://github.com/FHAZ-141/course-selection-system>（**公开**） |
| 代码规模 | 4,795 行（`src` 27 个 JS / 3,308 行 + `views` 21 个 EJS / 1,487 行） |
| 文档规模 | 8,328 行 / 29 个 Markdown（含开发者文档与模块说明，不含 `提交材料/`） |
| 自动化测试 | SQLite 模式 **118 项**（冒烟 77 + 并发 15 + 冲突单元 26）；PostgreSQL 模式冒烟 77 + 并发 15×3 轮 |
| 交付文档进度 | **14 / 14**（文档 D0~D6 全部完成；图表 U1~U7 全部完成，另有 3 张辅助图） |

---

## 二、已完成

### 2.1 代码（v0.3.0，功能完整）

| 分层 | 文件 | 说明 |
| --- | --- | --- |
| 入口 | `src/server.js`、`src/app.js`、`src/config.js` | 启动、装配、配置 |
| 数据层（5） | `db/index.js`（驱动分发）、`db/sqlite.js`、`db/pg.js`、`schema.sql` + `schema.pg.sql`、`seed.js` | 双驱动、两套 schema、两库通用的演示数据 |
| 服务层（9） | `courseService`、`classTimeService`、`conflictService`、`windowService`、`enrollmentService`、`announcementService`、`adminService`、`teacherService`、`password` | 业务规则全部集中在此层 |
| 路由层（8） | `index`、`auth`、`courses`、`enrollments`、`announcements`、`admin`、`teacher`、`_placeholder` | 取参→调服务→渲染 |
| 中间件 | `middleware/auth.js` | 登录、角色鉴权、flash 提示 |
| 工具 | `utils/format.js`、`utils/url.js`、`utils/password.js` | 格式化、路径安全、口令 |
| 视图 | `views/` 21 个 EJS + `public/css/style.css` + `public/js/admin-course.js` | 学生端 4 + 教师端 4 + 管理端 6 + 公共 |

**功能覆盖**：需求基线 `§2.1` 的 11 项全部实现（6 项核心功能 + 候补队列 + 公告 + 选课窗口配置 + 并发压测脚本 + 教师端冲突提示）。

### 2.2 测试

| 脚本 | 命令 | 数量 | 前提 |
| --- | --- | --- | --- |
| 接口冒烟 | `npm run smoke` | 77 | 服务已启动 |
| 并发与规则 | `npm run stress` | 15 | 自带临时库，无需启动服务 |
| 冲突判定单元 | `npm run test:conflict` | 26 | 纯函数，无依赖 |

**关键结论**：10 名学生并发抢容量 3 的课程 → 实际选中 3 人、候补 3 人，**容量未被突破**。

### 2.3 已完成的交付文档

| 编号 | 文档 | 位置 | 规模 |
| --- | --- | --- | --- |
| D0 | 需求确认清单 | `docs/00-需求确认清单.md` | 需求基线（A/B/C/D/E/F 组 + R1~R9 + §2.1 功能范围） |
| D1 | 需求规格说明书 | `docs/01-需求规格说明书.md` | 721 行，8 章 + 附录；12 条功能需求（FR-00~FR-11）各含前置/主流程/异常/验收标准 |
| D2 | 概要设计说明书 | `docs/02-概要设计说明书.md` | 分层架构、模块划分与依赖规则、6 项关键决策、部署结构 |
| D3 | 详细设计说明书 | `docs/03-详细设计说明书.md` | 类设计与方法表、4 个关键算法伪代码、6 张动态行为图、界面要素、错误码总表 |
| D5 | 测试用例与测试报告 | `docs/05-测试用例与测试报告.md` | 118 条用例（TC-U/I/E）与实测结果、9 个缺陷记录、覆盖率分析、6 项未覆盖 |
| D6 | 项目总结报告 | `docs/06-项目总结报告.md` | 三阶段回顾、5 个技术难点、5 类问题与教训、技术债与改进方向、14 项交付物清单 |
| U3 | 选课时序图 | `docs/diagrams/sequence-select-course.*` | 五步校验 + 事务边界 |
| U4 | 退课时序图 | `docs/diagrams/sequence-drop-course.*` | 退课 + 补位（含跳过顺延循环） |
| U5 | 冲突校验活动图 | `docs/diagrams/activity-conflict-check.*` | 三条件合并判定 |
| U6 | 选课记录状态图 | `docs/diagrams/state-course-selection.*` | enrolled / waiting / dropped 迁移 |
| D4 | 数据库设计文档 | `docs/04-数据库设计文档.md` | 641 行，12 章 + 2 附录 |
| U1 | 用例图 | `docs/diagrams/use-case.{mmd,svg,png}` | 1338×2348 PNG；3 参与者 / 16 用例 |
| U2 | 类图 | `docs/diagrams/class-diagram.{mmd,svg,png}` | 3596×1826 PNG；8 服务 + 3 工具 + 1 数据层 + 6 实体 |
| U7 | ER 图 | `docs/diagrams/er-diagram.{mmd,svg,png}` | 2030×1904 PNG |

> 另有 3 张非计划内的辅助图：`architecture-layers`（D2 分层架构）、
> `activity-promote-waitlist`（D3 补位活动）、`ui-sitemap`（D3 界面导航）。

### 2.4 开发者文档（面向维护，非交付物）
`docs/dev/` 共 7 份：架构与代码地图、数据库设计说明、接口与页面规范、运行与维护手册、
新增功能标准流程、模块文档索引、6 个业务模块设计文档（课程查询 / 选课与退课 / 时间冲突检查 /
公告通知 / 管理后台 / 教师端）。

### 2.5 一键启动与发布包（v0.3.0）

| 文件 | 说明 |
| --- | --- |
| `start.bat` | Windows 双击启动（纯 ASCII，避免中文文件名与编码问题） |
| `start.js` | 启动器：检查依赖 → 检查数据库 → 起服务 → 轮询 `/health` → 开浏览器 |
| `npm run launch` | 等价的命令行入口 |

**行为约定**：端口占用自动顺延（最多 10 个）；已有本服务在跑则只开浏览器不重复启动；
`--no-browser` 只起服务；`--skip-install` 跳过自动装依赖；Ctrl+C 信号转发，不留孤儿进程。

**发布包**：`release/course-selection-system-v0.3.0.zip`（不含 `node_modules`、`data/`、`.git`，
解压后双击 `start.bat` 会自动装依赖并建库）。

### 2.6 提交材料目录

| 项 | 说明 |
| --- | --- |
| 位置 | 仓库根目录 `提交材料/` |
| 生成方式 | `npm run pack:submission`（脚本 `scripts/pack-submission.js`） |
| 内容 | 已产出的文档（4 份）+ 图表（4 组，每组 .mmd/.png/.svg）+ 自动生成的 README 索引 |
| 为什么用脚本 | `docs/` 是唯一来源；手工复制两份迟早不一致，每次全量重建 |

**注意**：改了 `docs/` 下的文档后，要重新执行 `npm run pack:submission`，
否则 `提交材料/` 里是旧内容。这一点与"代码与文档同一次提交"的约定一起遵守。

---

### 2.7 文档一致性审计（2026-10-22）

迁移完成后做过一次全量审计：**29 份 Markdown 逐份核对**"文档里的事实断言"与"系统实际状态"。

审计项与结论：

| 类别 | 检查内容 | 结果 |
| --- | --- | --- |
| 危险陈述 | 是否有会导致数据丢失的操作建议 | 修掉 2 处「`start:prod` 必须带 `--reset`」（迁移后会清空线上数据） |
| 版本标注 | 文档头的"对应代码版本" | D1~D6 统一为 v0.3.0；改用 tag 而非会过期的提交号 |
| 规模数字 | 提交数、代码行数、文档行数、测试数 | 全部按实测更新（53 提交 / 4,795 行代码 / 26+15+77 项测试） |
| 环境要求 | Node 版本、依赖个数、账号范围 | Node 22.x、5 个依赖、T1002~T1012 / 学号至 2024010140 |
| 结构描述 | 数据层文件、schema 份数 | 改为分发器 + 双驱动；schema 由 1 份变 2 份 |
| 操作流程 | 改表、备份、部署 | 改为"两套 schema 都要改"、PG 用 Backup & Restore、部署去 `--reset` |
| 链接 | 38 个 Markdown 的内部链接 | **0 处断链** |

> 结论：文档与系统一致。**下次改代码若涉及数据库、部署或测试数量，
> 这几处是最容易忘更的地方**——建议照上表逐项扫一遍。

---

## 三、未完成（待办）

### 3.0 PostgreSQL 迁移（✅ 已完成）

**目标**：本地与线上共用一个云数据库（Neon / Singapore），数据实时一致。
**方案文档**：[`docs/dev/07-PostgreSQL迁移方案.md`](docs/dev/07-PostgreSQL迁移方案.md)
**决策**：时间戳保持 TEXT ／ 双驱动可回滚 ／ 重新 seed ／ `FOR UPDATE` 行锁

| 步骤 | 内容 | 预计 | 验收标准 | 状态 |
| --- | --- | --- | --- | --- |
| P0 | 数据层拆分 + PG schema | 半天 | **118 项在 SQLite 全绿** | ✅ 已完成（118/118） |
| P1 | 8 服务 + 7 路由异步化 | 1 天 | **118 项在 SQLite 全绿** | ✅ 已完成（118/118 + 线上 77/77） |
| P2 | 切 Neon，修方言 | 半天 | **77 项冒烟在 PG 全绿** | ✅ 已完成（77/77，7 类方言差异已修） |
| P3 | 并发改 `FOR UPDATE` | 半天 | **15 项并发全绿，连跑 3 次** | ✅ 已完成（PG 连跑 3 轮 15/15，SQLite 118/118） |
| P4 | 上线 + 文档同步 | 半天 | 跨端互见 + 重启数据保留 | ✅ 已完成（线上 db=pg，四项验收通过） |

**环境**：Neon Free / Singapore（ap-southeast-1）/ PostgreSQL 18.6，连接串在本地 `.env`（已 gitignore）；连接串已于 2026-10-22 轮换（`.env` 与 Render 两处同步）。
**本地命令**：`npm run init-db:pg` / `start:pg` / `reset-db:pg`；离线开发用 `DB_DRIVER=sqlite`。

**执行记录**：[`docs/dev/08-迁移执行记录.md`](docs/dev/08-迁移执行记录.md)（含安全基线、回滚命令、中断恢复手册）

**铁律**：P3 过不了就不上线——"不超卖"是这个项目最核心的特性。

### 3.1 交付文档

**全部完成。** D0~D6 共 7 份文档已齐（见 2.3 节），无遗留文档任务。

### 3.2 UML 图表

U1~U7 **全部已产出**（见 2.3 节）。如需补充，优先考虑：

| 候选 | 价值 | 备注 |
| --- | --- | --- |
| 课程查询时序图 | 中 | 展示 N+1 规避的批量查询 |
| 登录鉴权活动图 | 中 | 展示四种未登录/越权分支 |
| 部署图 | 低 | D2 第 8.1 节已用文字+框图说明 |

### 3.3 其他

| 事项 | 说明 |
| --- | --- |
| F3 上线演示 | ✅ **已完成**：<https://course-selection-system-8xwy.onrender.com>（Render 免费实例，Blueprint 管理） |
| 执行计划量化 | 未用 `EXPLAIN QUERY PLAN` 对比索引前后（D4 已记为 L2） |
| 会话持久化 | 当前 session 存内存，重启后所有人被登出 |

---

## 四、如何继续执行

### 4.1 环境要求

| 项 | 要求 | 本机实测 |
| --- | --- | --- |
| Node.js | ≥ 20 | v24.22.0（已装，系统 PATH 可用） |
| npm | 随 Node | 11.19.1 |
| 数据库 | 无需安装 | SQLite 单文件 |
| Java | 不需要 | 未安装（PlantUML 不可用，故图表用 Mermaid） |
| 图表渲染 | Chrome 或 Edge | 已安装，脚本自动探测 |

### 4.2 每次开工前

```bash
cd course-selection-system
git pull                 # 拉取最新（若多机作业）
npm install              # 依赖有变化时
npm run init-db          # 幂等，已有数据会跳过
npm start                # 启动后访问 http://localhost:3000
npm run smoke            # 另开一个窗口验证功能正常（77 项）
```

### 4.3 必须遵守的约定

1. **需求编号**：功能项一律引用 `§2.1-N`，**绝不能写 F 编号**——
   `需求确认清单` 里 `F` 组是「技术栈与交付」，混用会造成两套含义（曾出错并修正 19 个文件）。
   B / C / D / E / R 组编号可正常使用。
2. **代码与文档同一次提交**，不允许"先写代码、文档以后补"。
3. **新增业务模块**：先写 `docs/dev/modules/<模块>.md`（含职责、接口、数据流、业务规则、边界、扩展点），再写代码。
4. **提交前缀**：`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`。
5. **推送要写重试循环**：本网络对 `github.com` 有间歇性拦截，单次推送常失败，重试即可，不要改方案。

### 4.4 图表渲染（U1~U6 复用）

```bash
# 1) 准备 mermaid 运行时（只需一次）
mkdir -p "$TEMP/mmd"
curl -sSL -o "$TEMP/mmd/mermaid.min.js" \
  https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js

# 2) 写 .mmd 源文件到 docs/diagrams/
# 3) 渲染出 SVG + 2 倍 PNG
python docs/diagrams/render_mermaid.py docs/diagrams/use-case.mmd docs/diagrams
```

出图后**必须用图片查看工具亲自看一遍**，不要只看文件大小。

### 4.5 下一步

**14 项交付物已全部完成。** 剩余只有一项需求与若干可选优化：

| 优先级 | 事项 | 说明 |
| --- | --- | --- |
| ✅ | F3 上线演示链接 | 已部署：<https://course-selection-system-8xwy.onrender.com>，线上冒烟 77 项全过 |
| 中 | 打包最终 zip 并挂到 Release | 用 `npm run pack:submission` 后压缩，或在网页上传 |
| 低 | GAP-01 引入 Playwright | 补 UI 自动化（见 D5 第九节） |
| 低 | GAP-02 接入行覆盖率 | `c8`，服务层目标 ≥ 70% |

**部署参考**：`docs/dev/06-部署指南.md`（含免费版三个限制与排错表）。

**每次产出文档后别忘了**：`npm run pack:submission` 重新生成 `提交材料/`。

---

## 五、已知限制与技术债

详见 `docs/04-数据库设计文档.md` 第十二节（L1~L6）。摘要：

| 编号 | 限制 | 影响 |
| --- | --- | --- |
| L1 | SQLite 单写者，不支持多进程并发写 | 无法水平扩展 |
| L2 | 未做执行计划量化对比 | 索引收益是"按预期"而非"已测量" |
| L3 | `is_current` 无数据库级唯一保证 | 极端情况可能多学期同时为 1 |
| L4 | 时间为字符串，无时区概念 | 跨时区部署需另行约定 |
| L5 | 无操作审计表 | 无法追溯谁改了什么（需求 D3 明确不做） |
| L6 | 演示级口令 `123456` | 仅可用于教学演示 |

**另有两条工程层面的欠账**：
- 没有 UI 自动化测试（测的是 HTTP 与纯函数，"界面点下去对不对"靠页面内容断言）
- 没有 CI（测试手动执行，未接 GitHub Actions）

---

## 六、关键经验（踩过的坑，写文档时可用作素材）

| # | 现象 | 根因 | 处理 |
| --- | --- | --- | --- |
| 1 | 数字参数写入后变成 `NULL`，不报错 | `node-sqlite3-wasm` 只接受数组/对象形式的参数，可变参数只绑定第一个 | 数据层统一 `normalizeParams()` 规整 |
| 2 | 启动报 `database is locked` | `prepare()` 后不 `finalize()`，写语句一直持锁 | 改用 Database 级 `run/get/all`（内部会 finalize）；启动时自动清理残留锁 |
| 3 | 会话过期后点"选课"看到裸 JSON | `requireLogin` 对所有非 GET 返回 401 JSON | 按 `Accept` 判断：表单跳登录页，声明 JSON 的才回 401 |
| 4 | 需求编号在两份文档里含义冲突 | README 用 F1~F6 表示功能，需求清单里 F 组是技术栈 | 统一改为 `§2.1-N`，修正 19 个文件 50 处 |
| 5 | 导出 PNG 右侧出现滚动条 | 截图视口与图形尺寸完全相等 | 窗口尺寸多留 24px |
| 6 | 文档里"张伟有 4 门课"是错的 | 凭印象写期望值，实际 5 门（漏了 CS110） | 期望值必须先查数据 |
| 7 | 本机测出单次查询 660ms | 沙箱拦截工作区目录 `mkdir`，慢约 400 倍，而驱动每条语句都建/删锁目录 | 用 `DB_FILE` 指向临时目录测；用户实机不受影响 |

---

*本文件随项目推进持续更新。*
