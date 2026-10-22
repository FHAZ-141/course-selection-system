'use strict';

/**
 * 顶部数据库状态徽标的前端刷新逻辑
 *
 * 服务端渲染时给的是「最近一次后台探测」的快照；页面打开后每 10 秒
 * 重新请求 /health（它内部真的执行 SELECT 1），把结果刷到徽标上。
 * 标签页隐藏时暂停轮询，避免后台标签空耗数据库连接。
 */
(function () {
  var el = document.getElementById('db-status');
  if (!el) return;

  var textEl = el.querySelector('.db-status-text');
  var timer = null;
  var INTERVAL = 10000;
  var lastDriver = el.getAttribute('data-driver') || 'unknown';

  function paint(data) {
    var driver = (data && data.db) || lastDriver;
    var ok = !!(data && data.dbOk === true);
    var ms = data ? data.dbMs : null;
    var kind;
    var text;
    var title;

    if (driver === 'unknown') {
      kind = 'pending';
      text = '检测中';
      title = '正在检测数据库连接…';
    } else if (driver === 'pg') {
      if (ok) {
        kind = 'ok';
        text = '云端库 · ' + ms + 'ms';
        title = '已连接 Neon PostgreSQL，延迟 ' + ms + ' ms';
      } else {
        kind = 'down';
        text = '云端离线';
        title = '云端数据库连接失败';
      }
    } else {
      kind = 'local';
      text = '离线 SQLite';
      title = '当前使用本地 SQLite，未连接云端数据库';
    }

    lastDriver = driver;
    el.setAttribute('data-driver', driver);
    el.className = 'db-status db-status--' + kind;
    el.setAttribute('title', title);
    if (textEl) textEl.textContent = text;
  }

  function poll() {
    fetch('/health', { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(paint)
      .catch(function () { paint({ db: lastDriver, dbOk: false, dbMs: null }); });
  }

  function start() {
    if (timer) return;
    poll();
    timer = setInterval(poll, INTERVAL);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  start();
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else start();
  });
})();
