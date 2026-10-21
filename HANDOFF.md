# 交接文档（HANDOFF）

> **给下一个会话的我看的。** 换设备、换会话、隔几周回来，先读这一份。
> 最后更新：2026-10-20

---

## 一、30 秒读懂这个项目

高校选课系统，课程作业项目。**已全部完成并上线**。

| 项 | 值 |
| --- | --- |
| 线上演示 | <https://course-selection-system-8xwy.onrender.com>（`admin` / `123456`） |
| 仓库 | <https://github.com/FHAZ-141/course-selection-system> |
| 技术栈 | Node.js + Express + SQLite（纯 WASM 驱动）+ EJS，无前端构建 |
| 交付物 | 14 / 14 全部完成（7 份文档 + 7 张 UML 图，另 3 张辅助图） |
| 测试 | 118 项，本地与线上各跑过，全绿 |

---

## 二、已定的事（不要再翻案）

这些是讨论过、有理由的决策。改动前先想清楚当初为什么这么定。

| 决策 | 理由 | 记录在哪 |
| --- | --- | --- |
| 不引入前端框架 / 构建工具 | 演示规模用不上，多一层失败点 | README 技术选型 |
| 不做 Docker 部署（F2 明确不做） | 所以选了 Render 原生 Node 运行时，没选 Fly.io | `docs/dev/06-部署指南.md` |
| 选课规则只在服务层实现 | 路由与压测脚本复用同一套判定 | D3 第 2 章 |
| 服务层返回 `{ok, code, message}` 而不抛异常 | 业务拒绝与程序故障要能分开统计 | D3 第 2.1 节 |
| 候补补位：跳过冲突者但保留其队列位置 | 名额不浪费，学生不吃亏 | D3 第 3.3 节 |
| 类图只画结构、不展开方法签名 | 展开后图宽 3000px，文档里看不清 | D2 第 4.2 节 |
| 提交材料由脚本生成 | 手工复制两份必然不同步 | `scripts/pack-submission.js` |

---

## 三、想改什么，去哪找

| 我想… | 看这里 |
| --- | --- |
| 加一个功能 | `docs/dev/05-新增功能标准流程.md`（五步） |
| 改业务规则 | `src/services/`，改完同步 `docs/dev/modules/<模块>.md` |
| 改表结构 | `src/db/schema.sql` + `docs/04-数据库设计文档.md` + D4 变更记录 |
| 改页面 | `views/`，字段规范看 `docs/dev/03-接口与页面规范.md` |
| 改演示数据 | `src/db/seed.js`，改完**必须** `npm run pack:submission` |
| 重新出图 | `docs/diagrams/*.mmd` → `python docs/diagrams/render_mermaid.py <mmd> docs/diagrams` |
| 部署相关 | `render.yaml` + `docs/dev/06-部署指南.md` |
| 看整体进度 | `PROGRESS.md`（230 行，最全的台账） |

---

## 四、跑起来

```bash
npm install        # 4 个纯 JS 依赖，无需编译工具链
npm run init-db    # 建库 + 演示数据（幂等）
npm start          # 或双击 start.bat
```

验证：

```bash
npm run test:conflict   # 26 项，纯函数，秒级
npm run stress          # 15 项，并发与规则
npm run smoke           # 77 项，需服务在跑
```

---

## 五、踩过的坑（会重复咬人）

| 坑 | 现象 | 应对 |
| --- | --- | --- |
| **推送常失败** | `CONNECT tunnel failed, response 502`，能连续失败 20 次 | 无解，**重试**（间隔 15~20 秒，通常几十次内会成功）。推之前可先 `curl -o /dev/null -w '%{http_code}' https://github.com` 探路，`000` 就是不通 |
| **Render 授权两步** | 装了 GitHub App，仓库列表仍为空 | 「安装 App」≠「账号 OAuth」。且装完要重新进 `/select-repo?type=blueprint` 才刷新 |
| **部署后数据不更新** | 代码新了、数据还是旧的 | `start:prod` 必须带 `--reset`，否则幂等 seed 会跳过 |
| **Mermaid 输出非法 SVG** | 浏览器打开报 `tag mismatch: br` | `htmlLabels:false` + 源码 HTML 转义（脚本已改好） |
| **图里出现 `&lt;`** | 标签里的 `<` 被转义 | 用中文「不足」代替比较符 |
| **曲线/尺寸失控** | 图 3000px 宽或 2700px 高，A4 放不下 | 合并同类判定节点、移除边界分支，控制在 1800px 内 |
| **数据库参数静默出错** | 数字参数变 NULL 且不报错 | `node-sqlite3-wasm` 只绑第一个可变参数，必须传数组（数据层已收口） |
| **中文路径比对失败** | `git ls-tree` 把中文转义成八进制，误判"文件缺失" | 加 `-c core.quotePath=false` |

---

## 六、正在进行：PostgreSQL 迁移

> **别按现在的代码去改数据库相关的东西** —— 正在做双驱动改造，数据层结构会变。

| 项 | 内容 |
| --- | --- |
| 目标 | 本地与线上共用一个 Neon Postgres 库，数据实时一致 |
| 方案 | [`docs/dev/07-PostgreSQL迁移方案.md`](docs/dev/07-PostgreSQL迁移方案.md) |
| 进度 | P0~P4 五步，见 `PROGRESS.md` 第 3.0 节 |
| 当前状态 | 方案已定稿，**等 Neon 连接串**，P0 未开始 |
| 铁律 | P3 并发验证不过就不上线 |

**接手注意**：迁移期间 `src/db/index.js` 会变成驱动分发器，真正的实现在 `pg.js` / `sqlite.js`。
改数据层前先读 DV7 第四节（接口形状不变，但调用要 `await`）。

---

## 七、下一步可以做什么

按价值排序，都没做：

1. **内网穿透备份**（答辩现场用）——Render 冷启动 30~60 秒，现场等太尴尬
2. **文档转 Word/PDF**——需求 F4 提过"可导出"；`提交材料/` 目前是 Markdown
3. **UI 自动化**（D5 的 GAP-01）——Playwright 覆盖 5 条主流程
4. **行覆盖率**（GAP-02）——接 `c8`，服务层目标 ≥ 70%
5. **打包新 Release**——代码比 v0.2.1 多了不少（演示数据扩充、部署适配、登录页改动）

---

## 八、会话怎么接上

新会话开工前，按顺序读：

1. `HANDOFF.md`（本文）—— 5 分钟建立全局
2. `PROGRESS.md` —— 当前状态、待办、环境信息
3. `docs/06-项目总结报告.md` 第六节 —— 踩过的坑与教训
4. 需要改代码时再看 `docs/dev/README.md` 选对应的开发者文档

**约定**：代码与文档同一次提交；改了 `docs/` 下的文档要 `npm run pack:submission`。

---

## 九、当前环境（换设备可能要重装）

| 项 | 值 |
| --- | --- |
| Node.js | v24.22.0（`engines` 要求 ≥ 20） |
| 依赖 | express / express-session / ejs / node-sqlite3-wasm（全纯 JS） |
| 图表渲染 | 需本机有 Chrome 或 Edge（`docs/diagrams/render_mermaid.py` 无头渲染） |
| 代理 | 本机走 `https_proxy=127.0.0.1:50277`，curl 访问线上需加 `--noproxy '*'` |
