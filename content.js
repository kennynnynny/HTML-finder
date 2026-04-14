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
    showInfoPanel: true,
    panelPosition: 'top',
    extensionEnabled: true
  };

  // === Состояние ===
  let hoveredElement = null;
  let highlightOverlay = null;
  let infoPanel = null;
  let distancePanel = null; // Панель расстояния между элементами
  let toastElement = null;
  let settings = { ...DEFAULTS };
  let lockedSelection = null; // Элемент, зафиксированный через Ctrl+Scroll (null = обычный режим наведения)
  let draggingElement = null; // Элемент, с которого начали измерение расстояния

  // Box Model оверлеи (визуализация margin/padding)
  let boxModelOverlay = null;
  let marginOverlay = null;
  let paddingOverlay = null;

  // Визуализация расстояния между элементами
  let distanceLine = null;
  let distanceLabel = null;

  // === Инициализация ===
  async function init() {
    await loadSettings();
    createOverlay();
    createInfoPanel();
    createDistancePanel();
    createBoxModelOverlays();
    createDistanceVisuals();
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
        // Скрыть UI если расширение отключено или панель отключена
        if (!settings.extensionEnabled || !settings.showInfoPanel) {
          hideOverlay();
          hideInfoPanel();
          hoveredElement = null;
        }
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
      border: 2px solid #00d4ff;
      background: rgba(0, 212, 255, 0.08);
      border-radius: 2px;
      z-index: 2147483647;
      display: none;
      box-shadow: 0 0 0 1px rgba(0, 212, 255, 0.3);
    `;
    document.documentElement.appendChild(highlightOverlay);
  }

  // === Box Model оверлеи (визуализация margin/padding) ===
  function createBoxModelOverlays() {
    // Базовый стиль для всех box model слоёв
    const baseStyle = `
      position: fixed;
      pointer-events: none;
      z-index: 2147483646;
      display: none;
      transition: opacity 0.1s ease;
    `;

    // Margin — яркий оранжевый
    marginOverlay = document.createElement('div');
    marginOverlay.id = 'html-copy-hover-margin';
    marginOverlay.style.cssText = baseStyle + 'background: rgba(255, 120, 0, 0.4); border: 1px solid rgba(255, 120, 0, 0.8);';
    document.documentElement.appendChild(marginOverlay);

    // Padding — яркий зелёный
    paddingOverlay = document.createElement('div');
    paddingOverlay.id = 'html-copy-hover-padding';
    paddingOverlay.style.cssText = baseStyle + 'background: rgba(0, 180, 0, 0.35); border: 1px solid rgba(0, 180, 0, 0.7);';
    document.documentElement.appendChild(paddingOverlay);

    // Content — яркий синий
    boxModelOverlay = document.createElement('div');
    boxModelOverlay.id = 'html-copy-hover-content';
    boxModelOverlay.style.cssText = baseStyle + 'background: rgba(0, 120, 255, 0.2); border: 2px solid rgba(0, 120, 255, 0.8);';
    document.documentElement.appendChild(boxModelOverlay);
  }

  // === Обновление box model оверлеев ===
  function updateBoxModel(el) {
    if (!el || el === document.body || el === document.documentElement) {
      marginOverlay.style.display = 'none';
      paddingOverlay.style.display = 'none';
      boxModelOverlay.style.display = 'none';
      return;
    }

    const cs = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    const mt = parseInt(cs.marginTop) || 0;
    const mr = parseInt(cs.marginRight) || 0;
    const mb = parseInt(cs.marginBottom) || 0;
    const ml = parseInt(cs.marginLeft) || 0;

    const pt = parseInt(cs.paddingTop) || 0;
    const pr = parseInt(cs.paddingRight) || 0;
    const pb = parseInt(cs.paddingBottom) || 0;
    const pl = parseInt(cs.paddingLeft) || 0;

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    // Margin box: размер = rect + margin
    const marginW = rect.width + ml + mr;
    const marginH = rect.height + mt + mb;
    marginOverlay.style.top = `${rect.top + scrollY - mt}px`;
    marginOverlay.style.left = `${rect.left + scrollX - ml}px`;
    marginOverlay.style.width = `${marginW}px`;
    marginOverlay.style.height = `${marginH}px`;
    marginOverlay.style.display = 'block';

    // Padding box: начинается от края rect, размер = rect.width/height
    paddingOverlay.style.top = `${rect.top + scrollY}px`;
    paddingOverlay.style.left = `${rect.left + scrollX}px`;
    paddingOverlay.style.width = `${rect.width}px`;
    paddingOverlay.style.height = `${rect.height}px`;
    paddingOverlay.style.display = 'block';

    // Content box: rect минус padding
    const contentW = rect.width - pl - pr;
    const contentH = rect.height - pt - pb;
    boxModelOverlay.style.top = `${rect.top + scrollY + pt}px`;
    boxModelOverlay.style.left = `${rect.left + scrollX + pl}px`;
    boxModelOverlay.style.width = `${contentW}px`;
    boxModelOverlay.style.height = `${contentH}px`;
    boxModelOverlay.style.display = 'block';
  }

  // === Создание информационной панели ===
  function createInfoPanel() {
    infoPanel = document.createElement('div');
    infoPanel.id = 'html-copy-hover-info-panel';
    Object.assign(infoPanel.style, {
      position: 'fixed',
      background: '#fff9e6',
      color: '#333',
      fontFamily: 'monospace, system-ui, sans-serif',
      fontSize: '12px',
      padding: '4px 10px',
      borderRadius: '4px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      pointerEvents: 'none',
      zIndex: '2147483647',
      opacity: '0',
      transition: 'opacity 0.15s ease',
      whiteSpace: 'nowrap',
    });
    document.documentElement.appendChild(infoPanel);
  }

  // === Создание панели расстояния ===
  function createDistancePanel() {
    distancePanel = document.createElement('div');
    distancePanel.id = 'html-copy-hover-distance-panel';
    Object.assign(distancePanel.style, {
      position: 'fixed',
      background: '#ffeaa7',
      color: '#333',
      fontFamily: 'monospace, system-ui, sans-serif',
      fontSize: '12px',
      padding: '4px 10px',
      borderRadius: '4px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      pointerEvents: 'none',
      zIndex: '2147483647',
      opacity: '0',
      transition: 'opacity 0.1s ease',
      whiteSpace: 'nowrap',
    });
    document.documentElement.appendChild(distancePanel);
  }

  // === Визуализация расстояния между элементами (линия + метка) ===
  function createDistanceVisuals() {
    const baseStyle = `
      position: fixed;
      pointer-events: none;
      z-index: 2147483647;
      display: none;
    `;

    // Линия — SVG элемент
    distanceLine = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    distanceLine.id = 'html-copy-hover-distance-line';
    distanceLine.style.cssText = baseStyle;
    Object.assign(distanceLine.style, {
      overflow: 'visible',
    });
    document.documentElement.appendChild(distanceLine);

    // Метка расстояния
    distanceLabel = document.createElement('div');
    distanceLabel.id = 'html-copy-hover-distance-label';
    Object.assign(distanceLabel.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483647',
      display: 'none',
      background: '#ff4444',
      color: 'white',
      fontFamily: 'monospace, system-ui, sans-serif',
      fontSize: '11px',
      fontWeight: '700',
      padding: '2px 6px',
      borderRadius: '3px',
      whiteSpace: 'nowrap',
      transform: 'translate(-50%, -50%)',
    });
    document.documentElement.appendChild(distanceLabel);
  }

  // === Обновление визуализации расстояния ===
  function updateDistanceVisuals(el1, el2) {
    if (!el1 || !el2 || !distanceLine || !distanceLabel) {
      distanceLine.style.display = 'none';
      distanceLabel.style.display = 'none';
      return;
    }

    const rect1 = el1.getBoundingClientRect();
    const rect2 = el2.getBoundingClientRect();

    // Центры элементов
    const x1 = rect1.left + rect1.width / 2;
    const y1 = rect1.top + rect1.height / 2;
    const x2 = rect2.left + rect2.width / 2;
    const y2 = rect2.top + rect2.height / 2;

    // Расстояние между центрами
    const dist = Math.round(Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2));

    // Настраиваем SVG
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const maxX = Math.max(x1, x2);
    const maxY = Math.max(y1, y2);
    const padding = 10;

    distanceLine.style.left = `${minX - padding}px`;
    distanceLine.style.top = `${minY - padding}px`;
    distanceLine.style.width = `${maxX - minX + padding * 2}px`;
    distanceLine.style.height = `${maxY - minY + padding * 2}px`;
    distanceLine.style.display = 'block';

    // Линия
    distanceLine.innerHTML = `
      <line x1="${x1 - minX + padding}" y1="${y1 - minY + padding}" 
            x2="${x2 - minX + padding}" y2="${y2 - minY + padding}" 
            stroke="#ff4444" stroke-width="2" stroke-dasharray="4,3"/>
      <circle cx="${x1 - minX + padding}" cy="${y1 - minY + padding}" r="4" fill="#ff4444"/>
      <circle cx="${x2 - minX + padding}" cy="${y2 - minY + padding}" r="4" fill="#ff4444"/>
    `;

    // Метка посередине
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    distanceLabel.textContent = `${dist}px`;
    distanceLabel.style.left = `${midX}px`;
    distanceLabel.style.top = `${midY - 16}px`;
    distanceLabel.style.display = 'block';
  }

  // === Скрытие визуализации расстояния ===
  function hideDistanceVisuals() {
    if (distanceLine) distanceLine.style.display = 'none';
    if (distanceLabel) distanceLabel.style.display = 'none';
  }

  // === Получение информации об элементе для панели ===
  function getElementInfo(el) {
    const rect = el.getBoundingClientRect();
    const size = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    const classes = el.classList.length ? `.${[...el.classList].join(' .')}` : '—';
    return `${size}  |  ${classes}`;
  }

  // === Обновление содержимого и позиции панели ===
  function updateInfoPanel(el) {
    if (!infoPanel || !el) return;

    const rect = el.getBoundingClientRect();

    infoPanel.textContent = getElementInfo(el);

    // Сначала сбрасываем позицию, чтобы получить реальные размеры панели
    infoPanel.style.top = '';
    infoPanel.style.left = '';
    infoPanel.style.bottom = '';

    const panelRect = infoPanel.getBoundingClientRect();
    const panelW = panelRect.width;
    const panelH = panelRect.height;
    const gap = 4; // отступ от элемента
    const viewportW = window.innerWidth;
    const scrollY = window.scrollY;

    // Горизонтальное позиционирование: центрируем по элементу, но не выходим за края
    let left = rect.left + (rect.width - panelW) / 2;
    // Ограничиваем левой и правой границей viewport
    left = Math.max(4, Math.min(left, viewportW - panelW - 4));
    infoPanel.style.left = `${left}px`;

    // Вертикальное позиционирование по настройке
    if (settings.panelPosition === 'bottom') {
      // Снизу от элемента
      let top = rect.bottom + scrollY + gap;
      // Если выходит за нижний край — показываем сверху
      if (top + panelH > scrollY + window.innerHeight) {
        top = rect.top + scrollY - panelH - gap;
      }
      infoPanel.style.top = `${top}px`;
      infoPanel.style.bottom = 'auto';
    } else {
      // Сверху от элемента (по умолчанию)
      let top = rect.top + scrollY - panelH - gap;
      // Если выходит за верхний край — показываем снизу
      if (top < scrollY) {
        top = rect.bottom + scrollY + gap;
      }
      infoPanel.style.top = `${top}px`;
      infoPanel.style.bottom = 'auto';
    }
  }

  // === Показ информационной панели ===
  function showInfoPanel() {
    if (!infoPanel || !settings.showInfoPanel) return;
    infoPanel.style.opacity = '1';
  }

  // === Скрытие информационной панели ===
  function hideInfoPanel() {
    if (!infoPanel) return;
    infoPanel.style.opacity = '0';
  }

  // === Скрытие box model оверлеев ===
  function hideBoxModel() {
    if (marginOverlay) marginOverlay.style.display = 'none';
    if (paddingOverlay) paddingOverlay.style.display = 'none';
    if (boxModelOverlay) boxModelOverlay.style.display = 'none';
  }

  // === Привязка слушателей событий ===
  function attachEventListeners() {
    // Отслеживание наведения на элементы
    document.addEventListener('mouseenter', onMouseEnter, true);
    document.addEventListener('mouseleave', onMouseLeave, true);

    // Перехват кликов в фазе погружения
    document.addEventListener('click', onClick, true);

    // Навигация по DOM через Ctrl + колесико мыши
    document.addEventListener('wheel', onWheel, { capture: true, passive: false });

    // Навигация по DOM через Ctrl + стрелки клавиатуры
    document.addEventListener('keydown', onKeyDown, true);

    // Измерение расстояния: Alt + mousedown + mousemove + mouseup
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mousemove', onMouseMoveForDistance, true);
    document.addEventListener('mouseup', onMouseUp, true);
  }

  // === Единая функция выбора элемента (подсветка + инфо-панель + box model) ===
  function selectElement(el) {
    if (!el || el === document.body || el === document.documentElement) {
      hideOverlay();
      hideInfoPanel();
      hideBoxModel();
      hoveredElement = null;
      lockedSelection = null;
      return;
    }

    hoveredElement = el;
    updateOverlayPosition(el);
    updateInfoPanel(el);
    updateBoxModel(el);
    showOverlay();
    showInfoPanel();
  }

  // === Навигация по DOM через Ctrl + Scroll ===
  function onWheel(e) {
    // Реагируем только на Ctrl + колесико
    if (!e.ctrlKey && !e.metaKey) return;

    e.preventDefault();
    e.stopPropagation();

    if (!settings.extensionEnabled) return;

    // Определяем текущий элемент: зафиксированный или под курсором
    const current = lockedSelection || hoveredElement;
    if (!current) return;

    let next = null;

    if (e.deltaY < 0) {
      // Колесико ВВЕРХ — поднимаемся к родителю
      next = current.parentElement;
    } else {
      // Колесико ВНИЗ — спускаемся к первому ребёнку или следующему соседу
      next = current.firstElementChild || current.nextElementSibling;
    }

    if (next && next !== document.body && next !== document.documentElement) {
      lockedSelection = next;
      selectElement(next);
    }
  }

  // === Навигация по DOM через Ctrl + стрелки клавиатуры ===
  function onKeyDown(e) {
    if (!(e.ctrlKey || e.metaKey)) return;

    const key = e.key;
    if (key !== 'ArrowUp' && key !== 'ArrowDown') return;

    e.preventDefault();
    e.stopPropagation();

    if (!settings.extensionEnabled) return;

    const current = lockedSelection || hoveredElement;
    if (!current) return;

    let next = null;

    if (key === 'ArrowUp') {
      // Ctrl + ↑ — поднимаемся к родителю
      next = current.parentElement;
    } else {
      // Ctrl + ↓ — спускаемся к первому ребёнку или следующему соседу
      next = current.firstElementChild || current.nextElementSibling;
    }

    if (next && next !== document.body && next !== document.documentElement) {
      lockedSelection = next;
      selectElement(next);
    }
  }

  // === Измерение расстояния между элементами (Alt + мousedown + наведение) ===
  function onMouseDown(e) {
    if (!e.altKey || !settings.extensionEnabled) return;

    const target = e.target;
    if (!target || target === highlightOverlay || target === toastElement || target === infoPanel || target === distancePanel) return;
    if (target === document.body || target === document.documentElement) return;

    draggingElement = target;
    e.preventDefault();
  }

  function onMouseMoveForDistance(e) {
    if (!draggingElement) return;

    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target === draggingElement || target === document.body || target === document.documentElement) {
      hideDistanceVisuals();
      return;
    }

    updateDistanceVisuals(draggingElement, target);
  }

  function onMouseUp() {
    hideDistanceVisuals();
    draggingElement = null;
  }

  // === Обработка mouseenter ===
  function onMouseEnter(e) {
    if (!settings.extensionEnabled) return;

    const target = e.target;

    // Игнорируем служебные элементы
    if (!target || target === highlightOverlay || target === toastElement || target === infoPanel) {
      return;
    }

    // Обычное наведение сбрасывает ручной выбор (Ctrl+Scroll)
    lockedSelection = null;

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
    updateBoxModel(target);
    showOverlay();
    showInfoPanel();
  }

  // === Обработка mouseleave ===
  function onMouseLeave(e) {
    // Проверяем, что курсор покинул hoveredElement
    if (e.target === hoveredElement) {
      hideOverlay();
      hideInfoPanel();
      hideBoxModel();
      hoveredElement = null;
    }
  }

  // === Обработка клика ===
  function onClick(e) {
    if (!settings.extensionEnabled) return;

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
      case 'styles':
        return Array.from(element.classList || []).join(' ');
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
