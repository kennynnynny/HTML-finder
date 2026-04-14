# 🎯 Промт: Добавление настроек через popup в расширение `HTML Copy on Hover`

> Скопируйте этот промт в ваш AI-ассистент или используйте как ТЗ для реализации.

---

## 📋 Контекст задачи
Добавить в расширение **иконку в панели браузера** и **popup-окно с настройками**, чтобы пользователь мог:
- Видеть иконку расширения в `chrome://extensions` и на панели инструментов
- Открывать настройки по клику на иконку
- Менять параметры копирования (формат, триггер, горячие клавиши)
- Сохранять настройки через `chrome.storage.local`

**Текущий стек:** Manifest V3, Vanilla JS (ES2020+), без зависимостей, контент-скрипт.

---

## 🗂️ Требуемая структура файлов

```
html-copy-hover/
├── manifest.json          # ← обновить: добавить action, icons, permissions
├── content.js             # ← обновить: читать настройки из storage
├── popup/
│   ├── popup.html         # UI настроек (светло-жёлтый фон, чёткая структура)
│   ├── popup.js           # Логика: сохранение/загрузка настроек, отправка в content.js
│   └── popup.css          # Стили: светлая тема, читаемые шрифты, адаптив
└── assets/
    ├── icon-16.png        # Иконки для toolbar (16×16, 32×32, 48×48, 128×128)
    ├── icon-32.png
    ├── icon-48.png
    └── icon-128.png
```

---

## ⚙️ Требования к `manifest.json` (добавить/изменить)

```json
{
  "manifest_version": 3,
  "name": "HTML Copy on Hover",
  "version": "1.1",
  "description": "Копирование HTML элементов по наведению и клику",
  "icons": {
    "16": "assets/icon-16.png",
    "32": "assets/icon-32.png",
    "48": "assets/icon-48.png",
    "128": "assets/icon-128.png"
  },
  "action": {
    "default_icon": {
      "16": "assets/icon-16.png",
      "32": "assets/icon-32.png"
    },
    "default_title": "Настройки HTML Copy on Hover",
    "default_popup": "popup/popup.html"
  },
  "permissions": [
    "activeTab",
    "storage"
  ],
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }],
  "host_permissions": ["<all_urls>"]
}
```

> 🔹 `storage` — для сохранения настроек  
> 🔹 `action` — отображает иконку и привязывает popup  
> 🔹 Иконки обязательны для отображения в toolbar

---

## 🎨 Требования к `popup/popup.html` (UI)

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Настройки</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <header>
      <img src="../assets/icon-32.png" alt="🔧" class="icon">
      <h1>Настройки</h1>
    </header>

    <section class="setting-group">
      <label for="format">📋 Формат копирования:</label>
      <select id="format">
        <option value="outerHTML">Весь элемент (outerHTML)</option>
        <option value="innerHTML">Только содержимое (innerHTML)</option>
        <option value="attributes">Только атрибуты</option>
      </select>
    </section>

    <section class="setting-group">
      <label>⌨️ Триггер копирования:</label>
      <label class="radio-label"><input type="radio" name="trigger" value="ctrl"> Ctrl + Click</label>
      <label class="radio-label"><input type="radio" name="trigger" value="alt"> Alt + Click</label>
      <label class="radio-label"><input type="radio" name="trigger" value="shift"> Shift + Click</label>
      <label class="radio-label"><input type="radio" name="trigger" value="none"> Просто клик</label>
    </section>

    <section class="setting-group">
      <label class="checkbox-label">
        <input type="checkbox" id="showToast">
        ✅ Показывать уведомление после копирования
      </label>
    </section>

    <section class="setting-group">
      <label for="toastDuration">⏱ Длительность уведомления (сек):</label>
      <input type="number" id="toastDuration" min="1" max="10" value="2">
    </section>

    <div class="actions">
      <button id="saveBtn" class="btn-primary">💾 Сохранить</button>
      <button id="resetBtn" class="btn-secondary">🔄 Сбросить</button>
    </div>

    <div id="status" class="status-message"></div>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

> ✨ Дизайн: светло-жёлтый фон (`#fff9e6`), скруглённые углы, чёткие отступы, системные шрифты.

---

## 🧠 Логика `popup/popup.js`

```javascript
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
  document.querySelector(`input[name="trigger"][value="${result.trigger}"]`).checked = true;
  document.getElementById('showToast').checked = result.showToast;
  document.getElementById('toastDuration').value = result.toastDuration;
});

// Сохранение настроек
document.getElementById('saveBtn').addEventListener('click', async () => {
  const settings = {
    format: document.getElementById('format').value,
    trigger: document.querySelector('input[name="trigger"]:checked').value,
    showToast: document.getElementById('showToast').checked,
    toastDuration: parseInt(document.getElementById('toastDuration').value)
  };
  
  await chrome.storage.local.set(settings);
  
  // Уведомление в popup
  showStatus('✅ Настройки сохранены!', 'success');
  
  // Уведомить content script об изменении (для мгновенного применения)
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'settingsUpdated', settings }).catch(() => {});
  }
});

// Сброс к настройкам по умолчанию
document.getElementById('resetBtn').addEventListener('click', async () => {
  await chrome.storage.local.clear();
  await chrome.storage.local.set(DEFAULTS);
  document.location.reload(); // Перезагрузить popup с дефолтными значениями
});

// Вспомогательная функция
function showStatus(message, type) {
  const el = document.getElementById('status');
  el.textContent = message;
  el.className = `status-message ${type}`;
  setTimeout(() => { el.textContent = ''; el.className = 'status-message'; }, 2000);
}
```

---

## 🔗 Связь с `content.js` (обновить существующий файл)

```javascript
// В начале content.js — загрузка настроек
let settings = { ...DEFAULTS }; // локальные дефолты

async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(DEFAULTS);
    settings = { ...DEFAULTS, ...result };
  } catch (e) {
    console.warn('[HTML Copy] Не удалось загрузить настройки:', e);
  }
}

// Слушать сообщения от popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'settingsUpdated') {
    settings = { ...settings, ...message.settings };
    // Опционально: обновить UI оверлея/подсказок
  }
});

// В обработчике клика — использовать settings.trigger и settings.format
document.addEventListener('click', (e) => {
  // Проверка триггера:
  const triggerMap = {
    ctrl: e.ctrlKey || e.metaKey,
    alt: e.altKey,
    shift: e.shiftKey,
    none: true
  };
  
  if (!triggerMap[settings.trigger]) return;
  
  // Копирование в нужном формате:
  let html = '';
  switch (settings.format) {
    case 'innerHTML':
      html = hoveredElement?.innerHTML.trim() || '';
      break;
    case 'attributes':
      html = Array.from(hoveredElement?.attributes || [])
        .map(attr => `${attr.name}="${attr.value}"`)
        .join(' ');
      break;
    default:
      html = hoveredElement?.outerHTML.trim() || '';
  }
  
  // ...далее копирование и показ toast (если settings.showToast)
}, { capture: true });
```

---

## 🎨 `popup/popup.css` (базовые стили)

```css
/* popup/popup.css */
:root {
  --bg-primary: #fff9e6;
  --bg-card: #ffffff;
  --text-primary: #2d3748;
  --accent: #f6ad55;
  --border: #e2e8f0;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  width: 320px;
  padding: 16px;
  line-height: 1.5;
}

.container {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

header .icon { width: 32px; height: 32px; }

.setting-group {
  margin-bottom: 16px;
}

.setting-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
  font-size: 14px;
}

select, input[type="number"] {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  background: #fff;
}

.radio-label, .checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
  font-size: 13px;
  cursor: pointer;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 20px;
}

.btn-primary, .btn-secondary {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.1s;
}

.btn-primary {
  background: var(--accent);
  color: #1a202c;
}

.btn-secondary {
  background: #edf2f7;
  color: #4a5568;
}

.btn-primary:hover { transform: translateY(-1px); }
.btn-secondary:hover { background: #e2e8f0; }

.status-message {
  margin-top: 12px;
  font-size: 13px;
  text-align: center;
  min-height: 20px;
}

.status-message.success { color: #38a169; }
.status-message.error { color: #e53e3e; }
```

---

## ✅ Чек-лист реализации

- [ ] Создать папку `popup/` с `html`/`css`/`js`
- [ ] Добавить иконки в `assets/` (минимум 16×16 и 32×32) Используй МСП сервер в этом проекте 
- [ ] Обновить `manifest.json`: `action`, `icons`, `permissions: ["storage"]`
- [ ] Реализовать загрузку/сохранение настроек через `chrome.storage.local`
- [ ] Настроить `runtime.onMessage` для связи popup ↔ content script
- [ ] Обновить `content.js`: чтение настроек, применение формата/триггера
- [ ] Протестировать: иконка видна → клик → настройки → изменение → применение на странице
- [ ] Проверить работу в инкогнито (при разрешении) и на `localhost`/`https`

---

## 💡 Дополнительные рекомендации

1. **Минимализм в UI**: не перегружать popup, только ключевые настройки для v1.1
2. **Локализация**: все тексты в popup — на русском (соответствует проекту)
3. **Доступность**: `label` привязаны к `input`, контрастность цветов ≥ 4.5:1
4. **Производительность**: настройки загружаются асинхронно, не блокируют UI
5. **Отказоустойчивость**: если `chrome.storage` недоступен — использовать дефолты

---

> 🎯 **Итог**: После реализации пользователь увидит иконку 🔧 в панели расширений, сможет открыть настройки, выбрать формат копирования и триггер — все изменения применятся мгновенно без перезагрузки страницы.
