// 9_start_stop_main.js
const ServerController = (() => {
    const MANAGEMENT_FILE_PATH = 'php/12_linux.php';

    const getServerElements = (serverNumber) => ({
        startBtn: document.getElementById(`start-main-server-${serverNumber}`),
        stopBtn: document.getElementById(`stop-main-server-${serverNumber}`),
        strategyInput: document.getElementById(`my-server-${serverNumber}-strategy`),
        hostSelect: document.getElementById(`select-use-domains-list-or-not-${serverNumber}`),
        hostLinks: document.getElementById(`my-server-${serverNumber}-links`)
    });

    const validateServerConfig = (serverConfig, isStopOperation = false) => {
        const errors = [];
        if (!serverConfig.ciadpiPath) errors.push('путь к ciadpi');
        if (!isStopOperation && !serverConfig.ipForRun) errors.push('IP для запуска');
        if (!serverConfig.port) errors.push('порт');
        
        if (errors.length > 0) {
            LogModule.logMessage('ОШИБКА', `Для процесса (ciadpi для использования ${serverConfig.serverNumber}) отсутствует: ${errors.join(', ')}`);
            return false;
        }
        return true;
    };

    const toggleButtons = (elements, isRunning) => {
        if (elements.startBtn) {
            elements.startBtn.hidden = isRunning;
            elements.startBtn.disabled = false;
        }
        if (elements.stopBtn) {
            elements.stopBtn.hidden = !isRunning;
            elements.stopBtn.disabled = false;
        }
        if (elements.strategyInput) {
            elements.strategyInput.disabled = isRunning;
        }
        if (elements.hostSelect) {
            elements.hostSelect.disabled = isRunning;
        }
    };

    const sendRequest = async (postData) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000);

            const response = await fetch(MANAGEMENT_FILE_PATH, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                },
                body: JSON.stringify(postData),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            const errorMessage = error.name === 'AbortError' 
                ? 'Сработал таймаут' 
                : error.message;
            LogModule.logMessage('ОШИБКА', `Ошибка запроса: ${errorMessage}`);
            throw error;
        }
    };

    const handleStart = async (serverNumber) => {
        const elements = getServerElements(serverNumber);
        const serverConfig = {
            serverNumber,
            ciadpiPath: window.appConfig?.ciadpi_для_использования?.[`процесс_${serverNumber}`]?.полный_путь,
            ipForRun: window.appConfig?.ciadpi_для_использования?.[`процесс_${serverNumber}`]?.ip_для_запуска,
            port: window.appConfig?.ciadpi_для_использования?.[`процесс_${serverNumber}`]?.tcp_порт,
            hostsFilePath: window.appConfig?.ciadpi_для_использования?.[`процесс_${serverNumber}`]?.полный_путь_к_хост_листу
        };

    try {
        elements.startBtn.disabled = true;
        const strategy = elements.strategyInput?.value?.trim() || '';
        
        if (!strategy) {
            LogModule.logMessage('ОШИБКА', `Для процесса (ciadpi для использования ${serverNumber}) не указана стратегия`);
            return;
        }
        
        if (!validateServerConfig(serverConfig)) return;
        
        const useHosts = elements.hostSelect?.value === 'true';
        if (useHosts && (!elements.hostLinks?.value?.trim() || !serverConfig.hostsFilePath)) {
            LogModule.logMessage('ОШИБКА', `Для процесса (ciadpi для использования ${serverNumber}) не настроен хост-лист (или пустой)`);
            return;
        }

        let args = strategy;
        if (useHosts) {
            args = `--hosts "${serverConfig.hostsFilePath}" ${strategy}`;
        }

        const postData = {
            действие: "проверить_и_запустить",
            реальный_полный_путь: serverConfig.ciadpiPath,
            ip_для_запуска: serverConfig.ipForRun,
            порт: serverConfig.port,
            аргументы: args
        };

        const response = await sendRequest(postData);
        const data = await response.json();

        if (!response.ok || !data.результат) {
            const errorMessage = data.сообщение || `HTTP ошибка: ${response.status}`;
            throw new Error(errorMessage);
        }

        LogModule.logMessage('ИНФО', `Процесс (ciadpi для использования ${serverNumber}) успешно запущен`);
        toggleButtons(elements, true);
        saveStrategy(serverNumber, strategy);
    } catch (error) {
        LogModule.logMessage('ОШИБКА', `Ошибка запуска процесса (ciadpi для использования ${serverNumber}): ${error.message}`);
    } finally {
        elements.startBtn.disabled = false;
    }
};

    const handleStop = async (serverNumber) => {
        const elements = getServerElements(serverNumber);
        const serverConfig = {
            serverNumber,
            ciadpiPath: window.appConfig?.ciadpi_для_использования?.[`процесс_${serverNumber}`]?.полный_путь,
            port: window.appConfig?.ciadpi_для_использования?.[`процесс_${serverNumber}`]?.tcp_порт
        };

    try {
        elements.stopBtn.disabled = true;
        
        if (!validateServerConfig(serverConfig, true)) return;

        const postData = {
            действие: "проверить_и_завершить",
            реальный_полный_путь: serverConfig.ciadpiPath,
            порт: serverConfig.port
        };

        const response = await sendRequest(postData);
        const data = await response.json();

        if (!response.ok || !data.результат) {
            const errorMessage = data.сообщение || `HTTP ошибка: ${response.status}`;
            throw new Error(errorMessage);
        }

        LogModule.logMessage('ИНФО', `Процесс (ciadpi для использования ${serverNumber}) успешно остановлен`);
        toggleButtons(elements, false);
    } catch (error) {
        LogModule.logMessage('ОШИБКА', `Ошибка остановки процесса (ciadpi для использования ${serverNumber}): ${error.message}`);
    } finally {
        elements.stopBtn.disabled = false;
    }
};

    const saveStrategy = async (serverNumber, strategy) => {
        try {
            const response = await fetch('php/9_save_latest_used_strategy.php', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    ciadpi_для_использования: {
                        [`процесс_${serverNumber}`]: {
                            последняя_используемая_стратегия: strategy
                        }
                    }
                })
            });

            const data = await response.json();
            if (data.результат) {
                LogModule.logMessage('ИНФО', `Стратегия для (ciadpi для использования ${serverNumber}) сохранена`);
            } else {
                LogModule.logMessage('ОШИБКА', `Ошибка сохранения стратегии: ${data.сообщение}`);
            }
        } catch (error) {
            LogModule.logMessage('ОШИБКА', `Сетевая ошибка при сохранении стратегии: ${error.message}`);
        }
    };

    const initialize = () => {
        for (let i = 1; i <= 8; i++) {
            const elements = getServerElements(i);
            if (elements.startBtn) {
                elements.startBtn.addEventListener('click', () => handleStart(i));
            }
            if (elements.stopBtn) {
                elements.stopBtn.addEventListener('click', () => handleStop(i));
            }
        }
    };

    return {
        initialize
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('start-main-server-1')) {
        ServerController.initialize();
    }
});