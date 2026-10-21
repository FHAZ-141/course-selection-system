'use strict';

/**
 * 选课窗口判定服务（需求 B2 / B3）
 *
 * 窗口时间存在 semester 表上（一个学期一轮窗口）。
 * 时间字符串格式统一为 `YYYY-MM-DD HH:MM:SS`，本地时间。
 */

const db = require('../db');

async function getCurrentSemester() {
  return await db.get('SELECT * FROM semester WHERE is_current = 1 ORDER BY id DESC LIMIT 1');
}

async function getSemesterById(semesterId) {
  return await db.get('SELECT * FROM semester WHERE id = ?', semesterId);
}

/**
 * 把数据库中的时间字符串转成时间戳。
 * 注意：不能直接 new Date('2026-10-16 10:00:00')，部分 JS 环境解析不可靠，
 * 因此先把空格替换成 'T'。
 */
function parseTime(value) {
  if (!value) return NaN;
  return new Date(String(value).replace(' ', 'T')).getTime();
}

/**
 * 计算窗口状态
 * @returns {{open:boolean, code:string, label:string, openAt?:number, closeAt?:number}}
 */
function getWindowState(semester) {
  if (!semester) {
    return { open: false, code: 'NO_SEMESTER', label: '系统尚未配置学期' };
  }

  const openAt = parseTime(semester.select_open_at);
  const closeAt = parseTime(semester.select_close_at);

  if (!Number.isFinite(openAt) || !Number.isFinite(closeAt)) {
    return { open: false, code: 'NOT_CONFIGURED', label: '尚未配置选课窗口' };
  }

  const now = Date.now();
  if (now < openAt) {
    return {
      open: false,
      code: 'NOT_STARTED',
      label: `选课将于 ${semester.select_open_at} 开始`,
      openAt,
      closeAt
    };
  }
  if (now > closeAt) {
    return {
      open: false,
      code: 'CLOSED',
      label: `选课已于 ${semester.select_close_at} 截止`,
      openAt,
      closeAt
    };
  }
  return { open: true, code: 'OPEN', label: '选课开放中', openAt, closeAt };
}

/** 当前学期的窗口状态 */
async function getCurrentWindowState() {
  return getWindowState(await getCurrentSemester());
}

module.exports = {
  getCurrentSemester,
  getSemesterById,
  getWindowState,
  getCurrentWindowState,
  parseTime
};
