/**
 * Глобальная обработка клавиатуры и нижнего меню (header).
 * – При фокусе на input/textarea скрываем нижнее меню.
 * – При потере фокуса возвращаем нижнее меню.
 * – enterkeyhint="done" для всех полей ввода (кнопка «Готово» на клавиатуре).
 * – Enter закрывает клавиатуру (blur) для input и для textarea без data-multiline.
 */

const INPUT_SELECTOR = 'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea';

function isInputOrTextarea(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        return type !== 'checkbox' && type !== 'radio' && type !== 'file';
    }
    return el.getAttribute('contenteditable') === 'true';
}

function setEnterKeyHint(el) {
    if (!el || el.getAttribute('enterkeyhint') === 'done') return;
    el.setAttribute('enterkeyhint', 'done');
}

function applyEnterKeyHintToAll() {
    document.querySelectorAll(INPUT_SELECTOR).forEach(setEnterKeyHint);
}

function initKeyboardHeader() {
    const header = document.querySelector('header');
    if (!header) return;

    let focusOutTimer = null;

    function hideHeader() {
        header.classList.add('header-keyboard-hidden');
    }

    function showHeader() {
        header.classList.remove('header-keyboard-hidden');
    }

    function hasFocusedInput() {
        const active = document.activeElement;
        return isInputOrTextarea(active);
    }

    // focusin → скрывать header
    document.addEventListener('focusin', (e) => {
        if (isInputOrTextarea(e.target)) {
            if (focusOutTimer) {
                clearTimeout(focusOutTimer);
                focusOutTimer = null;
            }
            hideHeader();
        }
    }, true);

    // focusout → через небольшую задержку проверить: если фокус не на input/textarea — показать header
    document.addEventListener('focusout', (e) => {
        if (!isInputOrTextarea(e.target)) return;
        if (focusOutTimer) clearTimeout(focusOutTimer);
        focusOutTimer = setTimeout(() => {
            focusOutTimer = null;
            if (!hasFocusedInput()) {
                showHeader();
            }
        }, 100);
    }, true);

    // Enter → blur для input; для textarea — blur только если нет data-multiline
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const target = e.target;
        if (!target || !isInputOrTextarea(target)) return;

        const tag = target.tagName.toLowerCase();
        if (tag === 'input') {
            e.preventDefault();
            target.blur();
            return;
        }
        if (tag === 'textarea' && !target.hasAttribute('data-multiline')) {
            e.preventDefault();
            target.blur();
        }
    }, true);

    // При загрузке выставляем enterkeyhint="done" всем полям
    applyEnterKeyHintToAll();

    // Для динамически добавленных полей (модалки, админка)
    const observer = new MutationObserver(() => {
        applyEnterKeyHintToAll();
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

export { initKeyboardHeader };
