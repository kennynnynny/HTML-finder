// popup/popup.js
'use strict';

const DEFAULTS = {
  format: 'outerHTML',
  trigger: 'ctrl',
  showToast: true,
  toastDuration: 2
};

// Загрузка настроек при открытии popup
document.addEventListener('DOMContentLoaded', async () => {
  const result = await chrome.storage.local.get(DEFAULTS);

  document.getElementById('format').value = result.format;
  const triggerRadio = document.querySelector(`input[name="trigger"][value="${result.trigger}"]`);
  if (triggerRadio) {
    triggerRadio.checked = true;
  }
  document.getElementById('showToast').checked = result.showToast;
  document.getElementById('toastDuration').value = result.toastDuration;
});

// Сохранение настроек
document.getElementById('saveBtn').addEventListener('click', async () => {
  const settings = {
    format: document.getElementById('format').value,
    trigger: document.querySelector('input[name="trigger"]:checked')?.value || 'ctrl',
    showToast: document.getElementById('showToast').checked,
    toastDuration: parseInt(document.getElementById('toastDuration').value, 10) || 2
  };

  await chrome.storage.local.set(settings);

  // Уведомление в popup
  showStatus('✅ Настройки сохранены!', 'success');

  // Уведомить content script об изменении (для мгновенного применения)
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'settingsUpdated', settings }).catch(() => {});
    }
  } catch (e) {
    // Игнорируем ошибки отправки сообщения
  }
});

// Сброс к настройкам по умолчанию
document.getElementById('resetBtn').addEventListener('click', async () => {
  await chrome.storage.local.clear();
  await chrome.storage.local.set(DEFAULTS);
  // Перезагружаем popup с дефолтными значениями
  window.location.reload();
});

// Вспомогательная функция
function showStatus(message, type) {
  const el = document.getElementById('status');
  el.textContent = message;
  el.className = `status-message ${type}`;
  setTimeout(() => {
    el.textContent = '';
    el.className = 'status-message';
  }, 2000);
}
