/**
 * HTML Copy on Hover - Content Script
 * Копирование HTML-разметки элементов по Ctrl+Click с визуальной подсветкой
 */

(function () {
  'use strict';

  // === Состояние ===
  let hoveredElement = null;
  let highlightOverlay = null;
  let toastElement = null;

  // === Инициализация ===
  function init() {
    createOverlay();
    attachEventListeners();
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
    if (!target || target === highlightOverlay || target === toastElement) {
      return;
    }

    // Игнорируем body и html
    if (target === document.body || target === document.documentElement) {
      hideOverlay();
      hoveredElement = null;
      return;
    }

    hoveredElement = target;
    updateOverlayPosition(target);
    showOverlay();
  }

  // === Обработка mouseleave ===
  function onMouseLeave(e) {
    // Проверяем, что курсор покинул hoveredElement
    if (e.target === hoveredElement) {
      hideOverlay();
      hoveredElement = null;
    }
  }

  // === Обработка клика ===
  function onClick(e) {
    // Проверяем модификатор Ctrl (Cmd на Mac)
    if (!e.ctrlKey && !e.metaKey) {
      return;
    }

    // Предотвращаем стандартное поведение только при Ctrl+Click
    e.preventDefault();
    e.stopPropagation();

    if (!hoveredElement) {
      showToast('⚠️ Наведите курсор на элемент', 'warning');
      return;
    }

    // Копируем outerHTML
    const html = hoveredElement.outerHTML.trim();
    
    copyToClipboard(html)
      .then(() => {
        showToast('✅ HTML скопирован', 'success');
        hideOverlay();
      })
      .catch((err) => {
        console.error('Clipboard error:', err);
        showToast('❌ Ошибка копирования', 'error');
      });
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

    // Автоматическое скрытие через 2 секунды
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
    }, 2000);
  }

  // === Запуск ===
  // Ждём полной загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
