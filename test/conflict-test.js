'use strict';

/**
 * 时间冲突判定 · 单元测试（需求 C1 C2 C3，规则 R4）
 *
 * 为什么单独测：单双周、相邻时段这些边界很难通过页面造数据验证，
 * 而 timesConflict / weeksOverlap 是纯函数（不碰数据库），直接断言最可靠。
 *
 * 用法：npm run test:conflict
 */

const { timesConflict, weeksOverlap, periodsOverlap } = require('../src/services/conflictService');

let PASS = 0;
let FAIL = 0;

function t(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✅ ${label}`);
    PASS += 1;
  } else {
    console.log(`  ❌ ${label}（期望 ${expected}，实际 ${actual}）`);
    FAIL += 1;
  }
}

/** 构造一段上课时间 */
function slot(day, start, end, weekType = 'all', startWeek = 1, endWeek = 16) {
  return {
    day_of_week: day,
    start_period: start,
    end_period: end,
    week_type: weekType,
    start_week: startWeek,
    end_week: endWeek
  };
}

console.log('==============================================');
console.log('  时间冲突判定 · 单元测试');
console.log('==============================================\n');

console.log('【节次重叠】');
t('完全相同 → 冲突', timesConflict(slot(1, 1, 2), slot(1, 1, 2)), true);
t('相邻时段 1-2 与 3-4 → 不冲突（C3）', timesConflict(slot(1, 1, 2), slot(1, 3, 4)), false);
t('部分重叠 1-3 与 2-4 → 冲突', timesConflict(slot(1, 1, 3), slot(1, 2, 4)), true);
t('包含关系 1-4 与 2-3 → 冲突', timesConflict(slot(1, 1, 4), slot(1, 2, 3)), true);
t('单节相同 5-5 与 5-5 → 冲突', timesConflict(slot(1, 5, 5), slot(1, 5, 5)), true);
t('单节相邻 5-5 与 6-6 → 不冲突', timesConflict(slot(1, 5, 5), slot(1, 6, 6)), false);
t('首尾相接 1-2 与 2-3 → 冲突（第 2 节重叠）', timesConflict(slot(1, 1, 2), slot(1, 2, 3)), true);

console.log('\n【星期】');
t('星期一与星期二 → 不冲突', timesConflict(slot(1, 1, 2), slot(2, 1, 2)), false);
t('同一天同一时段 → 冲突', timesConflict(slot(3, 5, 6), slot(3, 5, 6)), true);

console.log('\n【单双周（C2）】');
t('单周与双周、同一天同一时段 → 不冲突',
  timesConflict(slot(1, 1, 2, 'odd'), slot(1, 1, 2, 'even')), false);
t('单周与每周、同一天同一时段 → 冲突',
  timesConflict(slot(1, 1, 2, 'odd'), slot(1, 1, 2, 'all')), true);
t('双周与每周、同一天同一时段 → 冲突',
  timesConflict(slot(1, 1, 2, 'even'), slot(1, 1, 2, 'all')), true);
t('两者都是单周 → 冲突', timesConflict(slot(1, 1, 2, 'odd'), slot(1, 1, 2, 'odd')), true);

console.log('\n【周次区间】');
t('区间不相交 1-8 与 9-16 → 不冲突',
  timesConflict(slot(1, 1, 2, 'all', 1, 8), slot(1, 1, 2, 'all', 9, 16)), false);
t('区间部分相交 1-8 与 5-12 → 冲突',
  timesConflict(slot(1, 1, 2, 'all', 1, 8), slot(1, 1, 2, 'all', 5, 12)), true);
t('区间首尾相接 1-8 与 8-16 → 冲突（第 8 周重叠）',
  timesConflict(slot(1, 1, 2, 'all', 1, 8), slot(1, 1, 2, 'all', 8, 16)), true);
t('单周 1-16 与双周 1-16 → 不冲突（无共同周）',
  timesConflict(slot(1, 1, 2, 'odd', 1, 16), slot(1, 1, 2, 'even', 1, 16)), false);
t('单周 1-3 与单周 3-5 → 冲突（第 3 周重叠）',
  timesConflict(slot(1, 1, 2, 'odd', 1, 3), slot(1, 1, 2, 'odd', 3, 5)), true);
t('单周 1-3 与单周 4-7 → 不冲突（区间不相交）',
  timesConflict(slot(1, 1, 2, 'odd', 1, 3), slot(1, 1, 2, 'odd', 4, 7)), false);

console.log('\n【组合：冲突需三个条件同时满足】');
t('节次重叠但星期不同 → 不冲突', timesConflict(slot(1, 1, 2), slot(2, 1, 2)), false);
t('星期相同、节次重叠但周次不重叠 → 不冲突',
  timesConflict(slot(1, 1, 2, 'all', 1, 4), slot(1, 1, 2, 'all', 5, 8)), false);
t('三条件全满足 → 冲突',
  timesConflict(slot(1, 1, 2, 'all', 1, 16), slot(1, 2, 3, 'all', 4, 8)), true);

console.log('\n【辅助函数】');
t('periodsOverlap(1,2 / 3,4) → false', periodsOverlap(slot(1, 1, 2), slot(1, 3, 4)), false);
t('periodsOverlap(1,4 / 2,3) → true', periodsOverlap(slot(1, 1, 4), slot(1, 2, 3)), true);
t('weeksOverlap(all 1-16 / all 1-16) → true',
  weeksOverlap(slot(1, 1, 2, 'all', 1, 16), slot(1, 1, 2, 'all', 1, 16)), true);
t('weeksOverlap(odd 1-16 / even 1-16) → false',
  weeksOverlap(slot(1, 1, 2, 'odd', 1, 16), slot(1, 1, 2, 'even', 1, 16)), false);

console.log('\n==============================================');
console.log(`  通过 ${PASS} 项，失败 ${FAIL} 项`);
console.log('==============================================');
if (FAIL > 0) process.exitCode = 1;
