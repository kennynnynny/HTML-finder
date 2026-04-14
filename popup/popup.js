// popup/popup.js
'use strict';

const DEFAULTS = {
  format: 'outerHTML',
  trigger: 'ctrl',
  showToast: true,
  extensionEnabled: true
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
  document.getElementById('extensionEnabled').checked = result.extensionEnabled;

  // Автосохранение при любом изменении
  const inputs = [
    document.getElementById('format'),
    ...document.querySelectorAll('input[name="trigger"]'),
    document.getElementById('showToast'),
    document.getElementById('extensionEnabled'),
  ];

  inputs.forEach(input => {
    input.addEventListener('change', saveSettings);
  });
});

// Сбор и сохранение настроек
async function saveSettings() {
  const settings = {
    format: document.getElementById('format').value,
    trigger: document.querySelector('input[name="trigger"]:checked')?.value || 'ctrl',
    showToast: document.getElementById('showToast').checked,
    extensionEnabled: document.getElementById('extensionEnabled').checked
  };

  await chrome.storage.local.set(settings);
  showStatus('✅ Сохранено', 'success');

  // Уведомить content script об изменении
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'settingsUpdated', settings }).catch(() => {});
    }
  } catch (e) {
    // Игнорируем ошибки отправки
  }
}

function showStatus(message, type) {
  const el = document.getElementById('status');
  el.textContent = message;
  el.className = `status-message ${type}`;
  setTimeout(() => {
    el.textContent = '';
    el.className = 'status-message';
  }, 1500);
}
