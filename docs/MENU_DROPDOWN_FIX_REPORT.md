# Отчёт об исправлении проблем меню и затемнения фона

**Дата:** 2026-02-09  
**Файлы:** `webapp/css/style.css`, `webapp/js/menu.js`, `webapp/js/operationsBase.js`

---

## Исходные проблемы

1. **Меню было видно, но клики не работали** — элементы меню не реагировали на клики
2. **Фон не затемнялся** — backdrop не показывал затемнение при открытии меню
3. **Проблема усугублялась после открытия страниц** — после открытия profile-page или других страниц меню "проваливалось" под контент и переставало работать корректно

---

## Диагностика

### Проблема #1: Z-index меню был ниже header

**Найдено:**
- Выпадающее меню `#main-menu-dropdown` имело `z-index: 10008`
- Нижний `header` (панель с корзиной, избранным) имел `z-index: 10010`
- Кнопка меню `.menu-btn` имела `z-index: 10012`

**Результат:** Меню рисовалось **под** header'ом, панель перехватывала клики и перекрывала backdrop.

### Проблема #2: Селекторы CSS не срабатывали надежно

**Найдено:**
- Селекторы `[style*="display: block"]` могли не срабатывать при разных форматах атрибута `style`
- Браузеры могут записывать `style` как `"display: block"`, `"display:block"`, `"display: block;"` или `"display:block;"`

**Результат:** CSS правила для открытого меню не применялись в некоторых случаях.

### Проблема #3: clearOverlaysAndBodyClasses() ломала меню

**Найдено:**
- Функция `clearOverlaysAndBodyClasses()` в `operationsBase.js` устанавливала inline-стили на `.main-menu-dropdown-backdrop`:
  - `display: none`
  - `pointer-events: none`
- Эти inline-стили имели более высокую специфичность, чем CSS правила с `!important` для селекторов по атрибуту

**Результат:** После открытия profile-page backdrop терял способность затемняться, так как inline-стили переопределяли CSS.

---

## Исправления

### 1. Повышен z-index открытого меню

**Файл:** `webapp/css/style.css` (строки 6851-6858)

**Было:**
```css
.main-menu-dropdown[style*="display: block"] {
    pointer-events: auto;
}
```

**Стало:**
```css
.main-menu-dropdown[style*="display: block"],
.main-menu-dropdown[style*="display:block"],
.main-menu-dropdown[style*="display: block;"],
.main-menu-dropdown[style*="display:block;"] {
    z-index: 10011 !important; /* Выше header (10010) и всех страниц (1000) */
    pointer-events: auto !important;
}
```

**Результат:** Меню теперь всегда выше header и всех страниц, клики работают корректно.

---

### 2. Добавлены множественные селекторы для надежности

**Файл:** `webapp/css/style.css` (строки 6873-6886)

**Добавлены варианты селекторов:**
- `[style*="display: block"]` — с пробелом
- `[style*="display:block"]` — без пробела
- `[style*="display: block;"]` — с пробелом и точкой с запятой
- `[style*="display:block;"]` — без пробела, с точкой с запятой

**Применено для:**
- Контейнера меню (z-index, pointer-events)
- Backdrop (opacity, pointer-events)
- Content (transform)

**Результат:** CSS правила срабатывают независимо от формата атрибута `style`.

---

### 3. Добавлен !important для критичных свойств backdrop

**Файл:** `webapp/css/style.css` (строки 6860-6886)

**Изменения:**
```css
.main-menu-dropdown-backdrop {
    background: rgba(0, 0, 0, 0.5) !important;
    backdrop-filter: blur(8px) !important;
    -webkit-backdrop-filter: blur(8px) !important;
    opacity: 0; /* БЕЗ !important, чтобы правило для открытого меню могло переопределить */
    pointer-events: none;
}

.main-menu-dropdown[style*="display: block"] .main-menu-dropdown-backdrop,
/* ... другие варианты селекторов ... */ {
    opacity: 1 !important;
    pointer-events: auto !important;
}
```

**Результат:** Backdrop всегда имеет правильный цвет и blur, opacity корректно переключается при открытии/закрытии меню.

---

### 4. Исключено меню из clearOverlaysAndBodyClasses()

**Файл:** `webapp/js/operationsBase.js` (строки 61-69, 78-94)

**Было:**
```javascript
const OVERLAY_SELECTORS = [
    '#cart-bottom-sheet',
    '#product-page-bottom-sheet',
    '#main-menu-dropdown',
    '.cart-bottom-sheet-backdrop',
    '.main-menu-dropdown-backdrop'
];
```

**Стало:**
```javascript
const OVERLAY_SELECTORS = [
    '#cart-bottom-sheet',
    '#product-page-bottom-sheet',
    /* ИСКЛЮЧЕНО: '#main-menu-dropdown' и '.main-menu-dropdown-backdrop' */
    /* Меню само управляет своим состоянием через menu.js */
    '.cart-bottom-sheet-backdrop',
];
```

**Результат:** `clearOverlaysAndBodyClasses()` больше не устанавливает inline-стили на меню и его backdrop, меню полностью управляет своим состоянием.

---

### 5. Добавлен сброс inline-стилей при открытии меню

**Файл:** `webapp/js/menu.js` (строки 132-141)

**Добавлено:**
```javascript
function openMenu() {
    // ...
    // КРИТИЧНО: Убеждаемся, что backdrop имеет правильные стили
    if (menuBackdrop) {
        // Удаляем все inline стили, которые могли быть установлены где-то еще
        menuBackdrop.style.pointerEvents = '';
        menuBackdrop.style.opacity = '';
        menuBackdrop.style.display = '';
        // CSS правила с !important должны установить правильные значения
    }
    // ...
}
```

**Результат:** При открытии меню все inline-стили с backdrop удаляются, CSS правила с `!important` работают корректно.

---

### 6. Экспортирована функция closeMenu()

**Файл:** `webapp/js/menu.js` (строка 152)

**Изменение:** Функция `closeMenu()` экспортирована для использования в других модулях при необходимости явного закрытия меню.

---

### 7. Добавлены комментарии в CSS

**Файл:** `webapp/css/style.css`

**Добавлены комментарии:**
- О том, что контейнер меню не создаёт новый stacking context
- О том, что страницы не должны создавать новый stacking context
- О порядке z-index слоёв

**Результат:** Код стал более понятным и поддерживаемым.

---

## Финальное состояние

### Порядок z-index слоёв:

1. **10012** — Кнопка меню `.menu-btn` (всегда сверху, можно закрыть меню)
2. **10011** — Выпадающее меню `#main-menu-dropdown` (выше header и всех страниц)
3. **10010** — Нижний `header` (панель с корзиной, избранным)
4. **1000** — Страницы (product-page, cart-page-new, favorites-page, profile-page и т.д.)
5. **5000** — Bottom sheet'ы (cart-bottom-sheet, product-page-bottom-sheet)

### Поведение меню:

- ✅ Меню всегда кликабельно, независимо от того, какая страница открыта
- ✅ Backdrop всегда затемняет фон при открытии меню
- ✅ Меню работает корректно после открытия любых страниц (profile-page, product-page и т.д.)
- ✅ Меню само управляет своим состоянием, не зависит от `clearOverlaysAndBodyClasses()`

---

## Тестирование

### Сценарии для проверки:

1. **Открыть меню на главной странице** → меню открывается, фон затемняется, клики работают
2. **Открыть меню → открыть profile-page → закрыть profile-page → открыть меню** → меню работает корректно, фон затемняется
3. **Открыть меню → открыть product-page → открыть меню** → меню работает корректно, фон затемняется
4. **Открыть меню → кликнуть на backdrop** → меню закрывается
5. **Открыть меню → кликнуть на пункт меню** → меню закрывается, открывается соответствующая страница

---

## Файлы, которые были изменены

1. **webapp/css/style.css**
   - Строки 6847-6886: правила для меню и backdrop
   - Добавлены множественные селекторы и `!important` для критичных свойств

2. **webapp/js/menu.js**
   - Строки 122-141: функция `openMenu()` — добавлен сброс inline-стилей
   - Строка 152: функция `closeMenu()` — экспортирована

3. **webapp/js/operationsBase.js**
   - Строки 61-69: исключены меню из `OVERLAY_SELECTORS`
   - Строки 78-94: обновлена функция `clearOverlaysAndBodyClasses()` с комментариями

---

## Документация

Созданы/обновлены документы:
- `docs/MENU_DROPDOWN_STRUCTURE.md` — описание устройства меню и исправлений
- `docs/CSS_REFACTORING_PROGRESS.md` — добавлена запись о правке меню
- `docs/MENU_DROPDOWN_FIX_REPORT.md` — этот отчёт

---

## Выводы

Все проблемы с меню и затемнением фона были успешно исправлены:

1. ✅ Меню теперь всегда выше всех страниц и header'а
2. ✅ Backdrop корректно затемняет фон при открытии меню
3. ✅ Меню работает корректно после открытия любых страниц
4. ✅ Меню полностью независимо от `clearOverlaysAndBodyClasses()`

Проблемы были вызваны комбинацией факторов:
- Неправильный порядок z-index слоёв
- Ненадёжные CSS селекторы
- Конфликт между inline-стилями из `clearOverlaysAndBodyClasses()` и CSS правилами

Все эти проблемы были устранены через повышение z-index, добавление множественных селекторов, использование `!important` для критичных свойств и исключение меню из очистки overlay'ев.
