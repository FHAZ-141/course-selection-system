'use strict';

const placeholder = require('./_placeholder');

module.exports = placeholder({
  title: '选课与退课',
  roles: ['student'],
  endpoints: [
    ['POST', '/enrollments', '选课（校验顺序：选课窗口 → 是否已选 → 时间冲突 → 余量；满员则转候补）'],
    ['POST', '/enrollments/:id/drop', '退课（触发候补自动补位，补位不受选课窗口开关影响）'],
    ['GET', '/enrollments/my', '我的选课结果（已选课程、候补队列、选课状态）'],
    ['POST', '/enrollments/:id/waitlist/cancel', '退出候补队列']
  ]
});
