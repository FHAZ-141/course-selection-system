'use strict';

/**
 * 顶部数据库连接质量徽标 + 悬停详情卡
 *
 * 服务端渲染给的是「最近一次后台探测」的快照；页面打开后每 5 秒请求 /health
 * （它内部真实执行 SELECT 1），把延迟与时间刷到徽标和详情卡上。
 * 详情卡右下角的 ↻ 可立即检测一次。
 * 标签页隐藏时暂停轮询，避免后台标签空耗数据库连接。
 */
(function () {
  var wrap = document.getElementById('db-status-wrap');
  var el = document.getElementById('db-status');
  if (!wrap || !el) return;

  var textEl = el.querySelector('.db-status-text');
  var panel = wrap.querySelector('.db-status-panel');
  var refreshBtn = document.getElementById('db-status-refresh');
  var timer = null;
  var INTERVAL = 5000;
  var lastDriver = el.getAttribute('data-driver') || 'unknown';

  function field(name) {
    return panel ? panel.querySelector('[data-field="' + name + '"]') : null;
  }

  function setField(name, value) {
    var node = field(name);
    if (node) node.textContent = value;
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatClock(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  function formatUptime(sec) {
    if (sec == null) return '—';
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    if (h > 0) return h + ' 小时 ' + m + ' 分';
    if (m > 0) return m + ' 分 ' + s + ' 秒';
    return s + ' 秒';
  }

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
        title = '已连接 Neon PostgreSQL，延迟 ' + ms + ' ms（每 5 秒自动检测）';
      } else {
        kind = 'down';
        text = '云端离线';
        title = '云端数据库连接失败，点击查看详情';
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

    if (!panel) return;

    setField('state', kind === 'ok' ? '正常' : (kind === 'down' ? '离线' : (kind === 'local' ? '本地库' : '检测中')));
    if (data && data.target) {
      setField('target', data.target.label || '—');
      setField('host', data.target.host || '—');
      setField('region', data.target.region || '—');
    }
    setField('ms', ms == null ? '—' : ms + ' ms');
    setField('history', (data && data.history && data.history.length) ? data.history.join(' / ') + ' ms' : '—');
    setField('checked', formatClock(data && data.checkedAt));
    setField('server', data && data.node ? 'Node ' + data.node : '—');
    setField('commit', data && data.commit ? String(data.commit).slice(0, 7) : (data ? '本地运行' : '—'));
    setField('uptime', data ? formatUptime(data.uptimeSec) : '—');
  }

  function requestHealth() {
    return fetch('/health', { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(paint)
      .catch(function () { paint({ db: lastDriver, dbOk: false, dbMs: null }); });
  }

  function poll() {
    return requestHealth();
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

  // 详情卡：点击徽标可切换（触屏设备没有 hover）
  el.addEventListener('click', function (e) {
    e.stopPropagation();
    wrap.classList.toggle('open');
  });
  document.addEventListener('click', function () {
    wrap.classList.remove('open');
  });

  // 立即检测：真实请求 /health（服务端会执行 SELECT 1）
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (refreshBtn.classList.contains('is-loading')) return;
      refreshBtn.classList.add('is-loading');
      refreshBtn.disabled = true;
      requestHealth().then(function () {
        refreshBtn.classList.remove('is-loading');
        refreshBtn.disabled = false;
      });
    });
  }

  start();
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else start();
  });
})();
