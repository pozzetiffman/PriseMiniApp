# Код отступов для безопасных зон Telegram

Все отступы используют CSS-переменные Telegram:
- `--tg-safe-area-inset-top` - безопасная зона сверху (вырез камеры, статус-бар)
- `--tg-content-safe-area-inset-top` - безопасная зона для контента (кнопки Telegram)
- `--tg-safe-area-inset-bottom` - безопасная зона снизу

## 1. Body (главный контейнер)

```css
body {
    padding-top: calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px));
}
```

## 2. Main (основной контент)

```css
main {
    padding-top: max(8px, calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px)));
    padding-bottom: calc(68px + var(--tg-safe-area-inset-bottom, 0px));
}
```

## 3. Header (шапка внизу)

```css
header {
    padding-bottom: max(12px, calc(12px + var(--tg-safe-area-inset-bottom, 0px)));
}
```

## 4. Модальные окна - общие (.modal-content)

```css
.modal-content {
    margin: calc(20px + var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px)) auto 20px auto;
    max-height: calc(100vh - 40px - var(--tg-safe-area-inset-top, 0px) - var(--tg-content-safe-area-inset-top, 0px));
}
```

## 5. Модальное окно админки (.admin-modal-content)

```css
.admin-modal-content {
    margin: calc(5% + var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px)) auto 5% auto;
    max-height: calc(90vh - var(--tg-safe-area-inset-top, 0px) - var(--tg-content-safe-area-inset-top, 0px));
}
```

## 6. Модальное окно профиля (.profile-modal-content)

```css
.profile-modal-content {
    margin: calc(5% + var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px)) auto 5% auto;
    max-height: calc(90vh - var(--tg-safe-area-inset-top, 0px) - var(--tg-content-safe-area-inset-top, 0px));
}
```

## 7. Адаптивные стили для мобильных устройств (@media max-width: 480px)

### Main
```css
main {
    padding-top: max(8px, calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px)));
    padding-bottom: calc(58px + var(--tg-safe-area-inset-bottom, 0px));
}
```

### Header
```css
header {
    padding-bottom: max(10px, calc(10px + env(safe-area-inset-bottom, 0px)));
}
```
⚠️ ВНИМАНИЕ: Здесь используется `env()` вместо `var(--tg-safe-area-inset-bottom)` - нужно исправить!

### Admin Modal
```css
.admin-modal-content {
    margin: calc(2% + var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px)) auto 2% auto;
    max-height: calc(96vh - var(--tg-safe-area-inset-top, 0px) - var(--tg-content-safe-area-inset-top, 0px));
}
```

### Modal Content
```css
.modal-content {
    margin: calc(10px + var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px)) auto 10px auto;
    max-height: calc(100vh - 20px - var(--tg-safe-area-inset-top, 0px) - var(--tg-content-safe-area-inset-top, 0px));
}
```

### Profile Modal
```css
.profile-modal-content {
    margin: calc(10px + var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px)) auto 10px auto;
    max-height: calc(100vh - 20px - var(--tg-safe-area-inset-top, 0px) - var(--tg-content-safe-area-inset-top, 0px));
}
```

## Формула для отступов сверху

Всегда используйте сумму обеих переменных:
```css
calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px))
```

Это обеспечивает учет:
1. Физических безопасных зон устройства (вырез камеры, статус-бар)
2. Элементов интерфейса Telegram (кнопки, панели)

## Инициализация в JavaScript

В файле `webapp/js/telegram.js` вызывается:
```javascript
tg.expand(); // Расширяет приложение на весь экран и устанавливает CSS-переменные
```

