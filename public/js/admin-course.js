'use strict';

/**
 * 课程编辑页：动态增删「上课时间段」行。
 *
 * 只做界面交互，不做校验 —— 校验统一在服务端（src/services/adminService.js）。
 */

(function () {
  const body = document.getElementById('ct-body');
  const template = document.getElementById('ct-row-template');
  const addButton = document.querySelector('[data-add-row]');
  const emptyHint = document.getElementById('ct-empty');

  if (!body || !template || !addButton) return;

  function refreshEmptyHint() {
    if (emptyHint) {
      emptyHint.style.display = body.querySelectorAll('.ct-row').length === 0 ? '' : 'none';
    }
  }

  function bindRemove(row) {
    const button = row.querySelector('[data-remove-row]');
    if (!button) return;
    button.addEventListener('click', function () {
      row.remove();
      refreshEmptyHint();
    });
  }

  addButton.addEventListener('click', function () {
    const row = template.content.firstElementChild.cloneNode(true);
    body.appendChild(row);
    bindRemove(row);
    refreshEmptyHint();
    const firstInput = row.querySelector('select[name="ct_day"]');
    if (firstInput) firstInput.focus();
  });

  body.querySelectorAll('.ct-row').forEach(bindRemove);
  refreshEmptyHint();
})();
