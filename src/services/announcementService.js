'use strict';

/**
 * 公告服务（需求 D5）
 *
 * 读：全部角色可见；写：仅管理后台调用（权限在路由层控制）。
 * 业务校验集中在这里，路由层只负责转成 flash 提示。
 */

const db = require('../db');

const TITLE_MAX = 100;
const CONTENT_MAX = 2000;

const LIST_SQL = `
  SELECT a.id, a.title, a.content, a.pinned, a.created_at, a.author_id,
         u.name AS author_name
    FROM announcement a
    JOIN user u ON u.id = a.author_id
`;

function nowIso() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * 公告列表：置顶优先，其余按发布时间倒序
 * @param {{limit?:number}} options
 */
async function list(options = {}) {
  const limit = Number(options.limit) > 0 ? Math.min(Number(options.limit), 200) : 50;
  return await db.all(
    `${LIST_SQL} ORDER BY a.pinned DESC, a.created_at DESC, a.id DESC LIMIT ?`,
    limit
  );
}

/** 取单条公告，不存在返回 null */
async function get(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  return await db.get(`${LIST_SQL} WHERE a.id = ?`, n) || null;
}

/**
 * 发布公告
 * @returns {{ok:boolean, code:string, message:string, data?:object}}
 */
async function create({ title, content, pinned, authorId }) {
  const t = String(title || '').trim();
  const c = String(content || '').trim();

  if (!t) return { ok: false, code: 'TITLE_REQUIRED', message: '请填写公告标题' };
  if (t.length > TITLE_MAX) {
    return { ok: false, code: 'TITLE_TOO_LONG', message: `标题不能超过 ${TITLE_MAX} 字` };
  }
  if (!c) return { ok: false, code: 'CONTENT_REQUIRED', message: '请填写公告内容' };
  if (c.length > CONTENT_MAX) {
    return { ok: false, code: 'CONTENT_TOO_LONG', message: `内容不能超过 ${CONTENT_MAX} 字` };
  }

  const id = (await db.run(
    'INSERT INTO announcement (title, content, author_id, pinned, created_at) VALUES (?, ?, ?, ?, ?)',
    t,
    c,
    authorId,
    pinned ? 1 : 0,
    nowIso()
  )).lastInsertRowid;

  return { ok: true, code: 'CREATED', message: `公告「${t}」已发布`, data: { id } };
}

/** 删除公告 */
async function remove(id) {
  const n = Number(id);
  const row = Number.isInteger(n) && n > 0
    ? await db.get('SELECT id, title FROM announcement WHERE id = ?', n)
    : null;

  if (!row) return { ok: false, code: 'NOT_FOUND', message: '公告不存在或已被删除' };

  await db.run('DELETE FROM announcement WHERE id = ?', n);
  return { ok: true, code: 'DELETED', message: `已删除公告「${row.title}」` };
}

/** 切换置顶状态 */
async function togglePinned(id) {
  const n = Number(id);
  const row = Number.isInteger(n) && n > 0
    ? await db.get('SELECT id, title, pinned FROM announcement WHERE id = ?', n)
    : null;

  if (!row) return { ok: false, code: 'NOT_FOUND', message: '公告不存在或已被删除' };

  const next = row.pinned ? 0 : 1;
  await db.run('UPDATE announcement SET pinned = ? WHERE id = ?', next, n);
  return {
    ok: true,
    code: 'PINNED_UPDATED',
    message: next ? `已置顶公告「${row.title}」` : `已取消置顶「${row.title}」`
  };
}

module.exports = { list, get, create, remove, togglePinned, TITLE_MAX, CONTENT_MAX };
