# 模块文档索引

> 一个业务模块一份设计说明。**写代码之前先写它**，写完代码再补充验证记录。
>
> 模板与流程要求见 [`../05-新增功能标准流程.md`](../05-新增功能标准流程.md)

---

## 一、模块清单

| 模块文档 | 对应需求 | 涉及文件 | 状态 |
| --- | --- | --- | --- |
| [课程查询](课程查询.md) | F1 | `src/services/courseService.js`、`src/routes/courses.js`、`src/utils/format.js`、`views/course_list.ejs`、`views/course_detail.ejs` | ✅ 已产出 |
| 选课与退课 | F2 F3 B4 R9 | `src/services/enrollmentService.js`、`src/routes/enrollments.js` | 待产出 |
| 时间冲突检查 | C1 C2 C3 R4 | `src/services/conflictService.js` | 待产出 |
| 选课窗口 | B2 B3 | `src/services/windowService.js` | 待产出 |
| 选课结果查询 | F6 | `src/routes/enrollments.js`、`views/my_enrollments.ejs` | 待产出 |
| 公告通知 | D5 | `src/routes/announcements.js`、`views/announcement_*.ejs` | 待产出 |
| 管理后台 | R8 | `src/routes/admin.js`、`views/admin/*` | 待产出 |
| 教师端 | R7 | `src/routes/teacher.js`、`views/teacher/*` | 待产出 |

---

## 二、为什么要单独写模块文档

`01-架构与代码地图` 讲的是**全局**，"哪个文件干什么"；
模块文档讲的是**局部**，"这个功能的规则是什么、为什么这么判、边界情况怎么处理"。

举例：只看代码你能知道 `conflictService` 里有个不等式，
但只有模块文档能告诉你——**相邻时段（8:00~9:40 与 9:50~11:30）为什么不算冲突**（需求 C3 的决策结果）。
将来有人觉得"应该算冲突"，看文档就知道这是需求方明确拍板过的，不是遗漏。

---

## 三、写作要求

1. 必须写明**业务规则的来源**（引用需求编号或 R 编号），让读者知道规则不是随手写的
2. "边界与异常"一节要把**被拒绝的情况**写全，这是最容易出 bug 的地方
3. "扩展点"一节要写清"将来要支持 XXX 该改哪"——这是文档对"便于增加功能"的直接贡献
4. 每次修改模块代码，**在同一次提交里更新对应模块文档的验证记录**
