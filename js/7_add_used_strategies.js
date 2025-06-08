//7_add_used_strategies.js
class StrategyManager {
    static init() {
        const button = document.getElementById('add-used-strategies');
        if (!button) return;

        button.addEventListener('click', () => {
            const strategies = [];
            for (let i = 1; i <= 8; i++) {
                const input = document.getElementById(`my-server-${i}-strategy`);
                if (input && input.value.trim()) {
                    strategies.push(input.value.trim());
                }
            }

            if (strategies.length === 0) {
                LogModule.logMessage('ИНФО', 'Нечего добавлять.');
                return;
            }

            const target = document.getElementById('generated-strategies');
            if (!target) {
                LogModule.logMessage('ОШИБКА', 'Элемент generated-strategies не найден.');
                return;
            }

            const separator = target.value ? '\n' : '';
            target.value += separator + strategies.join('\n');
            LogModule.logMessage('ИНФО', `Добавлено ${strategies.length} стратегий.`);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    StrategyManager.init();
});