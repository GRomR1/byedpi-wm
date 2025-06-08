//3_prepare.js
const PrepareModule = (() => {
    let appConfig = null;
    let detectedOS = null;

    async function fetchData(url) {
        try {
            const response = await fetch(url, { method: 'GET' });
            
            if (!response.ok) {
                let errorMsg = `Ошибка HTTP! Статус: ${response.status}`;
                
                try {
                    const errorBody = await response.json();
                    if (errorBody.сообщение) {
                        errorMsg = errorBody.сообщение;
                    } else if (errorBody.message) {
                        errorMsg = errorBody.message;
                    }
                } catch (_) {}
                
                throw new Error(errorMsg);
            }
            
            return response.json();
        } catch (error) {
            if (error.name === 'TypeError') {
                throw new Error('Сетевая ошибка: не удалось выполнить запрос');
            }
            throw error;
        }
    }

    async function postData(url, data) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (!response.ok) {
                let errorMsg = `Ошибка HTTP! Статус: ${response.status}`;
                
                try {
                    const errorBody = await response.json();
                    if (errorBody.сообщение) {
                        errorMsg = errorBody.сообщение;
                    } else if (errorBody.message) {
                        errorMsg = errorBody.message;
                    }
                } catch (_) {}
                
                throw new Error(errorMsg);
            }
            
            return response.json();
        } catch (error) {
            if (error.name === 'TypeError') {
                throw new Error('Сетевая ошибка: не удалось выполнить запрос');
            }
            throw error;
        }
    }

    function updateErrorStatus(step, error, status) {
        status[step] = 'Ошибка';
        status[`${step}Msg`] = error.message;
    }

    // Шаг 1: Определение операционной системы
    async function detectOS(status) {
        LogModule.logMessage('ИНФО', 'Определение операционной системы...');
        try {
            const data = await fetchData('php/1_os_detect.php');
            if (!data.результат) {
                throw new Error(data.сообщение || 'Неизвестная ошибка');
            }
            detectedOS = data.операционная_система;
            if (detectedOS !== 'linux') {
                throw new Error('Операционная система не поддерживается');
            }
            status.os = 'ОК';
            LogModule.logMessage('ИНФО', `Операционная система: ${detectedOS}`);
            return true;
        } catch (error) {
            updateErrorStatus('os', error, status);
            LogModule.logMessage('ОШИБКА', `Ошибка определения операционной системы: ${error.message}`);
            return false;
        }
    }

    // Шаг 2: Проверка параметров PHP
    async function checkPHP(status) {
        LogModule.logMessage('ИНФО', 'Проверка параметров PHP...');
        try {
            const data = await fetchData('php/2_linux_php_check.php');
            if (!data.результат) {
                throw new Error(data.сообщение || 'Неизвестная ошибка');
            }
            const phpChecks = data.php;
            const failedChecks = Object.entries(phpChecks)
                .filter(([_, value]) => !value)
                .map(([key]) => key);
            if (failedChecks.length > 0) {
                throw new Error(`Ошибки в параметрах PHP: ${failedChecks.join(', ')}`);
            }
            status.php = 'ОК';
            LogModule.logMessage('ИНФО', 'Все параметры PHP проверены успешно');
            return true;
        } catch (error) {
            updateErrorStatus('php', error, status);
            LogModule.logMessage('ОШИБКА', `Ошибка проверки PHP: ${error.message}`);
            return false;
        }
    }

    // Шаг 3: Проверка системных утилит Linux
    async function checkTools(status) {
    LogModule.logMessage('ИНФО', 'Проверка утилит...');
    try {
        const data = await fetchData('php/3_linux_tools_check.php');
        if (!data.результат) {
            throw new Error(data.сообщение || 'Неизвестная ошибка');
        }
        
        const toolsChecks = data.утилиты_и_функции;
        const failedChecks = Object.entries(toolsChecks)
            .filter(([_, value]) => !value)
            .map(([key]) => key);
            
        if (failedChecks.length > 0) {
            throw new Error(`Отсутствуют утилиты: ${failedChecks.join(', ')}`);
        }
        
        status.tools = 'ОК';
        LogModule.logMessage('ИНФО', 'Все утилиты проверены успешно');
        return true;
        
    } catch (error) {
        updateErrorStatus('tools', error, status);
        LogModule.logMessage('ОШИБКА', `Ошибка проверки утилит: ${error.message}`);
        return false;
    }
    }

    // Шаг 4: Проверка файлов
    async function checkFiles(status) {
        LogModule.logMessage('ИНФО', 'Проверка файлов...');
        try {
            const data = await fetchData('php/4_linux_files_check.php');
            if (!data.результат) {
                throw new Error(data.сообщение || 'Неизвестная ошибка');
            }
            const files = data.файлы;
            let allFilesOk = true;
            const domainsByProcess = {};
            const hostsPathsByProcess = {};
            let ciadpiPath = null;

            for (const [key, file] of Object.entries(files)) {
    if (!file.существует || !file.является_файлом || !file.чтение) {
        LogModule.logMessage('ОШИБКА', `Файл ${file.полный_путь} недоступен`);
        allFilesOk = false;
                } else if (file.домены && Array.isArray(file.домены)) {
                    const processIndex = key.match(/файл_хост_листа_ciadpi_для_использования_(\d+)/);
                    if (processIndex) {
                        const index = parseInt(processIndex[1], 10);
                        domainsByProcess[index] = file.домены;
                        hostsPathsByProcess[index] = file.полный_путь;
                    }
                }
                if (key === 'файл_ciadpi') {
                    ciadpiPath = file.полный_путь;
                }
            }

            if (!allFilesOk) {
                throw new Error('Некоторые файлы недоступны');
            }
            status.files = 'ОК';
            LogModule.logMessage('ИНФО', 'Все файлы проверены успешно');
            return { domainsByProcess, ciadpiPath, hostsPathsByProcess };
        } catch (error) {
            updateErrorStatus('files', error, status);
            LogModule.logMessage('ОШИБКА', `Ошибка проверки файлов: ${error.message}`);
            return false;
        }
    }

    // Шаг 5: Чтение конфигурации
    async function readConfig(status) {
        LogModule.logMessage('ИНФО', 'Чтение конфигурации...');
        try {
            const data = await fetchData('php/5_read_config.php');
            if (!data.результат) {
                throw new Error(data.сообщение || 'Неизвестная ошибка');
            }
            appConfig = data.конфигурация;
            window.appConfig = appConfig;
            status.config = 'ОК';
            LogModule.logMessage('ИНФО', 'Конфигурация успешно прочитана');
            return true;
        } catch (error) {
            updateErrorStatus('config', error, status);
            LogModule.logMessage('ОШИБКА', `Ошибка чтения конфигурации: ${error.message}`);
            return false;
        }
    }

    // Шаг 6: Определение первого сервера GGC
    async function detectFirstServerGGC(status) {
        LogModule.logMessage('ИНФО', 'Определение первого сервера текущего кластера Google Global Cache...');
        try {
            const data = await fetchData('php/6_detect_first_ggc_domain.php');
            if (!data.результат) {
                throw new Error(data.сообщение || 'Неизвестная ошибка');
            }
            const firstServer = data.первый_сервер_ggc;
            status.firstGGC = 'ОК';
            LogModule.logMessage('ОТЛАДКА', `Первый сервер: ${firstServer}`);
            return firstServer;
        } catch (error) {
            updateErrorStatus('firstGGC', error, status);
            LogModule.logMessage('ОШИБКА', `Ошибка определения первого сервера Google Global Cache: ${error.message}`);
            return null;
        }
    }

// Шаг 7: Определение остальных серверов GGC
async function detectOtherServersGGC(firstServer, status) {
    LogModule.logMessage('ИНФО', 'Определение остальных серверов текущего кластера Google Global Cache...');
    try {
        if (!firstServer || !firstServer.match(/^https?:\/\/rr\d+/)) {
            throw new Error('Неверный формат первого сервера текущего кластера Google Global Cache');
        }
        
        const protocol = firstServer.startsWith('https') ? 'https' : 'http';
        const match = firstServer.match(/^https?:\/\/(rr\d+---.+)$/);
        if (!match) {
            throw new Error('Неверный формат URL первого сервера текущего кластера Google Global Cache');
        }
        
        const baseHost = match[1];
        const hostMatch = baseHost.match(/^(rr)(\d+)(---.+)$/);
        if (!hostMatch) {
            throw new Error('Не удалось разобрать номер сервера');
        }
        
        const [, , numStr, suffix] = hostMatch;
        let currentNum = parseInt(numStr, 10) + 1;
        const accessibleServers = [firstServer];
        const maxAttempts = 18;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const nextHost = `rr${currentNum}${suffix}`;
            await new Promise(resolve => setTimeout(resolve, Math.random() * 400 + 100));
            
            const portResponse = await postData('php/7_detect_other_ggc_domains.php', {
                host: nextHost,
                ports: [443]
            });
            
            if (portResponse.результат) {
                const serverURL = `${protocol}://${portResponse.сервер_ggc}`;
                accessibleServers.push(serverURL);
                LogModule.logMessage('ОТЛАДКА', `Найден сервер: ${serverURL}`);
                currentNum++;
            } else {
                break;
            }
        }

        if (!appConfig.ссылки_по_умолчанию_для_проверки['Google Global Cache']) {
            appConfig.ссылки_по_умолчанию_для_проверки['Google Global Cache'] = [];
        }
        appConfig.ссылки_по_умолчанию_для_проверки['Google Global Cache'].push(...accessibleServers);
        status.otherGGC = 'ОК';
    } catch (error) {
        updateErrorStatus('otherGGC', error, status);
        LogModule.logMessage('ОШИБКА', `Ошибка определения серверов Google Global Cache: ${error.message}`);
        throw error;
    }
}

    // Шаг 8: Обновление PAC-файла
    async function updatePAC(status) {
        LogModule.logMessage('ИНФО', 'Обновление PAC-файла...');
        try {
            if (!appConfig) {
                throw new Error('Конфигурация не загружена');
            }
            if (!appConfig.ciadpi_для_использования || typeof appConfig.ciadpi_для_использования !== 'object') {
                throw new Error('Неверный формат данных для PAC');
            }
            const dataToSend = { ciadpi_для_использования: appConfig.ciadpi_для_использования };
            const response = await postData('php/8_update_pac.php', dataToSend);
            if (!response.результат) {
                throw new Error(response.сообщение || 'Неизвестная ошибка');
            }
            status.pac = 'ОК';
            LogModule.logMessage('ИНФО', 'PAC-файл успешно обновлён');
            return true;
        } catch (error) {
            updateErrorStatus('pac', error, status);
            LogModule.logMessage('ОШИБКА', `Ошибка обновления PAC-файла: ${error.message}`);
            return false;
        }
    }

    // Шаг 9: Проверка портов (ciadpi_для_использования)
    async function checkUsagePorts(status) {
        LogModule.logMessage('ИНФО', 'Проверка портов (ciadpi для использования)...');
        try {
            const baseUrl = 'php/12_linux.php';
            for (let i = 1; i <= 8; i++) {
                const processKey = `процесс_${i}`;
                const processData = appConfig.ciadpi_для_использования[processKey];
                const port = processData.tcp_порт;
                const requestData = {
                    действие: 'проверка',
                    реальный_полный_путь: processData.полный_путь,
                    порт: port,
                    ip_для_запуска: processData.ip_для_запуска
                };
                const response = await postData(baseUrl, requestData);
                if (response.состояние === 'используется_нашим_процессом') {
                    LogModule.logMessage('ОТЛАДКА', `Процесс (ciadpi для использования) на ${port} работает`);
                    document.getElementById(`stop-main-server-${i}`).removeAttribute('hidden');
                } else if (response.состояние === 'свободен') {
                    LogModule.logMessage('ОТЛАДКА', `Порт (ciadpi для использования) ${port} свободен`);
                    document.getElementById(`start-main-server-${i}`).removeAttribute('hidden');
                } else if (response.состояние === 'используется_другим_процессом') {
                    throw new Error(`Порт (ciadpi для использования) ${port} занят другим процессом`);
                } else if (response.ошибка) {
                    throw new Error(`Ошибка проверки порта (ciadpi для использования) ${port}: ${response.сообщение}`);
                }
            }
            status.usagePorts = 'ОК';
            LogModule.logMessage('ИНФО', 'Проверка портов (ciadpi для использования) завершена');
            return true;
        } catch (error) {
            updateErrorStatus('usagePorts', error, status);
            LogModule.logMessage('ОШИБКА', `${error.message}`);
            return false;
        }
    }

    // Шаг 10: Проверка портов (ciadpi_для_проверки_стратегий)
    async function checkTestingPorts(status) {
        LogModule.logMessage('ИНФО', 'Проверка портов (ciadpi для проверки стратегий)...');
        try {
            const baseUrl = 'php/12_linux.php';
            const fullPath = appConfig.ciadpi_для_проверки_стратегий.полный_путь;
            for (let i = 1; i <= 24; i++) {
                const processKey = `процесс_${i}`;
                const port = appConfig.ciadpi_для_проверки_стратегий[processKey].tcp_порт;
                const checkRequest = {
                    действие: 'проверка',
                    реальный_полный_путь: fullPath,
                    порт: port
                };
                const checkResponse = await postData(baseUrl, checkRequest);
                if (checkResponse.состояние === 'используется_нашим_процессом') {
                    const stopRequest = {
                        действие: 'проверить_и_завершить',
                        реальный_полный_путь: fullPath,
                        порт: port
                    };
                    const stopResponse = await postData(baseUrl, stopRequest);
                    if (!stopResponse.результат) {
                        throw new Error(`Не удалось остановить процесс (ciadpi для проверки стратегий) на порту ${port}: ${stopResponse.сообщение}`);
                    }
                    LogModule.logMessage('ОТЛАДКА', `Процесс (ciadpi для проверки стратегий) на ${port} остановлен`);
                } else if (checkResponse.состояние === 'используется_другим_процессом') {
                    throw new Error(`Порт (ciadpi для проверки стратегий) ${port} занят другим процессом`);
                } else if (checkResponse.состояние === 'свободен') {
                    LogModule.logMessage('ОТЛАДКА', `Порт (ciadpi для проверки стратегий) ${port} свободен`);
                } else if (checkResponse.ошибка) {
                    throw new Error(`Ошибка проверки порта (ciadpi для проверки стратегий) ${port}: ${checkResponse.сообщение}`);
                }
            }
            status.testingPorts = 'ОК';
            LogModule.logMessage('ИНФО', 'Проверка портов (ciadpi для проверки стратегий) завершена');
            return true;
        } catch (error) {
            updateErrorStatus('testingPorts', error, status);
            LogModule.logMessage('ОШИБКА', `${error.message}`);
            return false;
        }
    }

    // Шаг 11: Настройка интерфейса
    function setupInterface() {
        if (!appConfig) {
            LogModule.logMessage('ОШИБКА', 'Конфигурация не загружена, интерфейс не может быть настроен');
            return;
        }
        const selectLinks = document.getElementById('select-links');
        if (!selectLinks) {
            LogModule.logMessage('ОШИБКА', 'Элемент #select-links не найден');
            return;
        }
        const groups = Object.keys(appConfig.ссылки_по_умолчанию_для_проверки);
        groups.forEach(group => {
            const option = document.createElement('option');
            option.value = group;
            option.textContent = group;
            selectLinks.appendChild(option);
        });
        LogModule.logMessage('ИНФО', 'Выпадающий список групп ссылок по умолчанию заполнен');

        for (let i = 1; i <= 8; i++) {
            const processKey = `процесс_${i}`;
            const processData = appConfig.ciadpi_для_использования[processKey];
            if (!processData) {
                LogModule.logMessage('ОШИБКА', `Данные для процесса ${i} отсутствуют`);
                continue;
            }
            const ipPortElement = document.getElementById(`my-server-${i}-ip-and-port`);
            if (ipPortElement) {
                ipPortElement.textContent = `${processData.ip_для_сайта_и_pac_файла}:${processData.tcp_порт}`;
            }
            const strategyInput = document.getElementById(`my-server-${i}-strategy`);
            if (strategyInput) {
                strategyInput.value = processData.последняя_используемая_стратегия || '';
            }
            const domainsTextarea = document.getElementById(`my-server-${i}-links`);
            if (domainsTextarea) {
                domainsTextarea.value = processData.домены ? processData.домены.join('\n') : '';
            }
        }

        const pacLinkInput = document.getElementById('pac-link');
        if (pacLinkInput) {
            pacLinkInput.value = new URL('local.pac', window.location.href).href;
            LogModule.logMessage('ИНФО', 'Ссылка на PAC-файл сгенерирована');
        } else {
            LogModule.logMessage('ОШИБКА', 'Элемент #pac-link не найден');
        }

        for (let i = 1; i <= 10; i++) {
            const block = document.getElementById(`block-${i}`);
            if (block) block.removeAttribute('hidden');
        }
        LogModule.logMessage('ИНФО', 'Интерфейс успешно обновлен');
    }

    async function runPreparation() {
        const status = {};
        LogModule.logMessage('ИНФО', 'Начали подготовку...');

        if (!await detectOS(status)) {
            LogModule.logMessage('ОШИБКА', 'Подготовка прервана');
            return;
        }
        if (!await checkPHP(status)) {
            LogModule.logMessage('ОШИБКА', 'Подготовка прервана');
            return;
        }
        if (!await checkTools(status)) {
            LogModule.logMessage('ОШИБКА', 'Подготовка прервана');
            return;
        }		
        const fileCheckResult = await checkFiles(status);
        if (!fileCheckResult) {
            LogModule.logMessage('ОШИБКА', 'Подготовка прервана');
            return;
        }
        if (!await readConfig(status)) {
            LogModule.logMessage('ОШИБКА', 'Подготовка прервана');
            return;
        }

        const { domainsByProcess, ciadpiPath, hostsPathsByProcess } = fileCheckResult;
        for (let i = 1; i <= 8; i++) {
            const processKey = `процесс_${i}`;
            appConfig.ciadpi_для_использования[processKey].домены = domainsByProcess[i] || [];
            appConfig.ciadpi_для_использования[processKey].полный_путь = ciadpiPath;
            appConfig.ciadpi_для_использования[processKey].полный_путь_к_хост_листу = hostsPathsByProcess[i];
        }
        appConfig.ciadpi_для_проверки_стратегий.полный_путь = ciadpiPath;

        const firstServer = await detectFirstServerGGC(status);
        if (firstServer) {
            try {
                await detectOtherServersGGC(firstServer, status);
            } catch (error) {
                LogModule.logMessage('ОШИБКА', `Ошибка при определении других серверов текущего кластера Google Global Cache: ${error.message}`);
            }
        } else {
            LogModule.logMessage('ИНФО', 'Пропуск определения других серверов Google Global Cache из-за ошибки в определении первого сервера');
        }

        if (!await updatePAC(status)) {
            LogModule.logMessage('ОШИБКА', 'Подготовка прервана');
            return;
        }
        if (!await checkUsagePorts(status)) {
            LogModule.logMessage('ОШИБКА', 'Подготовка прервана');
            return;
        }
        if (!await checkTestingPorts(status)) {
            LogModule.logMessage('ОШИБКА', 'Подготовка прервана');
            return;
        }

        setupInterface();
        LogModule.logMessage('ИНФО', 'Подготовка завершена успешно');
    }

    document.addEventListener('DOMContentLoaded', runPreparation);

    return { runPreparation };
})();

window.PrepareModule = PrepareModule;