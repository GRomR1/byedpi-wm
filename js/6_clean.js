//6_clean.js
class ClearManager {
    static init() {
        this.setupHandler('clear-strategies', 'generated-strategies');
        this.setupHandler('clear-links', 'links');

        for (let i = 1; i <= 8; i++) {
            this.setupHandler(`clean-main-server-${i}`, `my-server-${i}-links`);
        }
    }

    static setupHandler(buttonId, targetId) {
        const button = document.getElementById(buttonId);
        if (!button) return;

        button.addEventListener('click', () => {
            const target = document.getElementById(targetId);
            if (!target) {
                LogModule.logMessage('ОШИБКА', `Элемент ${targetId} не найден.`);
                return;
            }

            const currentValue = 'value' in target ? target.value : target.textContent;
            if (!currentValue.trim()) {
                LogModule.logMessage('ИНФО', 'Нечего очищать.');
                return;
            }

            if ('value' in target) {
                target.value = '';
            } else {
                target.textContent = '';
            }
            
            LogModule.logMessage('ИНФО', 'Очищено.');
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    ClearManager.init();
});