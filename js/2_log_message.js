//2_log_message.js
const LogModule = (() => {
    const LOG_LEVELS = {
        'log-level-error': { allowed_tags: ['ОШИБКА'] },
        'log-level-info-plus-error': { allowed_tags: ['ИНФО', 'ОШИБКА'] },
        'log-level-info-plus-error-plus-debug': { allowed_tags: ['ИНФО', 'ОШИБКА', 'ОТЛАДКА'] },
        'log-level-hide-all': { allowed_tags: [] }
    };

    let allLogMessages = [];

    const getDomElement = (id) => document.getElementById(id) || null;

    function getLogLevel() {
        const select = getDomElement('log-level');
        return select ? select.value : 'log-level-info-plus-error';
    }

    function formatLogMessage(tag, message) {
        const colorMap = {
            'ОШИБКА': 'error',
            'ОТЛАДКА': 'debug',
            'ИНФО': 'info'
        };
        const colorClass = colorMap[tag] || '';
        return `<span class="log-tag ${colorClass}">[${tag}]</span>: ${message}<br>`;
    }

    function isScrolledToBottom(element) {
        return element.scrollHeight - element.clientHeight <= element.scrollTop + 1;
    }

    function logMessage(tag, message) {
        const currentLevel = getLogLevel();
        const currentConfig = LOG_LEVELS[currentLevel] || LOG_LEVELS['log-level-info-plus-error'];

        allLogMessages.push({ tag, message });

        if (currentConfig.allowed_tags.includes(tag)) {
            const logArea = getDomElement('log');
            if (logArea) {
                const wasScrolledToBottom = isScrolledToBottom(logArea);
                logArea.innerHTML += formatLogMessage(tag, message);

                if (wasScrolledToBottom) {
                    logArea.scrollTop = logArea.scrollHeight;
                }
            }
        }

        if (tag === 'ИНФО' || tag === 'ОШИБКА') {
            createToast(tag, message);
        }
    }

    function createToastContainer() {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    function createToast(tag, message) {
        const container = createToastContainer();
        if (!container) {
            console.error('Не удалось создать контейнер для тостов');
            return;
        }

        const toast = document.createElement('div');
        toast.className = `toast ${tag === 'ИНФО' ? 'info' : 'error'}`;
        toast.textContent = `[${tag}] ${message}`;

        container.insertBefore(toast, container.firstChild);

        const timerId = setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease-out';
            toast.addEventListener('animationend', () => toast.remove());
        }, 5000);

        toast.dataset.timerId = timerId;

        const allToasts = container.querySelectorAll('.toast');
        if (allToasts.length > 20) {
            const excess = allToasts.length - 20;
            for (let i = 0; i < excess; i++) {
                const lastToast = container.lastChild;
                if (lastToast) {
                    clearTimeout(lastToast.dataset.timerId);
                    lastToast.remove();
                }
            }
        }

        const checkContainer = () => {
            if (container.children.length === 0) {
                container.remove();
            }
        };
        toast.addEventListener('animationend', checkContainer);
    }

    function updateLogVisibility() {
        const logArea = getDomElement('log');
        const currentLevel = getLogLevel();
        const currentConfig = LOG_LEVELS[currentLevel];

        if (!logArea || !currentConfig) return;

        const previousScrollTop = logArea.scrollTop;
        const wasScrolledToBottom = isScrolledToBottom(logArea);

        const filteredMessages = allLogMessages
            .filter(({ tag }) => currentConfig.allowed_tags.includes(tag))
            .map(({ tag, message }) => formatLogMessage(tag, message));

        logArea.innerHTML = filteredMessages.join('');

        if (wasScrolledToBottom) {
            logArea.scrollTop = logArea.scrollHeight;
        } else {
            logArea.scrollTop = previousScrollTop;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const logLevelSelect = getDomElement('log-level');
        logLevelSelect?.addEventListener('change', updateLogVisibility);
    });

    return {
        logMessage,
        updateLogVisibility
    };
})();

window.LogModule = LogModule;