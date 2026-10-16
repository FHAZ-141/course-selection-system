'use strict';

/**
 * 时间冲突检查服务（需求 C1 C2 C3，规则 R4）
 *
 * 判定式：两段上课时间冲突 ⟺
 *   星期相同  且  节次区间真正重叠  且  周次集合有交集
 *
 * 关键点（需求明确拍板，不要"顺手优化"）：
 *   · 相邻时段不算冲突 —— 第 1-2 节与第 3-4 节不重叠（C3）
 *   · 支持单双周 —— 单周课与双周课即使同一时段也不冲突（C2）
 */

const classTimeService = require('./classTimeService');

/** 某周是否落在给定的周次类型里 */
function matchWeekType(week, weekType) {
  if (weekType === 'odd') return week % 2 === 1;
  if (weekType === 'even') return week % 2 === 0;
  return true; // 'all'
}

/** 两个周次区间是否有交集（同时考虑单双周） */
function weeksOverlap(a, b) {
  const lo = Math.max(Number(a.start_week), Number(b.start_week));
  const hi = Math.min(Number(a.end_week), Number(b.end_week));
  if (lo > hi) return false;

  // 最长 16 周，逐个判断奇偶性，成本可忽略
  for (let w = lo; w <= hi; w += 1) {
    if (matchWeekType(w, a.week_type) && matchWeekType(w, b.week_type)) return true;
  }
  return false;
}

/** 节次区间是否真正重叠（闭区间；相邻不算） */
function periodsOverlap(a, b) {
  return Number(a.start_period) <= Number(b.end_period)
      && Number(b.start_period) <= Number(a.end_period);
}

/** 两段上课时间是否冲突 */
function timesConflict(a, b) {
  return Number(a.day_of_week) === Number(b.day_of_week)
      && periodsOverlap(a, b)
      && weeksOverlap(a, b);
}

/**
 * 找出某学生若选 targetCourseId 会与哪些已选课程冲突
 * @returns {Array<{course_id:number, code:string, name:string, pairs:Array}>}
 */
function findStudentConflicts(studentId, targetCourseId) {
  const targetTimes = classTimeService.getByCourseId(targetCourseId);
  if (targetTimes.length === 0) return [];

  const enrolledTimes = classTimeService.loadStudentEnrolledTimes(studentId);
  if (enrolledTimes.length === 0) return [];

  const byCourse = new Map();
  for (const item of enrolledTimes) {
    if (Number(item.course_id) === Number(targetCourseId)) continue; // 自己不算
    for (const target of targetTimes) {
      if (!timesConflict(target, item)) continue;
      if (!byCourse.has(item.course_id)) {
        byCourse.set(item.course_id, {
          course_id: item.course_id,
          code: item.code,
          name: item.name,
          pairs: []
        });
      }
      byCourse.get(item.course_id).pairs.push({ mine: item, target });
    }
  }
  return [...byCourse.values()];
}

/**
 * 找出某教师所授课程之间的时间冲突（R7 教师端使用）
 * @returns {Array<{a:object, b:object, pairs:Array}>}
 */
function findTeacherConflicts(teacherId) {
  const times = classTimeService.loadTeacherTimes(teacherId);

  const byCourse = new Map();
  for (const item of times) {
    if (!byCourse.has(item.course_id)) {
      byCourse.set(item.course_id, {
        course_id: item.course_id,
        code: item.code,
        name: item.name,
        times: []
      });
    }
    byCourse.get(item.course_id).times.push(item);
  }

  const courses = [...byCourse.values()];
  const result = [];
  for (let i = 0; i < courses.length; i += 1) {
    for (let j = i + 1; j < courses.length; j += 1) {
      const pairs = [];
      for (const ta of courses[i].times) {
        for (const tb of courses[j].times) {
          if (timesConflict(ta, tb)) pairs.push({ a: ta, b: tb });
        }
      }
      if (pairs.length > 0) {
        result.push({ a: courses[i], b: courses[j], pairs });
      }
    }
  }
  return result;
}

module.exports = {
  matchWeekType,
  weeksOverlap,
  periodsOverlap,
  timesConflict,
  findStudentConflicts,
  findTeacherConflicts
};
