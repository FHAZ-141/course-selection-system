'use strict';

/**
 * 展示格式化工具：把数据库里的原始值转成人类可读文本。
 *
 * 时间相关的语义来源：
 *   - C1 时间粒度为「星期 + 节次」
 *   - C2 支持单双周
 *   - R5 周次以「每周/单周/双周」三态表示，同时含起止周
 */

const config = require('../config');

const DAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function dayName(dayOfWeek) {
  return DAY_NAMES[Number(dayOfWeek)] || `第${dayOfWeek}天`;
}

function periodLabel(startPeriod, endPeriod) {
  const s = Number(startPeriod);
  const e = Number(endPeriod);
  return s === e ? `第${s}节` : `第${s}-${e}节`;
}

function timeRange(startPeriod, endPeriod) {
  const first = config.periods[Number(startPeriod)];
  const last = config.periods[Number(endPeriod)];
  if (!first || !last) return '';
  return `${first.start}-${last.end}`;
}

function weekTypeLabel(weekType) {
  return config.weekTypes[weekType] || weekType;
}

function weekRangeLabel(startWeek, endWeek) {
  const s = Number(startWeek);
  const e = Number(endWeek);
  return s === e ? `第${s}周` : `第${s}-${e}周`;
}

/**
 * 把一条 class_time 记录描述成一行文本
 * 例：周一 第1-2节（08:00-09:40，每周，第1-16周）
 */
function describeClassTime(ct) {
  const time = timeRange(ct.start_period, ct.end_period);
  const parts = [
    weekTypeLabel(ct.week_type),
    weekRangeLabel(ct.start_week, ct.end_week)
  ];
  const timeText = time ? `${time}，` : '';
  return `${dayName(ct.day_of_week)} ${periodLabel(ct.start_period, ct.end_period)}（${timeText}${parts.join('，')}）`;
}

/** 「周三 5-6节」这种简短形式，用于列表页 */
function shortClassTime(ct) {
  return `${dayName(ct.day_of_week)} ${periodLabel(ct.start_period, ct.end_period)}`;
}

/** 选课状态 -> 界面文案 */
function enrollmentStatusLabel(status) {
  switch (status) {
    case 'enrolled':
      return '已选';
    case 'waiting':
      return '候补中';
    case 'dropped':
      return '已退';
    default:
      return '';
  }
}

/** 课程状态文案 */
function courseStatusLabel(status) {
  return status === 'closed' ? '停开' : '正常开课';
}

/** 数字保留一位小数，避免出现 3.0000000000000004 之类 */
function credits(value) {
  return Number(value || 0).toFixed(1);
}

/** 字符串安全截断 */
function truncate(text, max = 60) {
  if (!text) return '';
  const str = String(text);
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

module.exports = {
  DAY_NAMES,
  dayName,
  periodLabel,
  timeRange,
  weekTypeLabel,
  weekRangeLabel,
  describeClassTime,
  shortClassTime,
  enrollmentStatusLabel,
  courseStatusLabel,
  credits,
  truncate
};
