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

  // Box Model оверлеи (визуализация margin/padding)
  let boxModelOverlay = null;
  let marginOverlay = null;
  let paddingOverlay = null;

  // Второй оверлей подсветки (для второго элемента при измерении)
  let secondOverlay = null;

  // Визуализация расстояния между элементами
  let distanceLine = null;
  let distanceLabel = null;

  // === Инициализация ===
  async function init() {
    await loadSettings();
    createOverlay();
    createSecondOverlay();
    createInfoPanel();
    createDistancePanel();
    createBoxModelOverlays();
    createDistanceVisuals();
    attachEventListeners();
    attachMessageListener();
  }

  // === Создание второго оверлея подсветки ===
  function createSecondOverlay() {
    secondOverlay = document.createElement('div');
    secondOverlay.id = 'html-copy-hover-overlay2';
    secondOverlay.style.cssText = `
      position: fixed;
      pointer-events: none;
      border: 0.5px solid rgba(255, 118, 117, 0.9);
      background: rgba(255, 118, 117, 0.05);
      border-radius: 0;
      z-index: 2147483647;
      display: none;
      box-shadow: 0 0 0 0.5px rgba(255, 118, 117, 0.15);
    `;
    document.documentElement.appendChild(secondOverlay);
  }

  // === Обновление второго оверлея ===
  function updateSecondOverlay(el) {
    if (!secondOverlay || !el) {
      secondOverlay.style.display = 'none';
      return;
    }
    const rect = el.getBoundingClientRect();
    secondOverlay.style.top = `${rect.top}px`;
    secondOverlay.style.left = `${rect.left}px`;
    secondOverlay.style.width = `${rect.width}px`;
    secondOverlay.style.height = `${rect.height}px`;
    secondOverlay.style.display = 'block';
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

  // === Слушатель сообщений от panel ===
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
      border: 0.5px solid rgba(78, 205, 196, 0.9);
      background: rgba(78, 205, 196, 0.05);
      border-radius: 0;
      z-index: 2147483647;
      display: none;
      box-shadow: 0 0 0 0.5px rgba(78, 205, 196, 0.15);
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

    // Margin — мягкий коралловый
    marginOverlay = document.createElement('div');
    marginOverlay.id = 'html-copy-hover-margin';
    marginOverlay.style.cssText = baseStyle + 'background: rgba(255, 154, 139, 0.25); border: 1px solid rgba(255, 154, 139, 0.5);';
    document.documentElement.appendChild(marginOverlay);

    // Padding — мягкий мятный
    paddingOverlay = document.createElement('div');
    paddingOverlay.id = 'html-copy-hover-padding';
    paddingOverlay.style.cssText = baseStyle + 'background: rgba(130, 214, 178, 0.25); border: 1px solid rgba(130, 214, 178, 0.5);';
    document.documentElement.appendChild(paddingOverlay);

    // Content — мягкий лавандовый
    boxModelOverlay = document.createElement('div');
    boxModelOverlay.id = 'html-copy-hover-content';
    boxModelOverlay.style.cssText = baseStyle + 'background: rgba(170, 160, 230, 0.18); border: 1px solid rgba(170, 160, 230, 0.55);';
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

    // position: fixed — координаты уже относительно viewport, scroll не нужен

    // Margin box: размер = rect + margin
    const marginW = rect.width + ml + mr;
    const marginH = rect.height + mt + mb;
    marginOverlay.style.top = `${rect.top - mt}px`;
    marginOverlay.style.left = `${rect.left - ml}px`;
    marginOverlay.style.width = `${marginW}px`;
    marginOverlay.style.height = `${marginH}px`;
    marginOverlay.style.display = 'block';

    // Padding box: начинается от края rect, размер = rect.width/height
    paddingOverlay.style.top = `${rect.top}px`;
    paddingOverlay.style.left = `${rect.left}px`;
    paddingOverlay.style.width = `${rect.width}px`;
    paddingOverlay.style.height = `${rect.height}px`;
    paddingOverlay.style.display = 'block';

    // Content box: rect минус padding
    const contentW = rect.width - pl - pr;
    const contentH = rect.height - pt - pb;
    boxModelOverlay.style.top = `${rect.top + pt}px`;
    boxModelOverlay.style.left = `${rect.left + pl}px`;
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
      background: '#ff7675',
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
      if (distanceLine) distanceLine.style.display = 'none';
      if (distanceLabel) distanceLabel.style.display = 'none';
      return;
    }

    const rect1 = el1.getBoundingClientRect();
    const rect2 = el2.getBoundingClientRect();

    // Определяем расстояние от края до края
    const hGapLeftToRight = Math.max(0, rect2.left - rect1.right);
    const hGapRightToLeft = Math.max(0, rect1.left - rect2.right);
    const hGap = hGapLeftToRight || hGapRightToLeft;

    const vGapTopToBottom = Math.max(0, rect2.top - rect1.bottom);
    const vGapBottomToTop = Math.max(0, rect1.top - rect2.bottom);
    const vGap = vGapTopToBottom || vGapBottomToTop;

    const isHorizontal = hGapLeftToRight > 0 || hGapRightToLeft > 0;
    const isVertical = vGapTopToBottom > 0 || vGapBottomToTop > 0;

    const pad = 20;

    if (isHorizontal) {
      // Горизонтальная линия между краями элементов
      const fromRight = hGapLeftToRight > 0;
      const lineY = (Math.max(rect1.top, rect2.top) + Math.min(rect1.bottom, rect2.bottom)) / 2;
      const fromX = fromRight ? rect1.right : rect2.right;
      const toX = fromRight ? rect2.left : rect1.left;

      distanceLine.style.left = `${fromX - pad}px`;
      distanceLine.style.top = `${lineY - pad}px`;
      distanceLine.style.width = `${Math.abs(toX - fromX) + pad * 2}px`;
      distanceLine.style.height = `${pad * 2}px`;
      distanceLine.style.display = 'block';

      distanceLine.innerHTML = `
        <line x1="${pad}" y1="${pad}" x2="${Math.abs(toX - fromX) + pad}" y2="${pad}"
              stroke="#ff7675" stroke-width="1.5" stroke-dasharray="4,3"/>
        <circle cx="${pad}" cy="${pad}" r="3" fill="#ff7675"/>
        <circle cx="${Math.abs(toX - fromX) + pad}" cy="${pad}" r="3" fill="#ff7675"/>
      `;

      distanceLabel.textContent = `↔ ${hGap}px`;
      distanceLabel.style.left = `${(fromX + toX) / 2}px`;
      distanceLabel.style.top = `${lineY - 20}px`;
      distanceLabel.style.transform = 'translateX(-50%)';
      distanceLabel.style.display = 'block';

    } else if (isVertical) {
      // Вертикальная линия между краями элементов
      const fromBottom = vGapTopToBottom > 0;
      const lineX = (Math.max(rect1.left, rect2.left) + Math.min(rect1.right, rect2.right)) / 2;
      const fromY = fromBottom ? rect1.bottom : rect2.bottom;
      const toY = fromBottom ? rect2.top : rect1.top;

      distanceLine.style.left = `${lineX - pad}px`;
      distanceLine.style.top = `${fromY - pad}px`;
      distanceLine.style.width = `${pad * 2}px`;
      distanceLine.style.height = `${Math.abs(toY - fromY) + pad * 2}px`;
      distanceLine.style.display = 'block';

      distanceLine.innerHTML = `
        <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${Math.abs(toY - fromY) + pad}"
              stroke="#ff7675" stroke-width="1.5" stroke-dasharray="4,3"/>
        <circle cx="${pad}" cy="${pad}" r="3" fill="#ff7675"/>
        <circle cx="${pad}" cy="${Math.abs(toY - fromY) + pad}" r="3" fill="#ff7675"/>
      `;

      distanceLabel.textContent = `↕ ${vGap}px`;
      distanceLabel.style.left = `${lineX}px`;
      distanceLabel.style.top = `${(fromY + toY) / 2}px`;
      distanceLabel.style.transform = 'translate(-50%, -50%)';
      distanceLabel.style.display = 'block';

    } else {
      // Элементы пересекаются — L-образные линии от центра к центру
      const cx1 = rect1.left + rect1.width / 2;
      const cy1 = rect1.top + rect1.height / 2;
      const cx2 = rect2.left + rect2.width / 2;
      const cy2 = rect2.top + rect2.height / 2;
      const minX = Math.min(cx1, cx2);
      const minY = Math.min(cy1, cy2);
      const maxX = Math.max(cx1, cx2);
      const maxY = Math.max(cy1, cy2);

      distanceLine.style.left = `${minX - pad}px`;
      distanceLine.style.top = `${minY - pad}px`;
      distanceLine.style.width = `${maxX - minX + pad * 2}px`;
      distanceLine.style.height = `${maxY - minY + pad * 2}px`;
      distanceLine.style.display = 'block';

      distanceLine.innerHTML = `
        <line x1="${cx1 - minX + pad}" y1="${cy1 - minY + pad}"
              x2="${cx2 - minX + pad}" y2="${cy1 - minY + pad}"
              stroke="#ff7675" stroke-width="1.5" stroke-dasharray="4,3"/>
        <line x1="${cx2 - minX + pad}" y1="${cy1 - minY + pad}"
              x2="${cx2 - minX + pad}" y2="${cy2 - minY + pad}"
              stroke="#ff7675" stroke-width="1.5" stroke-dasharray="4,3"/>
        <circle cx="${cx1 - minX + pad}" cy="${cy1 - minY + pad}" r="3" fill="#ff7675"/>
        <circle cx="${cx2 - minX + pad}" cy="${cy2 - minY + pad}" r="3" fill="#ff7675"/>
      `;

      distanceLabel.textContent = `↔ ${hGap}px  ↕ ${vGap}px`;
      distanceLabel.style.left = `${(cx1 + cx2) / 2}px`;
      distanceLabel.style.top = `${Math.min(cy1, cy2) - 24}px`;
      distanceLabel.style.transform = 'translateX(-50%)';
      distanceLabel.style.display = 'block';
    }
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
    // Отслеживание движения мыши для определения элемента под курсором
    document.addEventListener('mousemove', onMouseMove, true);

    // Перехват кликов в фазе погружения
    document.addEventListener('click', onClick, true);

    // Навигация по DOM через Ctrl + колесико мыши
    document.addEventListener('wheel', onWheel, { capture: true, passive: false });

    // Навигация по DOM через Ctrl + стрелки клавиатуры
    document.addEventListener('keydown', onKeyDown, true);
  }

  // === Обработка движения мыши ===
  let moveThrottle = null;
  function onMouseMove(e) {
    if (!settings.extensionEnabled) return;

    // Определяем элемент надёжно через точку на экране
    const target = document.elementFromPoint(e.clientX, e.clientY);

    // Если зажат Alt — измеряем расстояние
    if (e.altKey) {
      // Фиксируем первый элемент при первом движении с Alt
      if (!measureFirstEl) {
        if (target && target !== document.body && target !== document.documentElement &&
            target !== highlightOverlay && target !== toastElement && target !== infoPanel &&
            target !== marginOverlay && target !== paddingOverlay && target !== boxModelOverlay &&
            target !== distanceLine && target !== distanceLabel && target !== secondOverlay) {
          measureFirstEl = target;
        }
        return;
      }

      // Определяем край экрана для измерения
      const edgeThreshold = 30; // px от края
      const nearLeft = e.clientX < edgeThreshold;
      const nearRight = e.clientX > window.innerWidth - edgeThreshold;
      const nearTop = e.clientY < edgeThreshold;
      const nearBottom = e.clientY > window.innerHeight - edgeThreshold;
      const nearEdge = nearLeft || nearRight || nearTop || nearBottom;

      // Если курсор у края экрана — показываем расстояние от края
      if (nearEdge) {
        hideDistanceVisuals();
        updateSecondOverlay(null);

        const rect1 = measureFirstEl.getBoundingClientRect();
        const cx = e.clientX; // позиция курсора
        const cy = e.clientY;

        if (nearLeft) {
          // Расстояние от левого края экрана до левого края элемента
          const gap = Math.round(rect1.left);
          const lineY = rect1.top + rect1.height / 2;
          distanceLine.style.left = `0px`;
          distanceLine.style.top = `${lineY - 15}px`;
          distanceLine.style.width = `${Math.max(gap, 1) + 20}px`;
          distanceLine.style.height = '30px';
          distanceLine.style.display = 'block';
          distanceLine.innerHTML = `
            <line x1="0" y1="15" x2="${gap}" y2="15"
                  stroke="#ff7675" stroke-width="1.5" stroke-dasharray="4,3"/>
            <circle cx="0" cy="15" r="3" fill="#ff7675"/>
            <circle cx="${gap}" cy="15" r="3" fill="#ff7675"/>
          `;
          distanceLabel.textContent = `↔ ${gap}px (эл: ${Math.round(rect1.width)}×${Math.round(rect1.height)})`;
          distanceLabel.style.left = `${gap / 2}px`;
          distanceLabel.style.top = `${lineY - 20}px`;
          distanceLabel.style.transform = 'translateX(-50%)';
          distanceLabel.style.display = 'block';
        } else if (nearRight) {
          const gap = Math.round(window.innerWidth - rect1.right);
          const lineY = rect1.top + rect1.height / 2;
          const startX = rect1.right;
          distanceLine.style.left = `${startX}px`;
          distanceLine.style.top = `${lineY - 15}px`;
          distanceLine.style.width = `${Math.max(gap, 1) + 10}px`;
          distanceLine.style.height = '30px';
          distanceLine.style.display = 'block';
          distanceLine.innerHTML = `
            <line x1="0" y1="15" x2="${gap}" y2="15"
                  stroke="#ff7675" stroke-width="1.5" stroke-dasharray="4,3"/>
            <circle cx="0" cy="15" r="3" fill="#ff7675"/>
            <circle cx="${gap}" cy="15" r="3" fill="#ff7675"/>
          `;
          distanceLabel.textContent = `↔ ${gap}px (эл: ${Math.round(rect1.width)}×${Math.round(rect1.height)})`;
          distanceLabel.style.left = `${startX + gap / 2}px`;
          distanceLabel.style.top = `${lineY - 20}px`;
          distanceLabel.style.transform = 'translateX(-50%)';
          distanceLabel.style.display = 'block';
        } else if (nearTop) {
          const gap = Math.round(rect1.top);
          const lineX = rect1.left + rect1.width / 2;
          distanceLine.style.left = `${lineX - 15}px`;
          distanceLine.style.top = `0px`;
          distanceLine.style.width = '30px';
          distanceLine.style.height = `${Math.max(gap, 1) + 20}px`;
          distanceLine.style.display = 'block';
          distanceLine.innerHTML = `
            <line x1="15" y1="0" x2="15" y2="${gap}"
                  stroke="#ff7675" stroke-width="1.5" stroke-dasharray="4,3"/>
            <circle cx="15" cy="0" r="3" fill="#ff7675"/>
            <circle cx="15" cy="${gap}" r="3" fill="#ff7675"/>
          `;
          distanceLabel.textContent = `↕ ${gap}px (эл: ${Math.round(rect1.width)}×${Math.round(rect1.height)})`;
          distanceLabel.style.left = `${lineX}px`;
          distanceLabel.style.top = `${gap / 2}px`;
          distanceLabel.style.transform = 'translate(-50%, -50%)';
          distanceLabel.style.display = 'block';
        } else if (nearBottom) {
          const gap = Math.round(window.innerHeight - rect1.bottom);
          const lineX = rect1.left + rect1.width / 2;
          distanceLine.style.left = `${lineX - 15}px`;
          distanceLine.style.top = `${rect1.bottom}px`;
          distanceLine.style.width = '30px';
          distanceLine.style.height = `${Math.max(gap, 1) + 10}px`;
          distanceLine.style.display = 'block';
          distanceLine.innerHTML = `
            <line x1="15" y1="0" x2="15" y2="${gap}"
                  stroke="#ff7675" stroke-width="1.5" stroke-dasharray="4,3"/>
            <circle cx="15" cy="0" r="3" fill="#ff7675"/>
            <circle cx="15" cy="${gap}" r="3" fill="#ff7675"/>
          `;
          distanceLabel.textContent = `↕ ${gap}px (эл: ${Math.round(rect1.width)}×${Math.round(rect1.height)})`;
          distanceLabel.style.left = `${lineX}px`;
          distanceLabel.style.top = `${rect1.bottom + gap / 2}px`;
          distanceLabel.style.transform = 'translate(-50%, -50%)';
          distanceLabel.style.display = 'block';
        }
        return;
      }

      // Второй элемент — показываем расстояние
      if (target && target !== measureFirstEl &&
          target !== document.body && target !== document.documentElement &&
          target !== highlightOverlay && target !== toastElement &&
          target !== infoPanel && target !== marginOverlay && target !== paddingOverlay &&
          target !== boxModelOverlay && target !== distanceLine && target !== distanceLabel &&
          target !== secondOverlay) {
        updateSecondOverlay(target);
        updateDistanceVisuals(measureFirstEl, target);
      } else {
        hideDistanceVisuals();
        updateSecondOverlay(null);
      }
      return;
    }
    // Alt не зажат — сбрасываем измерение
    if (measureFirstEl) {
      hideDistanceVisuals();
      updateSecondOverlay(null);
      measureFirstEl = null;
    }

    // Пропускаем если сработал Ctrl+Scroll (lockedSelection)
    if (lockedSelection) return;

    // Пропускаем служебные элементы
    if (!target || target === highlightOverlay || target === toastElement ||
        target === infoPanel || target === marginOverlay || target === paddingOverlay ||
        target === boxModelOverlay || target === distanceLine || target === distanceLabel ||
        target === distancePanel || target === secondOverlay) {
      return;
    }

    // Игнорируем body и html
    if (target === document.body || target === document.documentElement) {
      hideOverlay();
      hideInfoPanel();
      hideBoxModel();
      hoveredElement = null;
      return;
    }

    // Обычное движение сбрасывает ручной выбор (Ctrl+Scroll)
    lockedSelection = null;

    // Throttle — обновляем не чаще каждого кадра
    if (moveThrottle) return;
    moveThrottle = requestAnimationFrame(() => {
      moveThrottle = null;
      hoveredElement = target;
      updateOverlayPosition(target);
      updateInfoPanel(target);
      updateBoxModel(target);
      showOverlay();
      showInfoPanel();
    });
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

  // === Измерение расстояния между элементами (Alt + наведение) ===
  let measureFirstEl = null; // Первый элемент (зафиксирован при Alt)

  // При отпускании Alt сбрасываем
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') {
      hideDistanceVisuals();
      updateSecondOverlay(null);
      measureFirstEl = null;
    }
  }, true);

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

    // position: fixed — координаты уже относительно viewport, scroll не нужен
    highlightOverlay.style.top = `${rect.top}px`;
    highlightOverlay.style.left = `${rect.left}px`;
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
