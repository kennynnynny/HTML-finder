/**
 * HTML Copy on Hover - Content Script
 * Копирование HTML-разметки элементов по клику с визуальной подсветкой
 */

(function () {
  'use strict';

  // === Настройки по умолчанию ===
  const DEFAULTS = {
    format: 'outerHTML',
    trigger: 'ctrl',
    showToast: true,
    toastDuration: 2
  };

  // === Состояние ===
  let hoveredElement = null;
  let highlightOverlay = null;
  let infoPanel = null;
  let toastElement = null;
  let settings = { ...DEFAULTS };

  // === Инициализация ===
  async function init() {
    await loadSettings();
    createOverlay();
    createInfoPanel();
    attachEventListeners();
    attachMessageListener();
  }

  // === Загрузка настроек из storage ===
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(DEFAULTS);
      settings = { ...DEFAULTS, ...result };
    } catch (e) {
      console.warn('[HTML Copy] Не удалось загрузить настройки:', e);
    }
  }

  // === Слушатель сообщений от popup ===
  function attachMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'settingsUpdated') {
        settings = { ...settings, ...message.settings };
      }
    });
  }

  // === Создание оверлея подсветки ===
  function createOverlay() {
    highlightOverlay = document.createElement('div');
    highlightOverlay.id = 'html-copy-hover-overlay';
    highlightOverlay.style.cssText = `
      position: fixed;
      pointer-events: none;
      border: 2px solid #4A90E2;
      background: rgba(74, 144, 226, 0.1);
      border-radius: 4px;
      z-index: 2147483647;
      display: none;
      transition: opacity 0.1s ease;
    `;
    document.documentElement.appendChild(highlightOverlay);
  }

  // === Создание информационной панели ===
  function createInfoPanel() {
    infoPanel = document.createElement('div');
    infoPanel.id = 'html-copy-hover-info-panel';
    Object.assign(infoPanel.style, {
      position: 'fixed',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#fff9e6',
      color: '#333',
      fontFamily: 'monospace, system-ui, sans-serif',
      fontSize: '13px',
      padding: '6px 12px',
      borderRadius: '6px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      pointerEvents: 'none',
      zIndex: '2147483647',
      opacity: '0',
      transition: 'opacity 0.15s ease, transform 0.15s ease',
      whiteSpace: 'nowrap',
    });
    document.documentElement.appendChild(infoPanel);
  }

  // === Получение информации об элементе для панели ===
  function getElementInfo(el) {
    const tag = el.tagName.toLowerCase();
    const rect = el.getBoundingClientRect();
    const size = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    const id = el.id ? `#${el.id}` : '—';
    const classes = el.classList.length ? `.${[...el.classList].join(' .')}` : '—';
    return `[ ${tag} ]  ${size}  |  ${id}  |  ${classes}`;
  }

  // === Обновление содержимого панели ===
  function updateInfoPanel(el) {
    if (!infoPanel || !el) return;
    infoPanel.textContent = getElementInfo(el);
  }

  // === Показ информационной панели ===
  function showInfoPanel() {
    if (!infoPanel) return;
    infoPanel.style.opacity = '1';
  }

  // === Скрытие информационной панели ===
  function hideInfoPanel() {
    if (!infoPanel) return;
    infoPanel.style.opacity = '0';
  }

  // === Привязка слушателей событий ===
  function attachEventListeners() {
    // Отслеживание наведения на элементы
    document.addEventListener('mouseenter', onMouseEnter, true);
    document.addEventListener('mouseleave', onMouseLeave, true);
    
    // Перехват кликов в фазе погружения
    document.addEventListener('click', onClick, true);
  }

  // === Обработка mouseenter ===
  function onMouseEnter(e) {
    const target = e.target;

    // Игнорируем служебные элементы
    if (!target || target === highlightOverlay || target === toastElement || target === infoPanel) {
      return;
    }

    // Игнорируем body и html
    if (target === document.body || target === document.documentElement) {
      hideOverlay();
      hideInfoPanel();
      hoveredElement = null;
      return;
    }

    hoveredElement = target;
    updateOverlayPosition(target);
    updateInfoPanel(target);
    showOverlay();
    showInfoPanel();
  }

  // === Обработка mouseleave ===
  function onMouseLeave(e) {
    // Проверяем, что курсор покинул hoveredElement
    if (e.target === hoveredElement) {
      hideOverlay();
      hideInfoPanel();
      hoveredElement = null;
    }
  }

  // === Обработка клика ===
  function onClick(e) {
    // Проверка триггера
    if (!isTriggerActive(e)) {
      return;
    }

    // Предотвращаем стандартное поведение только при активном триггере
    e.preventDefault();
    e.stopPropagation();

    if (!hoveredElement) {
      showToast('⚠️ Наведите курсор на элемент', 'warning');
      return;
    }

    // Получаем HTML в выбранном формате
    const html = getHtmlFromElement(hoveredElement);

    copyToClipboard(html)
      .then(() => {
        if (settings.showToast) {
          showToast('✅ HTML скопирован', 'success');
        }
        hideOverlay();
      })
      .catch((err) => {
        console.error('Clipboard error:', err);
        if (settings.showToast) {
          showToast('❌ Ошибка копирования', 'error');
        }
      });
  }

  // === Проверка активного триггера ===
  function isTriggerActive(e) {
    switch (settings.trigger) {
      case 'ctrl':
        return e.ctrlKey || e.metaKey; // Ctrl или Cmd на Mac
      case 'alt':
        return e.altKey;
      case 'shift':
        return e.shiftKey;
      case 'none':
        return true; // Просто клик без модификаторов
      default:
        return e.ctrlKey || e.metaKey;
    }
  }

  // === Получение HTML из элемента в выбранном формате ===
  function getHtmlFromElement(element) {
    switch (settings.format) {
      case 'innerHTML':
        return element.innerHTML.trim();
      case 'attributes':
        return Array.from(element.attributes || [])
          .map(attr => `${attr.name}="${attr.value}"`)
          .join(' ');
      case 'outerHTML':
      default:
        return element.outerHTML.trim();
    }
  }

  // === Обновление позиции оверлея ===
  function updateOverlayPosition(element) {
    if (!highlightOverlay || !element) return;

    const rect = element.getBoundingClientRect();
    
    highlightOverlay.style.top = `${rect.top + window.scrollY}px`;
    highlightOverlay.style.left = `${rect.left + window.scrollX}px`;
    highlightOverlay.style.width = `${rect.width}px`;
    highlightOverlay.style.height = `${rect.height}px`;
  }

  // === Показ оверлея ===
  function showOverlay() {
    if (highlightOverlay) {
      highlightOverlay.style.display = 'block';
    }
  }

  // === Скрытие оверлея ===
  function hideOverlay() {
    if (highlightOverlay) {
      highlightOverlay.style.display = 'none';
    }
  }

  // === Копирование в буфер обмена ===
  async function copyToClipboard(text) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      throw new Error('Clipboard API not available');
    }
    
    await navigator.clipboard.writeText(text);
  }

  // === Показ Toast-уведомления ===
  function showToast(message, type = 'success') {
    // Удаляем существующий toast
    if (toastElement) {
      toastElement.remove();
    }

    // Цвета для разных типов уведомлений
    const colors = {
      success: '#4CAF50',
      error: '#F44336',
      warning: '#FF9800',
    };

    const bgColor = colors[type] || colors.success;

    // Создаём toast
    toastElement = document.createElement('div');
    toastElement.id = 'html-copy-hover-toast';
    toastElement.textContent = message;
    toastElement.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: ${bgColor};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      z-index: 2147483647;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      opacity: 0;
      transition: opacity 0.2s ease;
    `;

    document.body.appendChild(toastElement);

    // Анимация появления
    requestAnimationFrame(() => {
      toastElement.style.opacity = '1';
    });

    // Автоматическое скрытие через настроенную длительность
    const duration = (settings.toastDuration || 2) * 1000; // сек → мс
    setTimeout(() => {
      if (toastElement) {
        toastElement.style.opacity = '0';
        setTimeout(() => {
          if (toastElement && toastElement.parentNode) {
            toastElement.remove();
            toastElement = null;
          }
        }, 200);
      }
    }, duration);
  }

  // === Запуск ===
  // Ждём полной загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
