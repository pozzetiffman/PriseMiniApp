// ========== REFACTORING STEP 3.1, 3.2: dateUtils.js ==========
// Модуль утилит для работы с датами
// Дата создания: 2024-12-19
// Статус: В процессе

/**
 * Форматирует дату в московское время
 * Время приходит в UTC, функция конвертирует его в московское время
 * @param {string} dateString - Строка с датой в формате ISO (может быть с Z или без)
 * @returns {string} Отформатированная строка даты в формате "DD.MM.YYYY, HH:MM" или пустая строка, если дата не передана
 */
export function formatDateToMoscow(dateString) {
    if (!dateString) {
        return '';
    }
    
    // Время приходит в UTC, нужно явно указать это и конвертировать в московское время
    let dateStr = dateString;
    // Если строка не заканчивается на Z или +/-, добавляем Z для указания UTC
    if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
        dateStr = dateStr + 'Z';
    }
    const date = new Date(dateStr);
    // Используем timeZone для автоматической конвертации UTC в московское время
    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Moscow'
    });
}

/**
 * Вычисляет оставшееся время до истечения резервации
 * Backend возвращает время в UTC через isoformat()
 * @param {string} reservedUntilStr - Строка с временем истечения резервации в формате ISO (может быть с Z или без)
 * @returns {string} Отформатированная строка с оставшимся временем (например, "2 часа 30 минут", "менее минуты", "Резервация истекла")
 */
export function calculateReservationTimeLeft(reservedUntilStr) {
    if (!reservedUntilStr) {
        return 'Резервация истекла';
    }
    
    // Парсим время правильно (если нет Z в конце, добавляем его для UTC)
    let dateStr = reservedUntilStr;
    if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
        // Если время без указания часового пояса, считаем его UTC
        dateStr = dateStr + 'Z';
    }
    const reservedUntil = new Date(dateStr);
    const now = new Date();
    const diffMs = reservedUntil.getTime() - now.getTime();
    
    // Проверяем, что время еще не истекло
    if (diffMs <= 0) {
        return 'Резервация истекла';
    }
    
    // Вычисляем точное оставшееся время
    const totalSeconds = Math.floor(diffMs / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const hoursLeft = Math.floor(totalMinutes / 60);
    const minutesLeft = totalMinutes % 60;
    
    // Показываем точное время до истечения резервации
    if (hoursLeft >= 1) {
        // Если есть минуты, показываем их тоже
        if (minutesLeft > 0) {
            return `${hoursLeft} ${hoursLeft === 1 ? 'час' : hoursLeft < 5 ? 'часа' : 'часов'} ${minutesLeft} ${minutesLeft === 1 ? 'минута' : minutesLeft < 5 ? 'минуты' : 'минут'}`;
        } else {
            return `${hoursLeft} ${hoursLeft === 1 ? 'час' : hoursLeft < 5 ? 'часа' : 'часов'}`;
        }
    } else if (totalMinutes > 0) {
        // Если меньше часа, показываем минуты
        return `${totalMinutes} ${totalMinutes === 1 ? 'минута' : totalMinutes < 5 ? 'минуты' : 'минут'}`;
    } else {
        return 'менее минуты';
    }
}

