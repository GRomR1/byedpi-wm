const LOG_LEVELS = {
    'log-level-error': { allowed_tags: ['ОШИБКА'] },
    'log-level-info-plus-error': { allowed_tags: ['ИНФО', 'ОШИБКА'] },
    'log-level-info-plus-error-plus-debug': { allowed_tags: ['ИНФО', 'ОШИБКА', 'ОТЛАДКА'] },
    'log-level-hide-all': { allowed_tags: [] }
};

let allLogMessages = [];

function getDomElement(id) {
    return document.getElementById(id) || null;
}

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
    if (!element) return false;
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

function createToast(tag, message) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${tag === 'ИНФО' ? 'info' : 'error'}`;
    toast.textContent = `${message}`;
    container.insertBefore(toast, container.firstChild);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-out';
        toast.addEventListener('animationend', () => toast.remove());
    }, 5000);
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

class Logger {
    static log(tag, message) {
        logMessage(tag, message);
    }
}

class DomUtils {
    static getElement(id) {
        return document.getElementById(id);
    }

    static setValue(id, value) {
        const el = this.getElement(id);
        if (el && 'value' in el) el.value = value;
    }

    static setText(id, text) {
        const el = this.getElement(id);
        if (el) el.textContent = text;
    }

    static toggleVisibility(id, visible) {
        const el = this.getElement(id);
        if (el) el.hidden = !visible;
    }

    static setDisabled(id, disabled) {
        const el = this.getElement(id);
        if (el) el.disabled = disabled;
    }
}

class FetchService {
    static async fetchJson(url, options = {}) {
        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                Logger.log('ОШИБКА', `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            Logger.log('ОШИБКА', `Ошибка запроса: ${error.message}.`);
            throw error;
        }
    }
}

class DataLoader {
    async load() {
        try {
            Logger.log('ИНФО', 'Загрузка данных...');
            const data = await FetchService.fetchJson(`./prepare.php?_=${Date.now()}`);

            if (!data || typeof data !== 'object') {
                throw new Error('Некорректные данные.');
            }

            Logger.log('ИНФО', 'Загружено.');
            return data;
        } catch (error) {
            Logger.log('ОШИБКА', `Ошибка загрузки: ${error.message}.`);
            return null;
        }
    }
}

class OSDetector {
    static detect(data) {
        const os = data.os?.detected_os;
        if (!os) {
            Logger.log('ОШИБКА', 'Не удалось определить систему.');
            return null;
        }

        if (os === 'unsupported') {
            Logger.log('ОШИБКА', 'Неподдерживаемая система.');
            return null;
        }

        Logger.log('ИНФО', `Определена система: ${os}`);
        DomUtils.setText('my-os', `OS: ${os}`);
        return os;
    }
}

class ConfigValidator {
    static validate(data, os) {
        const config = CONFIG[os];
        if (!config) {
            Logger.log('ОШИБКА', `Конфигурация не найдена.`);
            return false;
        }

        let allValid = true;
        for (const [key, description] of Object.entries(config)) {
            const value = this.getValue(data, key);
            const validator = VALIDATION_RULES[key];
            const isValid = validator ? validator(value) : (value !== null && value !== undefined);

            Logger.log(isValid ? 'ОТЛАДКА' : 'ОШИБКА',
                `${description}: ${isValid ? 'OK' : 'ОШИБКА'}`);

            if (!isValid) allValid = false;
        }

        return allValid;
    }

    static getValue(data, path) {
        return path.split('.').reduce((obj, key) => obj?.[key], data);
    }
}

class ServerManager {
    static async checkAllServers(data) {
        try {
            Logger.log('ИНФО', 'Проверка портов и процессов ByeDPI...');
            const [mainOk, testOk] = await Promise.all([
                this.checkMainServers(data),
                this.checkTestServers(data)
            ]);

            if (!mainOk || !testOk) {
                Logger.log('ОШИБКА', 'Проблемы с процессами.');
                return false;
            }

            return true;
        } catch (error) {
            Logger.log('ОШИБКА', `Ошибка проверки процессов ByeDPI: ${error.message}`);
            return false;
        }
    }

    static async checkMainServers(data) {
        const results = [];
        for (let i = 1; i <= 8; i++) {
            results.push(await this.checkServer(data, i, 'main'));
        }
        return results.every(Boolean);
    }

    static async checkTestServers(data) {
        const results = [];
        for (let i = 1; i <= 20; i++) {
            results.push(await this.checkServer(data, i, 'test'));
        }
        return results.every(Boolean);
    }

static async checkServer(data, serverNum, type) {
    const operation = type === 'main' ? 'использования' : 'тестирования';

    const port = this.getPort(data, serverNum, type);
    if (!port) {
        Logger.log('ОШИБКА', `Порт для сервера (ByeDPI для ${operation} ${serverNum}) не найден.`);
        return false;
    }

    try {
        const os = data.os?.detected_os || 'windows';
        const processFile = os === 'windows' ? 'windows.php' : 'linux.php';
        const response = await FetchService.fetchJson(processFile, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                real_file_path: data.files?.ciadpi_file?.filepath,
                port: port,
                action: type === 'main' ? 'check' : 'check_and_kill'
            })
        });

        return this.handleResponse(data, serverNum, type, port, response);
    } catch (error) {
        Logger.log('ОШИБКА', `(ByeDPI для ${operation} ${serverNum}): ${error.message}.`);
        return false;
    }
}

    static getPort(data, serverNum, type) {
        if (type === 'main') {
            return data.config?.ciadpi_main_servers_tcp_ports?.[`main_${serverNum}`];
        }
        return data.config?.ciadpi_test_servers_tcp_ports?.[`thread_${serverNum}`];
    }

    static handleResponse(data, serverNum, type, port, response) {
        const {result, message, state} = response;
        const serverType = type === 'main' ? 'использования' : 'тестирования';

        Logger.log(result ? 'ОТЛАДКА' : 'ОШИБКА',
            `(ByeDPI для ${serverType} ${serverNum}) на порту ${port}: ${message}.`);

        if (type === 'main') {
            this.updateMainServerUI(data, serverNum, port, result, state);
        }

        return result;
    }

static updateMainServerUI(data, serverNum, port, isRunning, state) {
    const ip = data.config?.local_ip || 'localhost';
    DomUtils.setText(`my-server-${serverNum}-ip-and-port`, `${ip}:${port}`);

    const strategyKey = `main_${serverNum}`;
    const lastStrategy = data.config?.ciadpi_main_servers_latest_used_strategies?.[strategyKey] || '';

    DomUtils.setValue(`my-server-${serverNum}-strategy`, lastStrategy);

    if (isRunning && state === 'in_use_by_us') {
        DomUtils.setDisabled(`my-server-${serverNum}-strategy`, true);
        DomUtils.setDisabled(`select-use-domains-list-or-not-${serverNum}`, true);
        DomUtils.toggleVisibility(`start-main-server-${serverNum}`, false);
        DomUtils.toggleVisibility(`stop-main-server-${serverNum}`, true);
    } else {
        DomUtils.setDisabled(`my-server-${serverNum}-strategy`, false);
        DomUtils.setValue(`select-use-domains-list-or-not-${serverNum}`, 'false');
        DomUtils.setDisabled(`select-use-domains-list-or-not-${serverNum}`, false);
        DomUtils.toggleVisibility(`start-main-server-${serverNum}`, true);
        DomUtils.toggleVisibility(`stop-main-server-${serverNum}`, false);
    }
}
}

class UIManager {
    static init(data, os) {
        this.updatePacLink(data);
        this.updateDomains(data);
        this.toggleOSElements(os);
        this.initLinksSelector(data);
    }

static updatePacLink(data) {
    const pacInput = DomUtils.getElement('pac-link');
    if (!pacInput || !data.config?.local_ip) return;

    const { protocol } = window.location;
    const localIP = data.config.local_ip;
    const port = window.location.port;
    const currentPath = window.location.pathname;
    const directoryPath = currentPath 
        ? currentPath.substring(0, currentPath.lastIndexOf('/') + 1) 
        : '/';

    const pacUrl = `${protocol}//${localIP}${port ? ':' + port : ''}${directoryPath}local.pac`;
    
    pacInput.value = pacUrl;
    Logger.log('ОТЛАДКА', `PAC URL: ${pacInput.value}`);
}

    static updateDomains(data) {
        for (let i = 1; i <= 8; i++) {
            const textarea = DomUtils.getElement(`my-server-${i}-links`);
            if (!textarea) continue;

            const domains = data.files?.main_server_hosts?.[`main_server_${i}_hosts_file`]?.hosts || [];
            textarea.value = domains.join('\n');
        }
    }

    static toggleOSElements(os) {
        const isWindows = os === 'windows';
        ['tfo', 'drop-sack', 'md5sig'].forEach(id => {
            DomUtils.toggleVisibility(id, !isWindows);
        });
    }

    static initLinksSelector(data) {
        const select = DomUtils.getElement('select-links');
        const addBtn = DomUtils.getElement('add-links');
        const textarea = DomUtils.getElement('links');

        if (!select || !addBtn || !textarea) return;

        const baseGroups = data.config?.select_links || {};

        const allGroups = { ...baseGroups };

        if (data.your_google_global_cache &&
            data.your_google_global_cache !== "Ошибка: Google Global Cache не удалось определить." &&
            !data.your_google_global_cache.includes('Ошибка')) {

            allGroups['Google Global Cache'] = [data.your_google_global_cache];
        }

        select.innerHTML = Object.keys(allGroups)
            .map(group => `<option value="${group}">${group}</option>`)
            .join('');

        addBtn.onclick = () => {
            const group = select.value;
            const links = allGroups[group] || [];

            const current = textarea.value.split('\n').filter(Boolean);
            textarea.value = [...current, ...links].join('\n');
            Logger.log('ИНФО', `Добавлено ${links.length} ссылок из "${group}".`);
        };
    }
}

class CopyManager {
    static init() {
        this.setupHandler('copy-pac-link', 'pac-link', this.copyText);
        this.setupHandler('copy-result', 'result', this.copyText);
        this.setupHandler('copy-links', 'links', this.copyText);
        this.setupHandler('copy-links-domains', 'links', this.copyDomains);
        this.setupHandler('copy-generated-strategies', 'generated-strategies', this.copyText);
        this.setupHandler('copy-result-strategies', 'result', this.copyStrategies);

        for (let i = 1; i <= 8; i++) {
            this.setupHandler(`copy-main-server-${i}`, `my-server-${i}-links`, this.copyDomains);
        }
    }

    static setupHandler(buttonId, targetId, copyFn) {
        const button = DomUtils.getElement(buttonId);
        if (!button) return;

        button.addEventListener('click', () => {
            const target = DomUtils.getElement(targetId);
            if (!target) {
                Logger.log('ОШИБКА', `Элемент ${targetId} не найден.`);
                return;
            }
            copyFn(target);
        });
    }

    static copyText(element) {
        const text = element.value || element.textContent || '';
        CopyManager.copyToClipboard(text.trim());
    }

    static copyDomains(element) {
        const text = element.value || '';
        const domains = text.split('\n')
            .map(line => {
                try {
                    return new URL(line.trim()).hostname;
                } catch {
                    return null;
                }
            })
            .filter(Boolean)
            .filter((domain, i, arr) => arr.indexOf(domain) === i)
            .join('\n');

        CopyManager.copyToClipboard(domains);
    }

    static copyStrategies(element) {
        try {
            const text = element.innerText || '';
            const strategies = text.split('\n')
                .filter(line => line.includes('Стратегия:'))
                .map(line => {
                    const parts = line.split('Стратегия:');
                    return parts.length > 1 ? parts[1].trim() : '';
                })
                .filter(Boolean)
                .join('\n');

            if (!strategies) throw new Error('Стратегии не найдены');
            CopyManager.copyToClipboard(strategies);
        } catch (error) {
            Logger.log('ОШИБКА', `Ошибка копирования: ${error.message}.`);
        }
    }

    static copyToClipboard(text) {
        if (!text) {
            Logger.log('ИНФО', 'Нечего копировать.');
            return;
        }

        if (navigator.clipboard) {
            navigator.clipboard.writeText(text)
                .then(() => Logger.log('ИНФО', 'Скопировано.'))
                .catch(err => {
                    Logger.log('ОШИБКА', `Ошибка копирования: ${err}.`);
                    CopyManager.fallbackCopy(text);
                });
        } else {
            CopyManager.fallbackCopy(text);
        }
    }

static fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    document.body.appendChild(textarea);
    textarea.select();

    try {
        document.execCommand('copy');
        Logger.log('ИНФО', 'Скопировано.');
    } catch (err) {
        Logger.log('ОШИБКА', 'Не удалось скопировать.');
    } finally {
        document.body.removeChild(textarea);
    }
}
}

class ClearManager {
    static init() {
        this.setupHandler('clear-strategies', 'generated-strategies');
        this.setupHandler('clear-links', 'links');

        for (let i = 1; i <= 8; i++) {
            this.setupHandler(`clean-main-server-${i}`, `my-server-${i}-links`);
        }
    }

    static setupHandler(buttonId, targetId) {
        const button = DomUtils.getElement(buttonId);
        if (!button) return;

        button.addEventListener('click', () => {
            const target = DomUtils.getElement(targetId);
            if (!target) {
                Logger.log('ОШИБКА', `Элемент ${targetId} не найден.`);
                return;
            }

            if ('value' in target) {
                target.value = '';
            } else {
                target.textContent = '';
            }
            Logger.log('ИНФО', 'Очищено.');
        });
    }
}

class StrategyManager {
    static init() {
        const button = DomUtils.getElement('add-used-strategies');
        if (!button) return;

        button.addEventListener('click', () => {
            const strategies = [];
            for (let i = 1; i <= 8; i++) {
                const input = DomUtils.getElement(`my-server-${i}-strategy`);
                if (input && input.value.trim()) {
                    strategies.push(input.value.trim());
                }
            }

            if (strategies.length === 0) {
                Logger.log('ИНФО', 'Нечего добавлять.');
                return;
            }

            const target = DomUtils.getElement('generated-strategies');
            if (!target) {
                Logger.log('ОШИБКА', 'Элемент не найден.');
                return;
            }

            const separator = target.value ? '\n' : '';
            target.value += separator + strategies.join('\n');
            Logger.log('ИНФО', `Добавлено ${strategies.length} стратегий.`);
        });
    }
}

const CONFIG = {
    "windows": {
        "php.shell_exec": "php -> shell_exec функция",
		"php.popen": "php -> popen функция",
        "php.file_get_contents": "php -> file_get_contents функция",
        "php.php_curl": "php -> curl расширение",
        "php.com_dotnet": "php -> com dotnet расширение",
        "php.wmi_connect": "php -> wmi подключение",
        "tools_and_functions.powershell": "windows -> powershell",
        "files.ciadpi_file.exists": "byedpi\\ciadpi.exe -> Существует",
        "files.ciadpi_file.is_file": "byedpi\\ciadpi.exe -> Является файлом",
        "files.ciadpi_file.readable": "byedpi\\ciadpi.exe -> Чтение",
        "files.ciadpi_file.executable": "byedpi\\ciadpi.exe -> Исполняемый",
        "files.config_file.exists": "config.json -> Существует",
        "files.config_file.is_file": "config.json -> Является файлом",
        "files.config_file.readable": "config.json -> Чтение",
        "files.config_file.writable": "config.json -> Запись",
        "files.config_file.valid": "config.json -> Правильный",
        "files.curl_certificate_file.exists": "curl_cert\\cacert.pem -> Существует",
        "files.curl_certificate_file.is_file": "curl_cert\\cacert.pem -> Является файлом",
        "files.curl_certificate_file.readable": "curl_cert\\cacert.pem -> Чтение",
        "files.pac_file.exists": "local.pac -> Существует",
        "files.pac_file.is_file": "local.pac -> Является файлом",
        "files.pac_file.readable": "local.pac -> Чтение",
        "files.pac_file.writable": "local.pac -> Запись",
        "files.windows_file.exists": "windows.php -> Существует",
        "files.windows_file.is_file": "windows.php -> Является файлом",
        "files.windows_file.readable": "windows.php -> Чтение",
        "files.main_server_hosts.main_server_1_hosts_file.exists": "byedpi\\main_server_1_hosts.txt -> Существует",
        "files.main_server_hosts.main_server_1_hosts_file.is_file": "byedpi\\main_server_1_hosts.txt -> Является файлом",
        "files.main_server_hosts.main_server_1_hosts_file.readable": "byedpi\\main_server_1_hosts.txt -> Чтение",
        "files.main_server_hosts.main_server_1_hosts_file.writable": "byedpi\\main_server_1_hosts.txt -> Запись",
        "files.main_server_hosts.main_server_2_hosts_file.exists": "byedpi\\main_server_2_hosts.txt -> Существует",
        "files.main_server_hosts.main_server_2_hosts_file.is_file": "byedpi\\main_server_2_hosts.txt -> Является файлом",
        "files.main_server_hosts.main_server_2_hosts_file.readable": "byedpi\\main_server_2_hosts.txt -> Чтение",
        "files.main_server_hosts.main_server_2_hosts_file.writable": "byedpi\\main_server_2_hosts.txt -> Запись",
        "files.main_server_hosts.main_server_3_hosts_file.exists": "byedpi\\main_server_3_hosts.txt -> Существует",
        "files.main_server_hosts.main_server_3_hosts_file.is_file": "byedpi\\main_server_3_hosts.txt -> Является файлом",
        "files.main_server_hosts.main_server_3_hosts_file.readable": "byedpi\\main_server_3_hosts.txt -> Чтение",
        "files.main_server_hosts.main_server_3_hosts_file.writable": "byedpi\\main_server_3_hosts.txt -> Запись",
        "files.main_server_hosts.main_server_4_hosts_file.exists": "byedpi\\main_server_4_hosts.txt -> Существует",
        "files.main_server_hosts.main_server_4_hosts_file.is_file": "byedpi\\main_server_4_hosts.txt -> Является файлом",
        "files.main_server_hosts.main_server_4_hosts_file.readable": "byedpi\\main_server_4_hosts.txt -> Чтение",
        "files.main_server_hosts.main_server_4_hosts_file.writable": "byedpi\\main_server_4_hosts.txt -> Запись",
        "files.main_server_hosts.main_server_5_hosts_file.exists": "byedpi\\main_server_5_hosts.txt -> Существует",
        "files.main_server_hosts.main_server_5_hosts_file.is_file": "byedpi\\main_server_5_hosts.txt -> Является файлом",
        "files.main_server_hosts.main_server_5_hosts_file.readable": "byedpi\\main_server_5_hosts.txt -> Чтение",
        "files.main_server_hosts.main_server_5_hosts_file.writable": "byedpi\\main_server_5_hosts.txt -> Запись",
        "files.main_server_hosts.main_server_6_hosts_file.exists": "byedpi\\main_server_6_hosts.txt -> Существует",
        "files.main_server_hosts.main_server_6_hosts_file.is_file": "byedpi\\main_server_6_hosts.txt -> Является файлом",
        "files.main_server_hosts.main_server_6_hosts_file.readable": "byedpi\\main_server_6_hosts.txt -> Чтение",
        "files.main_server_hosts.main_server_6_hosts_file.writable": "byedpi\\main_server_6_hosts.txt -> Запись",
        "files.main_server_hosts.main_server_7_hosts_file.exists": "byedpi\\main_server_7_hosts.txt -> Существует",
        "files.main_server_hosts.main_server_7_hosts_file.is_file": "byedpi\\main_server_7_hosts.txt -> Является файлом",
        "files.main_server_hosts.main_server_7_hosts_file.readable": "byedpi\\main_server_7_hosts.txt -> Чтение",
        "files.main_server_hosts.main_server_7_hosts_file.writable": "byedpi\\main_server_7_hosts.txt -> Запись",
        "files.main_server_hosts.main_server_8_hosts_file.exists": "byedpi\\main_server_8_hosts.txt -> Существует",
        "files.main_server_hosts.main_server_8_hosts_file.is_file": "byedpi\\main_server_8_hosts.txt -> Является файлом",
        "files.main_server_hosts.main_server_8_hosts_file.readable": "byedpi\\main_server_8_hosts.txt -> Чтение",
        "files.main_server_hosts.main_server_8_hosts_file.writable": "byedpi\\main_server_8_hosts.txt -> Запись",
        "config.local_ip": "Локальный IP -> Для PAC файла и отображения",
        "config.ciadpi_main_servers_tcp_ports.main_1": "(ByeDPI для использования 1) -> TCP порт -> Значение",
        "config.ciadpi_main_servers_tcp_ports.main_2": "(ByeDPI для использования 2) -> TCP порт -> Значение",
        "config.ciadpi_main_servers_tcp_ports.main_3": "(ByeDPI для использования 3) -> TCP порт -> Значение",
        "config.ciadpi_main_servers_tcp_ports.main_4": "(ByeDPI для использования 4) -> TCP порт -> Значение",
        "config.ciadpi_main_servers_tcp_ports.main_5": "(ByeDPI для использования 5) -> TCP порт -> Значение",
        "config.ciadpi_main_servers_tcp_ports.main_6": "(ByeDPI для использования 6) -> TCP порт -> Значение",
        "config.ciadpi_main_servers_tcp_ports.main_7": "(ByeDPI для использования 7) -> TCP порт -> Значение",
        "config.ciadpi_main_servers_tcp_ports.main_8": "(ByeDPI для использования 8) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_1": "(ByeDPI для тестирования 1) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_2": "(ByeDPI для тестирования 2) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_3": "(ByeDPI для тестирования 3) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_4": "(ByeDPI для тестирования 4) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_5": "(ByeDPI для тестирования 5) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_6": "(ByeDPI для тестирования 6) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_7": "(ByeDPI для тестирования 7) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_8": "(ByeDPI для тестирования 8) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_9": "(ByeDPI для тестирования 9) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_10": "(ByeDPI для тестирования 10) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_11": "(ByeDPI для тестирования 11) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_12": "(ByeDPI для тестирования 12) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_13": "(ByeDPI для тестирования 13) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_14": "(ByeDPI для тестирования 14) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_15": "(ByeDPI для тестирования 15) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_16": "(ByeDPI для тестирования 16) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_17": "(ByeDPI для тестирования 17) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_18": "(ByeDPI для тестирования 18) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_19": "(ByeDPI для тестирования 19) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_20": "(ByeDPI для тестирования 20) -> TCP порт -> Значение",
        "pac_update.success": "PAC файл -> Обновлен IP и порты"
    },
    "linux": {
        "php.shell_exec": "php -> shell_exec функция",
        "php.file_get_contents": "php -> file_get_contents функция",
        "php.php_curl": "php -> curl расширение",
        "tools_and_functions.lsof": "linux -> lsof",
        "tools_and_functions.nohup": "linux -> nohup",
        "tools_and_functions.kill": "linux -> kill",
        "tools_and_functions./proc_mounted": "linux -> /proc",
        "tools_and_functions./proc_exe_readable": "linux -> /proc/$pid/exe",
        "tools_and_functions./proc_cmdline_readable": "linux -> /proc/$pid/cmdline",
        "files.ciadpi_file.exists": "byedpi/ciadpi -> Существует",
        "files.ciadpi_file.is_file": "byedpi/ciadpi -> Является файлом",
        "files.ciadpi_file.readable": "byedpi/ciadpi -> Чтение",
        "files.ciadpi_file.executable": "byedpi/ciadpi -> Исполняемый",
        "files.config_file.exists": "config.json -> Существует",
        "files.config_file.is_file": "config.json -> Является файлом",
        "files.config_file.readable": "config.json -> Чтение",
        "files.config_file.writable": "config.json -> Запись",
        "files.config_file.valid": "config.json -> Правильный",
        "files.curl_certificate_file.exists": "curl_cert/cacert.pem -> Существует",
        "files.curl_certificate_file.is_file": "curl_cert/cacert.pem -> Является файлом",
        "files.curl_certificate_file.readable": "curl_cert/cacert.pem -> Чтение",
        "files.pac_file.exists": "local.pac -> Существует",
        "files.pac_file.is_file": "local.pac -> Является файлом",
        "files.pac_file.readable": "local.pac -> Чтение",
        "files.pac_file.writable": "local.pac -> Запись",
        "files.linux_file.exists": "linux.php -> Существует",
        "files.linux_file.is_file": "linux.php -> Является файлом",
        "files.linux_file.readable": "linux.php -> Чтение",
        "files.main_server_hosts.main_server_1_hosts_file.exists": "byedpi/main_server_1_hosts.txt -> Существует",
        "files.main_server_hosts.main_server_1_hosts_file.is_file": "byedpi/main_server_1_hosts.txt -> Является файлом",
        "files.main_server_hosts.main_server_1_hosts_file.readable": "byedpi/main_server_1_hosts.txt -> Чтение",
        "files.main_server_hosts.main_server_1_hosts_file.writable": "byedpi/main_server_1_hosts.txt -> Запись",
        "files.main_server_hosts.main_server_2_hosts_file.exists": "byedpi/main_server_2_hosts.txt -> Существует",
        "files.main_server_hosts.main_server_2_hosts_file.is_file": "byedpi/main_server_2_hosts.txt -> Является файлом",
        "files.main_server_hosts.main_server_2_hosts_file.readable": "byedpi/main_server_2_hosts.txt -> Чтение",
        "files.main_server_hosts.main_server_2_hosts_file.writable": "byedpi/main_server_2_hosts.txt -> Запись",
        "files.main_server_hosts.main_server_3_hosts_file.exists": "byedpi/main_server_3_hosts.txt -> Существует",
        "files.main_server_hosts.main_server_3_hosts_file.is_file": "byedpi/main_server_3_hosts.txt -> Является файлом",
        "files.main_server_hosts.main_server_3_hosts_file.readable": "byedpi/main_server_3_hosts.txt -> Чтение",
        "files.main_server_hosts.main_server_3_hosts_file.writable": "byedpi/main_server_3_hosts.txt -> Запись",
        "files.main_server_hosts.main_server_4_hosts_file.exists": "byedpi/main_server_4_hosts.txt -> Существует",
        "files.main_server_hosts.main_server_4_hosts_file.is_file": "byedpi/main_server_4_hosts.txt -> Является файлом",
        "files.main_server_hosts.main_server_4_hosts_file.readable": "byedpi/main_server_4_hosts.txt -> Чтение",
        "files.main_server_hosts.main_server_4_hosts_file.writable": "byedpi/main_server_4_hosts.txt -> Запись",
        "files.main_server_hosts.main_server_5_hosts_file.exists": "byedpi/main_server_5_hosts.txt -> Существует",
        "files.main_server_hosts.main_server_5_hosts_file.is_file": "byedpi/main_server_5_hosts.txt -> Является файлом",
        "files.main_server_hosts.main_server_5_hosts_file.readable": "byedpi/main_server_5_hosts.txt -> Чтение",
        "files.main_server_hosts.main_server_5_hosts_file.writable": "byedpi/main_server_5_hosts.txt -> Запись",
        "files.main_server_hosts.main_server_6_hosts_file.exists": "byedpi/main_server_6_hosts.txt -> Существует",
        "files.main_server_hosts.main_server_6_hosts_file.is_file": "byedpi/main_server_6_hosts.txt -> Является файлом",
        "files.main_server_hosts.main_server_6_hosts_file.readable": "byedpi/main_server_6_hosts.txt -> Чтение",
        "files.main_server_hosts.main_server_6_hosts_file.writable": "byedpi/main_server_6_hosts.txt -> Запись",
        "files.main_server_hosts.main_server_7_hosts_file.exists": "byedpi/main_server_7_hosts.txt -> Существует",
        "files.main_server_hosts.main_server_7_hosts_file.is_file": "byedpi/main_server_7_hosts.txt -> Является файлом",
        "files.main_server_hosts.main_server_7_hosts_file.readable": "byedpi/main_server_7_hosts.txt -> Чтение",
        "files.main_server_hosts.main_server_7_hosts_file.writable": "byedpi/main_server_7_hosts.txt -> Запись",
        "files.main_server_hosts.main_server_8_hosts_file.exists": "byedpi/main_server_8_hosts.txt -> Существует",
        "files.main_server_hosts.main_server_8_hosts_file.is_file": "byedpi/main_server_8_hosts.txt -> Является файлом",
        "files.main_server_hosts.main_server_8_hosts_file.readable": "byedpi/main_server_8_hosts.txt -> Чтение",
        "files.main_server_hosts.main_server_8_hosts_file.writable": "byedpi/main_server_8_hosts.txt -> Запись",
        "config.local_ip": "Локальный IP -> Для PAC файла и отображения",
        "config.ciadpi_main_servers_tcp_ports.main_1": "(ByeDPI для использования 1) -> TCP порт -> Значение",
        "config.ciadpi_main_servers_tcp_ports.main_2": "(ByeDPI для использования 2) -> TCP порт -> Значение",
        "config.ciadpi_main_servers_tcp_ports.main_3": "(ByeDPI для использования 3) -> TCP порт -> Значение",
        "config.ciadpi_main_servers_tcp_ports.main_4": "(ByeDPI для использования 4) -> TCP порт -> Значение",
        "config.ciadpi_main_servers_tcp_ports.main_5": "(ByeDPI для использования 5) -> TCP порт -> Значение",
        "config.ciadpi_main_servers_tcp_ports.main_6": "(ByeDPI для использования 6) -> TCP порт -> Значение",
        "config.ciadpi_main_servers_tcp_ports.main_7": "(ByeDPI для использования 7) -> TCP порт -> Значение",
        "config.ciadpi_main_servers_tcp_ports.main_8": "(ByeDPI для использования 8) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_1": "(ByeDPI для тестирования 1) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_2": "(ByeDPI для тестирования 2) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_3": "(ByeDPI для тестирования 3) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_4": "(ByeDPI для тестирования 4) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_5": "(ByeDPI для тестирования 5) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_6": "(ByeDPI для тестирования 6) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_7": "(ByeDPI для тестирования 7) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_8": "(ByeDPI для тестирования 8) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_9": "(ByeDPI для тестирования 9) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_10": "(ByeDPI для тестирования 10) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_11": "(ByeDPI для тестирования 11) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_12": "(ByeDPI для тестирования 12) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_13": "(ByeDPI для тестирования 13) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_14": "(ByeDPI для тестирования 14) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_15": "(ByeDPI для тестирования 15) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_16": "(ByeDPI для тестирования 16) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_17": "(ByeDPI для тестирования 17) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_18": "(ByeDPI для тестирования 18) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_19": "(ByeDPI для тестирования 19) -> TCP порт -> Значение",
        "config.ciadpi_test_servers_tcp_ports.thread_20": "(ByeDPI для тестирования 20) -> TCP порт -> Значение",
        "pac_update.success": "PAC файл -> Обновлен IP и порты"
    }
};

const VALIDATION_RULES = {
    'config.local_ip': (v) => typeof v === 'string' && /^[\d.]+$/.test(v),
    'pac_update.success': (v) => v === true,
    ...Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [
            `config.ciadpi_main_servers_tcp_ports.main_${i + 1}`,
            (v) => (typeof v === 'number' && v >= 1 && v <= 65535) ||
                   (typeof v === 'string' && /^\d+$/.test(v) && parseInt(v) <= 65535)
        ])
    ),
    ...Object.fromEntries(
        Array.from({ length: 20 }, (_, i) => [
            `config.ciadpi_test_servers_tcp_ports.thread_${i + 1}`,
            (v) => (typeof v === 'number' && v >= 1 && v <= 65535) ||
                   (typeof v === 'string' && /^\d+$/.test(v) && parseInt(v) <= 65535)
        ])
    )
};

class App {
    static async init() {
        try {
            const logLevelSelect = DomUtils.getElement('log-level');
            if (logLevelSelect) {
                logLevelSelect.addEventListener('change', updateLogVisibility);
            }

            const data = await new DataLoader().load();
            if (!data) return;

            const os = OSDetector.detect(data);
            if (!os) return;

            if (!ConfigValidator.validate(data, os)) {
                Logger.log('ОШИБКА', 'Ошибки в конфигурации.');
                return;
            }

            if (!await ServerManager.checkAllServers(data)) {
                Logger.log('ОШИБКА', 'Проблемы с ciadpi процессами.');
                return;
            }

            window.appData = data;
			document.dispatchEvent(new Event('appDataReady'));

            UIManager.init(data, os);

            for (let i = 3; i <= 10; i++) {
                DomUtils.toggleVisibility(`block-${i}`, true);
            }

            CopyManager.init();
            ClearManager.init();
            StrategyManager.init();

            Logger.log('ИНФО', 'Завершено.');

        } catch (error) {
            Logger.log('ОШИБКА', `Критическая ошибка: ${error.message}.`);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});