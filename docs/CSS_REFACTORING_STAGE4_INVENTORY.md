# Этап 4: Инвентаризация селекторов [style*="..."]

Файл: `webapp/css/style.css`.

**Команды:**
```bash
grep -n "\[style\*=" webapp/css/style.css
grep -c "\[style\*=" webapp/css/style.css
```
**Результат:** было 23 вхождения; после batch 1 — **21**; после batch 2 — **21** (кандидатов не-K1 не осталось, Stage 4 завершён).

---

## Остаток [style*=] после batch 1 (таблица для batch 2)

| Строка | Селектор / контекст | Категория | Решение |
|--------|----------------------|-----------|---------|
| 41 | `html[style*="--tg-theme-text-color"]` | **S3** | Оставить: фиксация темы Telegram, не состояние |
| 6840–6843 | `.main-menu-dropdown[style*="display: block"]` (4 варианта) | **K1** | Оставить: меню, overlay/backdrop |
| 6867–6870 | `.main-menu-dropdown[style*="display..."] .main-menu-dropdown-backdrop` | **K1** | Оставить |
| 6871 | `.main-menu-dropdown:not([style*="display: none"]) .main-menu-dropdown-backdrop:not([style*="opacity: 0"])` | **K1** | Оставить |
| 6894–6897 | `.main-menu-dropdown[style*="display..."] .main-menu-dropdown-content` | **K1** | Оставить |
| 9565–9567 | `.cart-bottom-sheet[style*="display: flex"]`, `[style*="z-index"]` | **K1** | Оставить: bottom-sheet корзины |
| 9623–9624 | `.cart-bottom-sheet[style*="display..."] .cart-bottom-sheet-content` | **K1** | Оставить |
| 9640–9641 | `.product-page-bottom-sheet[style*="display: flex"]` | **K1** | Оставить: bottom-sheet страницы товара |

**Итого:** 1 S3, 20 K1. Кандидатов не-K1 для batch 2 **нет**. K1 не трогаем.

---

## K1 exceptions whitelist (оставляем `[style*=]` только здесь)

- **Main menu dropdown** (6840–6897) — причина: legacy inline display/opacity, кликабельность/backdrop, z-index/pointer-events.
- **Cart bottom-sheet** (9565–9624) — причина: inline display/z-index, критичный overlay.
- **Product-page bottom-sheet** (9640–9641) — причина: показ через JS (display:flex), overlay критичный.
- **S3 theme selector** (стр. 41) — не состояние, фиксация темы Telegram.

**Правило на будущее:**
- НЕ добавлять новые `[style*="..."]` для состояний.
- Для состояний использовать `.is-open`, `.is-active` и т.п.
- Исключения — только whitelist выше.

---

## Классификация (история)

| Строки | Категория | Действие |
|--------|-----------|----------|
| 41 | S3 (тема) | Оставить |
| 2171–2172 | S2 (legacy модалки) | **Batch 1:** заменены на `.modal.is-open` |
| 6840–6897 | K1 (меню) | Не трогать |
| 9565–9624 | K1 (cart bottom-sheet) | Не трогать |
| 9640–9641 | K1 (product-page bottom-sheet) | Не трогать |

---

## Batch 1 выполнено

- **CSS:** `.modal[style*="display: block"], .modal[style*="display:flex"]` заменены на `.modal.is-open` (style.css).
- **JS:** Во всех местах показа/скрытия модалок добавлено переключение класса `is-open` (modals.js, orders.js, purchases.js, reservations.js, product-edit.js, admin_clients.js). Inline style оставлен как fallback.
- **Метрика:** 23 → 21.

## Stage 4 batch 2 — done

**Метрика:**
- До batch 2: 21
- После batch 2: 21
- Команда: `grep -c "\[style\*=" webapp/css/style.css`

**Таблица «Остаток [style*=] после batch 1» (строки и классификация):**

| Строки | Селектор | Категория | Решение |
|--------|----------|-----------|---------|
| 41 | `html[style*="--tg-theme-text-color"]` | S3 | Оставить (тема Telegram) |
| 6840–6897 | `.main-menu-dropdown[...]` + backdrop/content | K1 | Оставить |
| 9565–9624 | `.cart-bottom-sheet[...]` + content | K1 | Оставить |
| 9640–9641 | `.product-page-bottom-sheet[...]` | K1 | Оставить |

Итог: кандидатов не-K1 = 0.

**Ручной тест (чек-лист после коммита):**
- Меню: открыть → есть затемнение → пункты кликаются → закрыть по клику на фон
- Корзина bottom-sheet: открыть → шторка снизу → скролл/кнопки работают → закрыть
- Product-page bottom-sheet: открыть товар → открыть действия → закрыть → клики работают
- Модалки: order/reservation/purchase/edit product/sell/cart — открыть/закрыть кнопкой, overlay, Escape
- Навигация: Избранное/Корзина/Профиль/Админка → «Назад» → возврат на главную без пустого экрана

---

### Итог batch 2

- CSS/JS без изменений (K1 не трогаем).
- Документ обновлён.
- Stage 4 завершён.
