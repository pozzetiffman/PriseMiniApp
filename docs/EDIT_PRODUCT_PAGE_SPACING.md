# Отступы на странице редактирования товара (#edit-product-page)

Полный перечень всех отступов (margin, padding, gap, height псевдоэлементов), которые формируют отступ страницы от меню, от контента и снизу. Значения приведены из `webapp/css/style.css` и `webapp/index.html`.

---

## 1. Структура страницы (HTML)

```
#edit-product-page.operation-page
├── .operation-top-menu                    ← верхнее меню (фиксированное)
│   ├── .operation-top-menu-close          (кнопка «Назад»)
│   ├── .operation-top-menu-title-container
│   └── .operation-top-menu-right
└── .operation-page-content.form-page-content   ← скроллируемый контейнер
    └── .edit-product-form
        ├── .edit-product-field (× много)
        ├── .edit-characteristics-card
        ├── .edit-delivery-card
        └── .edit-product-actions            ← кнопки «Сохранить» / «Отменить»
```

---

## 2. Отступы от верха (от меню и safe area)

### 2.1 Верхнее меню `.operation-top-menu`

| Свойство | Значение | Файл:строка |
|----------|----------|-------------|
| `padding` | `12px 16px` | style.css |
| `padding-top` | `calc(20px + var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px))` | 7855 |
| `padding-right` | `calc(16px + env(safe-area-inset-right, 0px))` | 7856 |
| `padding-left` | `calc(16px + env(safe-area-inset-left, 0px))` | 7857 |
| `margin` | `0` | 7858 |

Меню фиксировано (`position: fixed; top: 0; left: 0; right: 0`), поэтому визуально «отступ страницы от верха» — это отступ **контента под меню**.

### 2.2 Контент под меню `.operation-page-content`

| Свойство | Значение | Примечание |
|----------|----------|------------|
| `padding-top` | `calc(56px + var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px) + 4px)` | 56px ≈ высота меню, +4px зазор |
| `padding` (общее) | `0 16px 20px 16px` | боковые 16px, снизу 20px (переопределяется для #edit-product-page) |

**На #edit-product-page** отдельного переопределения `padding-top` нет — используется общее правило `.operation-page-content`.

**Медиа-запрос @media (max-width: 768px):**

| Свойство | Значение |
|----------|----------|
| `padding` | `0 12px 20px 12px` — боковые становятся 12px |
| `padding-top` | без изменений (тот же calc с 56px + safe area + 4px) |

Итого **отступ контента от верха экрана**:  
`56px + var(--tg-safe-area-inset-top) + var(--tg-content-safe-area-inset-top) + 4px`.

---

## 3. Боковые отступы контента

### 3.1 `.operation-page-content`

| Свойство | Значение |
|----------|----------|
| `padding-left` | `16px` |
| `padding-right` | `16px` |

В медиа (max-width: 768px): `12px` слева и справа.

### 3.2 `.edit-product-form` (только на #edit-product-page)

| Свойство | Значение |
|----------|----------|
| `padding-left` | `16px !important` |
| `padding-right` | `16px !important` |

Общие стили `.edit-product-form` (без #edit-product-page): `padding: 20px` (со всех сторон, но на странице редактирования переопределяются только left/right/top/bottom из блока override).

---

## 4. Отступ снизу страницы (главное)

Нижний «отступ страницы» складывается из:
- отступа контента от низа (`padding-bottom` у контента),
- высоты псевдоэлемента `::after` (чтобы при прокрутке последний контент не уезжал под кнопки),
- safe area снизу (вырез/индикатор на устройствах).

### 4.1 Базовые правила (до override для #edit-product-page)

**`.operation-page-content`:**
- `padding-bottom: calc(8px + 88px + var(--tg-safe-area-inset-bottom, 0px));`
- `::after` height: `calc(88px + 8px + var(--tg-safe-area-inset-bottom, 0px))`

**`.form-page-content`** (форма редактирования тоже имеет этот класс):
- `padding-bottom: calc(40px + 160px + var(--tg-safe-area-inset-bottom, 0px));`
- `::after` height: `calc(40px + 160px + var(--tg-safe-area-inset-bottom, 0px))`

То есть без override снизу было бы **40px + 160px + safe-area** — очень большой зазор.

### 4.2 Override только для #edit-product-page (итоговые значения)

Переменные в `#edit-product-page`:
- `--edit-product-bottom-gap: 0px` (можно поставить 2px, 4px, 6px по вкусу)
- `--ep-debug: 1` (подсветка для отладки, можно отключить)

**Применяемые правила:**

| Селектор | Свойство | Значение |
|----------|----------|----------|
| `#edit-product-page .operation-page-content.form-page-content` | `padding-bottom` | `calc(var(--edit-product-bottom-gap) + 88px + var(--tg-safe-area-inset-bottom, 0px)) !important` |
| `#edit-product-page .operation-page-content.form-page-content::after` | `height` | `calc(var(--edit-product-bottom-gap) + 88px + var(--tg-safe-area-inset-bottom, 0px)) !important` |
| `#edit-product-page .operation-page-content` | `padding-bottom` | то же |
| `#edit-product-page .form-page-content` | `padding-bottom` | то же |
| `#edit-product-page .operation-page-content::after`, `#edit-product-page .form-page-content::after` | `height` | то же |

**Формула отступа снизу:**

```
Отступ снизу = --edit-product-bottom-gap + 88px + var(--tg-safe-area-inset-bottom, 0px)
```

- **88px** — зарезервировано под блок кнопок (Сохранить/Отменить) и зазор.
- **--edit-product-bottom-gap** — дополнительный зазор (сейчас 0px).
- **--tg-safe-area-inset-bottom** — safe area снизу (Telegram/устройство).

**min-height** на #edit-product-page для контента сбрасывается: `min-height: auto !important`, чтобы контент не растягивал блок.

---

## 5. Отступы внутри формы

### 5.1 Контейнер формы `.edit-product-form`

| Источник | Свойство | Значение |
|----------|----------|----------|
| Общие стили | `padding` | `20px` |
| #edit-product-page override | `padding-top` | `16px !important` |
| #edit-product-page override | `padding-bottom` | `8px !important` |
| #edit-product-page override | `padding-left` | `16px !important` |
| #edit-product-page override | `padding-right` | `16px !important` |

### 5.2 Поля `.edit-product-field`

| Свойство | Значение |
|----------|----------|
| `margin-bottom` | `20px` |

Внутри полей:
- `label`: `margin-bottom: 8px`
- `input`/`textarea`: `padding: 12px`
- `select`: `padding: 14px 16px`

Inline в HTML (подсказки под полями): `margin: 4px 0 0 0`, `margin-bottom: 0` у части label.

### 5.3 Блок характеристик `.edit-characteristics-card`

| Свойство | Значение |
|----------|----------|
| `margin-top` | `12px` |
| `padding` | `12px` |
| Внутри: `.edit-characteristics-header` | `margin-bottom: 10px` |
| `.edit-characteristics-list` | `margin-bottom: 10px`, `gap: 6px` |
| `.edit-char-add-row` | `gap: 6px` |

### 5.4 Блок доставки `.edit-delivery-card`

| Свойство | Значение |
|----------|----------|
| `margin-top` | `16px` |
| `margin-bottom` | `16px` |
| `padding` | `14px` |
| `.edit-delivery-header` | `margin-bottom: 12px` |
| `.edit-delivery-body` | `gap: 10px` |
| `.edit-delivery-actions` | `margin-top: 6px`, `gap: 10px` |

На #edit-product-page:
- `.edit-delivery-save-btn.glass-btn`: `padding: 8px 12px`, `min-height: 34px`.

### 5.5 Кнопки «Сохранить» / «Отменить» `.edit-product-actions`

| Источник | Свойство | Значение |
|----------|----------|----------|
| Общие стили | `margin-top` | `24px` |
| Общие стили | `gap` | `12px` |
| #edit-product-page override | `margin-top` | `12px !important` |
| #edit-product-page override | `padding-bottom` | `0 !important` |

Кнопки `.edit-product-btn`: `padding: 14px`, `flex: 1`.

---

## 6. Псевдоэлементы и отладочный маркер

На `#edit-product-page .operation-page-content.form-page-content`:

**::before** (отладочный текст внизу контейнера):
- `content: "EDIT-PRODUCT CSS OVERRIDE ACTIVE"`
- `position: absolute; bottom: 0; left: 16px; right: 16px`
- `padding: 2px 6px`
Чтобы скрыть после отладки: задать `display: none` для этого `::before`.

**::after** — невидимый блок, задающий «высоту» внизу (см. формулу выше).

---

## 7. Сводная формула отступа снизу

```
Нижний отступ контента (и высота ::after) =
  var(--edit-product-bottom-gap)   // 0px по умолчанию
  + 88px                            // место под кнопки + зазор
  + var(--tg-safe-area-inset-bottom, 0px)
```

Все остальные отступы на странице:
- сверху: отступ от меню = 56px + safe area top + 4px;
- слева/справа: 16px (или 12px на узком экране);
- между блоками: см. разделы 5.1–5.5.

---

## 8. Где что менять

| Цель | Что менять |
|------|------------|
| Отступ контента снизу (больше/меньше) | `--edit-product-bottom-gap` в `#edit-product-page` (0/2/4/6px) |
| Убрать отладочную подсветку | `--ep-debug: 0` в `#edit-product-page` |
| Убрать текст «EDIT-PRODUCT CSS OVERRIDE ACTIVE» | Для `#edit-product-page .operation-page-content.form-page-content::before` задать `display: none` |
| Отступ формы от верха контента | `#edit-product-page .edit-product-form` → `padding-top` |
| Расстояние между кнопками и последним блоком | `#edit-product-page .edit-product-actions` → `margin-top` |
| Расстояние между полями формы | `.edit-product-field` → `margin-bottom` |

Файл стилей: `webapp/css/style.css` (блоки около строк 6270–6668, 7773–7977, 9976–10097).

---

## 9. Фикс override (почему не применялся) и чеклист проверки

### Точная причина, почему override «не менял» отступ

1. **У `.form-page-content::after` не было `content`** — базовая запись (стр. 7975) задаёт только `height`. Псевдоэлемент без `content` в части браузеров/контекстов может не создавать бокс; переопределение только `height` у `#edit-product-page ... ::after` не гарантировало наличие бокса. Добавлены явные `content: ''` и `display: block` в override для `::after`.

2. **В `@media (max-width: 768px)` правило `.operation-page-content { padding: 0 12px 20px 12px }` задаёт shorthand** — то есть явно выставляет `padding-bottom: 20px` внутри медиа-запроса. По каскаду override с `!important` и id должен был побеждать, но в зависимости от порядка загрузки/применения стилей возможны кейсы, когда визуально «выигрывал» отступ из MQ. Override для `#edit-product-page` продублирован внутри того же `@media (max-width: 768px)`, чтобы padding-bottom и высота `::after` гарантированно применялись на узком экране.

3. **Один источник «пустоты» снизу** — отступ создаётся только за счёт `padding-bottom` контейнера `.operation-page-content.form-page-content` и высоты его `::after`. Кнопки «Сохранить/Отменить» не фиксированы (нет fixed/sticky), лежат в потоке внутри формы; лишнего spacer’а нет.

### Чеклист проверки в DevTools

1. **Открыть страницу редактирования товара** (товар → Редактировать).

2. **Выбрать в инспекторе элемент** — внутри `#edit-product-page` единственный div с классами `operation-page-content form-page-content` (тот, что сразу после `.operation-top-menu`).

3. **Проверить computed:**
   - **padding-bottom:** должно быть `88px` (при `--edit-product-bottom-gap: 0` и нулевой safe-area), либо `calc(0px + 88px + 0px)` в развёрнутом виде. При `--edit-product-bottom-gap: 6px` — итог 94px (или 6px + 88px + safe-area).
   - В **Elements → Styles** убедиться, что активны правила из блока `#edit-product-page .operation-page-content` / `.form-page-content` с `padding-bottom: calc(var(--edit-product-bottom-gap) + 88px + ...) !important`.

4. **Проверить `::after`:**
   - В том же элементе в DevTools выбрать псевдоэлемент `::after`.
   - **height** в computed должен быть тем же (88px при gap 0 и без safe-area).
   - **content:** `""`, **display:** `block` — чтобы псевдоэлемент реально участвовал в раскладке.

5. **Проверить, что проблема решена:** при изменении в CSS `--edit-product-bottom-gap` с `0px` на `6px` итоговый отступ снизу (и прокрутка до «дна») визуально увеличивается; в computed у контейнера `padding-bottom` и у `::after` height увеличиваются на 6px.

6. **Консоль:** при открытии страницы редактирования в логе должно быть сообщение вида  
   `[edit-product-page] .operation-page-content paddingBottom: 88px ::after height: 88px`  
   (или с учётом safe-area). После проверки блок с `console.log` в `product-edit.js` (комментарий «DEBUG отступов») можно удалить; в CSS убрать временный `background: rgba(0, 128, 255, 0.15)` у `::after`.
