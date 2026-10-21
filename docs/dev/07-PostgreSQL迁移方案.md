# PostgreSQL 迁移方案

> 状态：**方案已定稿，待实施**
> 制定日期：2026-10-21
> 目标：让本地部署与线上部署**共用一个云数据库**，数据实时一致

---

## 一、背景与目标

### 1.1 为什么要迁移

现在的架构是"两个部署、两份数据"：

```
本地  data/course-selection.sqlite   ← 一份
Render data/course-selection.sqlite  ← 另一份（每次启动 --reset 重建）
```

这带来两个具体问题：

| 问题 | 现象 |
| --- | --- |
| 数据割裂 | 本地选课，线上看不到；线上改容量，本地不知道 |
| 状态不可积累 | Render 每次重启清库，演示记录留不住 |

### 1.2 目标与非目标

| 是目标 | 不是目标 |
| --- | --- |
| 本地与线上连同一个数据库 | **不做**页面实时推送（无 SSE/WebSocket） |
| 任何身份的写入都进同一个库 | 不追求更高并发（仍是单主库） |
| 并发选课仍不超卖 | 不重构业务规则 |
| 出问题能一键回退 SQLite | 不迁移历史演示数据（重新 seed） |

### 1.3 决策记录

| # | 决策 | 采纳 | 被否方案与原因 |
| --- | --- | --- | --- |
| 1 | 时间戳类型 | **保持 `TEXT`** | 改 `TIMESTAMPTZ`：`pg` 返回 `Date` 对象，`format.dateTime()` 等 6 处格式化会崩，改动扩散大，而本次目标不是重构数据模型 |
| 2 | 驱动策略 | **双驱动**（`DATABASE_URL` 决定） | 单驱动：断网无法本地开发，且回滚要改代码；双驱动的代价只是两份 schema 要同步维护 |
| 3 | 现有数据 | **重新 seed** | 迁移现有 114 条记录：都是演示数据，搬过去等于把测试数据带进新库 |
| 4 | 数据库选型 | **Neon Postgres（Singapore）** | Supabase（免费版 7 天不活动暂停，需手动恢复）；Render PG（30 天删除）；CloudBase（MySQL 方言，且免费环境功能受限） |
| 5 | 并发方案 | **`SELECT ... FOR UPDATE` 行锁** | `SERIALIZABLE` + 重试（重试逻辑易写错）；计数器行（改动最大） |

---

## 二、目标架构

### 2.1 前后对比

```
【现在】
  本地 Node ──→ data/*.sqlite
  Render Node ─→ data/*.sqlite（每次 --reset）

【迁移后】
  本地 Node ──┐
              ├──→ Neon PostgreSQL (ap-southeast-1)
  Render Node ┘
```

### 2.2 配置项

| 变量 | 取值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://...` | **有则走 PG**，无则回退 SQLite |
| `DB_DRIVER` | `pg` / `sqlite` | 可选，显式覆盖自动判断（用于强制回归测试） |
| `PG_POOL_MAX` | 默认 10 | 连接池上限 |
| `PG_SSL` | 默认 `true` | Neon 要求 SSL |

**本地**：写入 `.env`（`.gitignore` 已含）
**线上**：Render 控制台 → Environment → 添加 `DATABASE_URL`

### 2.3 驱动选择逻辑

```js
// src/db/index.js
const usePg = process.env.DB_DRIVER
  ? process.env.DB_DRIVER === 'pg'
  : Boolean(process.env.DATABASE_URL);

module.exports = usePg ? require('./pg') : require('./sqlite');
```

回滚 = 删掉 `DATABASE_URL` 环境变量，无需改代码。

---

## 三、数据库移植

### 3.1 逐表对照

| 表 | 改动项 | SQLite | PostgreSQL |
| --- | --- | --- | --- |
| `meta` | 主键类型 | `TEXT PRIMARY KEY` | 不变 |
| `user` | 自增主键 | `INTEGER PRIMARY KEY AUTOINCREMENT` | `INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY` |
| `semester` | 自增主键 + 布尔 | 同上；`is_current INTEGER CHECK (0,1)` | `SMALLINT DEFAULT 0 CHECK`（保留 0/1，避免改代码） |
| `course` | 自增主键 + 学分类型 | `credits REAL` | `credits NUMERIC(3,1)` |
| `class_time` | 自增主键 | 同上 | 同上 |
| `enrollment` | 自增主键 + 唯一约束 | `UNIQUE (student_id, course_id)` | 不变 |
| `announcement` | 自增主键 + 布尔 | `pinned INTEGER CHECK (0,1)` | 同上 |

**7 处 `AUTOINCREMENT`** 全部替换为 `GENERATED ALWAYS AS IDENTITY`。

### 3.2 索引与约束

| 项 | 处理 |
| --- | --- |
| 10 个索引 | `CREATE INDEX IF NOT EXISTS` 语法通用，**原样保留** |
| 部分索引 `WHERE status='waiting'` | PG 支持，原样保留 |
| `CHECK (role IN (...))` 等 6 处 | 语法通用 |
| `ON DELETE CASCADE` | 语法通用 |
| `PRAGMA foreign_keys = ON` | **删除**（PG 强制外键，无此开关） |

### 3.3 为什么不改类型（决策 1 的依据）

时间戳目前是 `TEXT`，存 `'2026-10-20 18:00:00'`。

改为 `TIMESTAMPTZ` 会引发连锁改动：

| 位置 | 影响 |
| --- | --- |
| `node-postgres` 返回类型 | `Date` 对象而非字符串 |
| `utils/format.js` 的 `dateTime()` / `date()` | 需要新增 `Date` 分支 |
| 候补排序 `ORDER BY waitlist_joined_at` | 语义不变，但值类型变了 |
| `nowIso()` 写入 | 要改成 `new Date()` 或 SQL `now()` |
| 种子数据 37 行排课 + 114 条选课 | 写入格式要统一 |

**保持 `TEXT` 的前提**：格式必须是 `YYYY-MM-DD HH:MM:SS`（字典序 = 时间序）。当前 `nowIso()` 已经保证了这一点，所以排序、比较、区间查询全部正确。

> 代价：没有时区能力。本项目单时区使用，可接受；已记入 D4 已知限制。

---

## 四、数据访问层设计

### 4.1 接口形状保持不变

```js
// 现在（同步）
db.get(sql, ...params)      → row | undefined
db.run(sql, ...params)      → { changes, lastInsertRowid }
db.all(sql, ...params)      → rows[]
db.transaction(fn)          → fn 的返回值

// 迁移后（异步，形状一致）
await db.get(sql, ...params)
await db.run(sql, ...params)
await db.all(sql, ...params)
await db.transaction(async () => { ... })
```

**92 处调用点只加 `await`，不改结构。**

### 4.2 用 AsyncLocalStorage 传递事务连接

**问题**：PG 事务必须用同一个连接。而现有代码在事务里调 `db.get()`，若用连接池每次可能取到不同连接，事务就失效了。

**常规解法的代价**：把 `client` 一路作为参数传下去。但调用链是

```
enroll → conflictService.findStudentConflicts → classTimeService.loadStudentEnrolledTimes
```

需要改 10+ 个函数签名，且容易漏。

**采用方案**：

```js
const { AsyncLocalStorage } = require('node:async_hooks');
const als = new AsyncLocalStorage();

function currentExecutor() {
  const txClient = als.getStore();
  return txClient || pool;          // 事务内用 client，否则用连接池
}

async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await als.run(client, () => fn());
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
```

**效果**：事务内任何深度的 `db.get()` 都会自动用同一个 client，业务代码无需感知。

**代价**：事务上下文是隐式的。缓解措施——这条规则只存在于 `src/db/pg.js` 一个文件里，并在文件头写清楚。

### 4.3 `run()` 与 `RETURNING id`

PG 没有 `lastInsertRowid`。方案：`run()` 在执行 INSERT 时自动补 `RETURNING id`。

```js
async function run(sql, ...params) {
  let finalSql = sql;
  const isInsert = /^\s*INSERT\s+INTO/i.test(sql);
  const hasReturning = /\bRETURNING\b/i.test(sql);
  if (isInsert && !hasReturning) finalSql = sql.trimEnd().replace(/;?$/, '') + ' RETURNING id';

  const res = await currentExecutor().query(toPgPlaceholders(finalSql), params);
  return {
    changes: res.rowCount,
    lastInsertRowid: res.rows[0] ? res.rows[0].id : undefined
  };
}
```

**影响面**：7 处依赖 `lastInsertRowid`（seed 3 处、admin 1 处、announcement 1 处、enrollment 1 处、stress 测试 1 处）——全部无需改动。

### 4.4 占位符转换

现有 SQL 用的是 SQLite 的 `?`。`node-postgres` 要 `$1, $2`。

```js
function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}
```

**风险**：SQL 字符串里如果出现字面量 `?`（例如 `LIKE '%?%'`）会被误替换。已确认现有 SQL 无此情况；后续新增查询需注意，会在规范里写明。

### 4.5 连接池

```js
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
  ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false },
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});
```

**Neon 注意**：免费版计算实例 5 分钟无查询会挂起，首次连接多等约 1.2 秒。`connectionTimeoutMillis` 设 10 秒以覆盖这个唤醒时间。

---

## 五、并发正确性设计（核心）

### 5.1 现状：靠 SQLite 的写锁

```js
// src/db/index.js
function transaction(fn, mode = 'IMMEDIATE') {
  d.exec(`BEGIN ${mode}`);   // ← 立刻取写锁，其他写事务阻塞
  ...
}
```

`BEGIN IMMEDIATE` 在事务开始就拿到 RESERVED 写锁，所以"读余量 → 写记录"之间不会被人插队。
**15 项并发测试就是验证这一点。**

### 5.2 迁移后会失效

PG 的 `BEGIN` 不加锁，`SELECT COUNT(*)` 只是快照读：

```sql
-- ❌ 照搬会超卖
BEGIN;
SELECT COUNT(*) FROM enrollment WHERE course_id=1 AND status='enrolled';  -- 两个事务都读到 2
INSERT ...;  -- 都插入
COMMIT;
```

容量 3、剩 1 个名额时，两个并发请求都会成功 → 4 个人。

### 5.3 方案：锁课程行

```sql
BEGIN;
SELECT * FROM course WHERE id = $1 FOR UPDATE;    -- ← 锁住这门课

SELECT COUNT(*) FROM enrollment WHERE course_id=$1 AND status='enrolled';
INSERT INTO enrollment (...) VALUES (...)
  ON CONFLICT (student_id, course_id) DO UPDATE SET ...;
COMMIT;
```

### 5.4 为什么这样是对的

| 时序 | 事务 A | 事务 B |
| --- | --- | --- |
| T1 | `FOR UPDATE` 拿到行锁 | — |
| T2 | 读 count = 2 | 请求 `FOR UPDATE`，**阻塞等待** |
| T3 | 插入，count = 3 | 仍在等 |
| T4 | COMMIT，释放锁 | 拿到锁 |
| T5 | — | 读 count = **3**（A 已提交）→ 判定满员，转候补 |

PG 默认隔离级别是 READ COMMITTED：**拿到行锁后的查询能看到前一个事务已提交的数据**。所以第二个事务读到的是 3，不会超卖。

### 5.5 三个必须同时做的点

| # | 要点 | 若遗漏 |
| --- | --- | --- |
| 1 | `enroll()` 里锁课程行 | 超卖 |
| 2 | **`drop()` 里也锁课程行** | 退课触发补位时，补位读到的余量可能已过时，导致补位人数错误 |
| 3 | 锁必须在事务内、在第一次读 count 之前 | 锁晚了等于没锁 |

### 5.6 死锁风险

当前只有"选课"和"退课"两个写路径，且都**只锁一行**（课程行），不存在"先锁 A 再锁 B"的情况，因此不会形成环路死锁。

`adminService.saveCourse()` 会更新课程行 + 替换排课，若将来与选课并发，需要同样先锁课程行——已在任务清单中标注。

---

## 六、分步实施计划

> 每步独立提交，**每步结束都必须跑验收，过不了就停在原地**。

### P0 数据层拆分与 schema 移植（预计半天）

| 项 | 内容 |
| --- | --- |
| 改动 | 1. 新增 `src/db/pg.js`（pg 驱动 + ALS + RETURNING）<br>2. 现有 `src/db/index.js` 改名为 `src/db/sqlite.js`（逻辑不变）<br>3. 新的 `src/db/index.js` 只做驱动分发<br>4. 新增 `src/db/schema.pg.sql`<br>5. `src/config.js` 增加 PG 相关配置 |
| 不碰 | 服务层、路由层、测试 |
| 验收 | `npm run test:conflict` → 26 项通过<br>`npm run stress` → 15 项通过<br>`npm run smoke` → 77 项通过<br>**合计 118 项全绿（SQLite 模式）** |
| 耗时 | 验收约 40 秒 |
| 失败处置 | 说明拆分引入了回归，回退本次提交 |

### P1 服务层与路由异步化（预计 1 天）

| 项 | 内容 |
| --- | --- |
| 改动 | 1. 8 个 service 文件：函数加 `async`，内部调用加 `await`<br>2. 7 个 route 文件：回调改 `async (req,res)`，调用加 `await`<br>3. `seed.js` 异步化<br>4. `test/stress-test.js` 异步化<br>5. `start.js` / `server.js` 启动流程适配 |
| 不碰 | 业务规则、SQL 语句、页面模板 |
| 验收 | 同上 **118 项全绿（SQLite 模式）** |
| 耗时 | 验收约 40 秒 |
| 失败处置 | 逐个服务对比改前改后行为，不回退到 P0 之前 |

> **这一步最容易出错的地方**：漏掉一个 `await`。症状是页面拿到 `Promise` 而不是数据（渲染时报 `undefined`）。冒烟测试会立刻发现。

### P2 切换到 PostgreSQL（预计半天）

| 项 | 内容 |
| --- | --- |
| 前置 | 拿到 Neon 连接串 |
| 改动 | 1. 配 `.env`<br>2. 用 `schema.pg.sql` 建表<br>3. 修方言差异：2 处 `INSERT OR REPLACE` → `ON CONFLICT DO UPDATE`<br>4. 处理 `seed.js` 的自增序列 |
| 验收 | `npm run init-db` 成功（53 用户 / 33 课程 / 114 选课）<br>`npm run smoke` → **77 项全绿（PG 模式）** |
| 耗时 | 验收约 60 秒（含网络延迟） |
| 失败处置 | 逐条看报错的 SQL，修完重跑；不改业务逻辑 |

### P3 并发正确性验证（预计半天）

| 项 | 内容 |
| --- | --- |
| 改动 | 1. `enroll()` 与 `drop()` 的 `getCourseRow()` 加 `FOR UPDATE`<br>2. 新增 3 条并发用例（见 7.2） |
| 验收 | `npm run stress` → **15 项全绿，10 抢 3 只中 3**<br>重复跑 3 次，结果稳定 |
| 耗时 | 验收约 30 秒 × 3 次 |
| 失败处置 | **停止，不上线**。回退 P3 提交，重新评估锁方案 |

> 这是整个迁移的**唯一硬门槛**。P3 过不了，说明"不超卖"这个核心特性丢了，宁可放弃迁移。

### P4 上线与文档同步（预计半天）

| 项 | 内容 |
| --- | --- |
| 改动 | 1. Render 加 `DATABASE_URL`，`start:prod` 去掉 `--reset`<br>2. 更新 D2 / D3 / D4 / D5 / D6<br>3. 更新 README / PROGRESS / HANDOFF<br>4. 重新打包 `提交材料/` |
| 验收 | 线上冒烟 77 项全绿<br>**跨端验证**：本地改 → 线上可见；线上改 → 本地可见<br>重启 Render → 数据仍在 |
| 耗时 | 验收约 2 分钟（含冷启动） |

---

## 七、测试策略

### 7.1 118 项现有测试的处置

| 套件 | 是否要改 | 说明 |
| --- | --- | --- |
| `test/conflict-test.js`（26 项） | ❌ 不改 | 测纯函数，不碰数据库 |
| `test/stress-test.js`（15 项） | ✅ 改 | 需要 `await`；断言逻辑不变 |
| `test/smoke.sh`（77 项） | ❌ 不改 | 纯 HTTP 断言，不关心底层数据库 |

**关键**：smoke 是黑盒的，所以它在 SQLite 和 PG 上都应该全绿——这正是我们要的"行为不变"证据。

### 7.2 需要新增的用例

| 编号 | 用例 | 验证什么 |
| --- | --- | --- |
| TC-I-16 | 两端并发抢最后一个名额 | 跨实例一致性（两个连接池抢同一行） |
| TC-I-17 | 退课与选课同时发生 | 补位不会超额 |
| TC-I-18 | 连跑 3 轮并发 | 无偶发超卖（排除运气） |

### 7.3 最终验收清单

```
□ 118 项在 SQLite 模式全绿（P0/P1 完成后）
□ 77 项冒烟在 PG 模式全绿（P2 完成后）
□ 15 项并发在 PG 模式全绿，连跑 3 次（P3 完成后）
□ 本地写入 → 线上立刻可见（P4）
□ 线上写入 → 本地立刻可见（P4）
□ Render 重启后数据保留（P4）
□ 提交材料重新打包、无断链
```

---

## 八、文档联动清单

| 文档 | 何时改 | 改什么 |
| --- | --- | --- |
| `docs/02-概要设计说明书.md` | P4 | 架构图（SQLite → PostgreSQL）、技术选型表、部署结构 |
| `docs/03-详细设计说明书.md` | P4 | 第 2.10 数据访问层、第 3.1 事务边界、第 8 章并发要点 |
| `docs/04-数据库设计文档.md` | P4 | 选型论证、字段类型、索引、容量估算、变更记录 |
| `docs/05-测试用例与测试报告.md` | P4 | 环境章节、执行结果（需在实际执行后填写） |
| `docs/06-项目总结报告.md` | P4 | 新增"迁移到 PostgreSQL"一节（决策、过程、踩坑） |
| `README.md` | P4 | 技术栈、部署说明、环境变量 |
| `PROGRESS.md` | **现在** | 新增迁移章节与任务清单 |
| `CHANGELOG.md` | **现在** | 记录"迁移规划"，实施完成后补实现记录 |
| `HANDOFF.md` | **现在** | 加"正在进行的迁移"提示 |
| `docs/dev/README.md` | **现在** | 索引加 DV7 |

> **原则**：文档描述"已经发生的事实"。
> 所以 D2/D4 等交付文档**不在现在改**——现在改就成了描述不存在的东西。

---

## 九、回滚方案

| 场景 | 操作 | 耗时 |
| --- | --- | --- |
| PG 出问题想立刻恢复 | Render 删掉 `DATABASE_URL` → 自动回 SQLite | 1 分钟（含重新部署） |
| 本地想离线开发 | `.env` 里删掉 `DATABASE_URL` 或设 `DB_DRIVER=sqlite` | 立即 |
| P3 并发验证不通过 | 回退 P3 提交，线上保持 SQLite | 5 分钟 |

**因为保留了双驱动，回滚不需要改代码。**

---

## 十、风险清单

| # | 风险 | 概率 | 影响 | 应对 |
| --- | --- | --- | --- | --- |
| R1 | 漏改 `await` 导致某页面拿到 Promise | 高 | 中 | 冒烟 77 项覆盖主要页面 |
| R2 | `?` 占位符误替换字面量 | 低 | 高 | 已确认无此写法；新增查询需 review |
| R3 | 并发超卖（锁没生效） | 中 | **高** | P3 独立验证，连跑 3 次，不过不上线 |
| R4 | Neon 免费额度超限 | 极低 | 中 | 当前 124 KB / 1 GB，差 4 个数量级 |
| R5 | 跨境延迟影响体验 | 确定 | 低 | 演示前预热；已在文档标注 |
| R6 | 文档与代码不同步 | 中 | 中 | 文档改动集中在 P4，与代码同一次提交 |

---

## 附录 A：命令速查

```bash
# 本地（SQLite，离线）
npm run test:conflict && npm run stress && npm run smoke

# 本地（PostgreSQL）
export DATABASE_URL="postgresql://..."
npm run init-db
npm run smoke

# 切回 SQLite
unset DATABASE_URL
```

## 附录 B：提交信息模板

```
feat(db): P0 数据层拆分，支持 PostgreSQL 与 SQLite 双驱动

- 新增 src/db/pg.js：pg 驱动 + AsyncLocalStorage 事务传递 + 自动 RETURNING id
- 原 src/db/index.js 改名为 src/db/sqlite.js，逻辑不变
- 新增 src/db/schema.pg.sql：7 表移植版（AUTOINCREMENT → IDENTITY）
- src/config.js 增加 DATABASE_URL / DB_DRIVER / PG_POOL_MAX 配置

验收：118 项测试在 SQLite 模式全绿（未改变现有行为）
```

---

*文档结束*
