//10_start_stop_test.js
class UIController {
    constructor() {
        this.elements = {
            startBtn: document.getElementById('process-start'),
            stopBtn: document.getElementById('process-stop'),
            status: document.getElementById('process-status'),
            threads: document.getElementById('current-threads-count'),
            totalLinks: document.getElementById('total-links'),
            totalStrategies: document.getElementById('total-strategies'),
            processed: document.getElementById('processed-strategies-count'),
            result: document.getElementById('result'),
            buckets: {
                '0-9': document.getElementById('percentage-0-9'),
                '10-19': document.getElementById('percentage-10-19'),
                '20-29': document.getElementById('percentage-20-29'),
                '30-39': document.getElementById('percentage-30-39'),
                '40-49': document.getElementById('percentage-40-49'),
                '50-59': document.getElementById('percentage-50-59'),
                '60-69': document.getElementById('percentage-60-69'),
                '70-79': document.getElementById('percentage-70-79'),
                '80-89': document.getElementById('percentage-80-89'),
                '90-99': document.getElementById('percentage-90-99'),
                '100': document.getElementById('percentage-100')
            }
        };
    }

    initialize() {
        this.elements.startBtn.hidden = true;
        this.elements.stopBtn.hidden = false;
        this.elements.stopBtn.disabled = false;
        this.setStatus('Запущено');
        this.setThreads(0);
        this.setTotalLinks(0);
        this.setTotalStrategies(0);
        this.setProcessed(0);
        this.clearBuckets();
        this.elements.result.innerHTML = '';
    }

    setStatus(text) { this.elements.status.textContent = text; }
    setThreads(count) { this.elements.threads.textContent = count; }
    setTotalLinks(count) { this.elements.totalLinks.textContent = count; }
    setTotalStrategies(count) { this.elements.totalStrategies.textContent = count; }
    setProcessed(count) { this.elements.processed.textContent = count; }
    clearBuckets() { Object.values(this.elements.buckets).forEach(el => el.textContent = '0'); }
    updateBucket(bucket, count) { this.elements.buckets[bucket].textContent = count; }

    applyResultFilter(filter) {
        const blocks = this.elements.result.querySelectorAll('.result-block');
        blocks.forEach(block => {
            const percentage = parseInt(block.getAttribute('data-percentage'), 10);
            let visible = false;

            switch (filter) {
                case 'all': visible = true; break;
                case 'hide': visible = false; break;
                case '100': visible = (percentage === 100); break;
                default:
                    if (filter.includes('-')) {
                        const [min, max] = filter.split('-').map(Number);
                        visible = (percentage >= min && percentage <= max);
                    }
            }

            block.style.display = visible ? 'block' : 'none';
        });
    }

    appendResult(html) {
        const resultElement = this.elements.result;
        const wasScrolledToBottom = resultElement.scrollHeight - resultElement.clientHeight <= resultElement.scrollTop + 1;
        
        resultElement.insertAdjacentHTML('beforeend', html);
        
        const selectResult = document.getElementById('select-result');
        if (selectResult) {
            this.applyResultFilter(selectResult.value);
        }
        
        if (wasScrolledToBottom) {
            resultElement.scrollTop = resultElement.scrollHeight;
        }
    }

    finalize(stopped) {
        this.elements.startBtn.hidden = false;
        this.elements.stopBtn.hidden = true;
        this.elements.stopBtn.disabled = false;
        this.setStatus(stopped ? 'Остановлено' : 'Завершено');
    }

    disableStop() { this.elements.stopBtn.disabled = true; }
}

class InputValidator {
    static process(id, errorMsg) {
        const el = document.getElementById(id);
        if (!el) return null;
        const text = el.value.trim();
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);
        if (!lines.length) {
            LogModule.logMessage('ОШИБКА', errorMsg);
            return null;
        }
        return lines;
    }
}

class ProcessController {
    constructor(config) {
        this.config = config;
        this.api = 'php/12_linux.php';
        this.ciadpiPath = config.ciadpi_для_проверки_стратегий.полный_путь;
        this.ipForRun = config.ciadpi_для_проверки_стратегий.ip_для_запуска;
    }

    async checkPort(threadId) {
        const port = this.getPort(threadId);
        const postData = {
            действие: 'проверка',
            реальный_полный_путь: this.ciadpiPath,
            порт: port,
            ip_для_запуска: this.ipForRun
        };
        const response = await this.sendRequest(postData);
        if (!response.результат) {
            throw new Error(response.сообщение);
        }
        return response.состояние;
    }

    async start(threadId, strategy) {
        const port = this.getPort(threadId);
        const postData = {
            действие: 'проверить_и_запустить',
            реальный_полный_путь: this.ciadpiPath,
            ip_для_запуска: this.ipForRun,
            порт: port,
            аргументы: strategy
        };
        const response = await this.sendRequest(postData);
        if (!response.результат) {
            throw new Error(response.сообщение);
        }
        return true;
    }

    async stop(threadId) {
        const port = this.getPort(threadId);
        const postData = {
            действие: 'проверить_и_завершить',
            реальный_полный_путь: this.ciadpiPath,
            порт: port
        };
        const response = await this.sendRequest(postData);
        if (!response.результат) {
            throw new Error(response.сообщение);
        }
        return true;
    }

    getPort(threadId) {
        return this.config.ciadpi_для_проверки_стратегий[`процесс_${threadId}`].tcp_порт;
    }

async sendRequest(postData) {
    try {
        const response = await fetch(this.api, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(postData)
        });
        const responseBody = await response.json();
        if (!response.ok) {
            throw new Error(responseBody.сообщение || `HTTP ошибка: ${response.status}`);
        }
        return responseBody;
    } catch (error) {
        throw new Error(`Ошибка запроса: ${error.message}`);
    }
}
}

class LinkChecker {
    constructor(params) {
        this.params = params;
    }

async check(threadId, link) {
    const ip = window.appConfig.ciadpi_для_проверки_стратегий.ip_для_запуска;
    const port = window.appConfig.ciadpi_для_проверки_стратегий[`процесс_${threadId}`].tcp_порт;
    const postData = {
        socks5_server_ip: ip,
        socks5_server_port: port,
        curl_connection_timeout: this.params.connectionTimeout,
        curl_max_timeout: this.params.maxTimeout,
        curl_http_method: this.params.httpMethod,
        curl_http_version: this.params.httpVersion,
        curl_tls_version: this.params.tlsVersion,
        curl_user_agent: this.params.userAgent,
        link
    };
    try {
        const response = await fetch('php/11_curl.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(postData)
        });
        const responseBody = await response.json();
        if (!response.ok) {
            return {
                результат: false,
                сообщение: responseBody.сообщение || `HTTP ошибка: ${response.status}`,
                код_ответа_http: '000',
                link
            };
        }
        return { ...responseBody, link: responseBody.link || link };
    } catch (error) {
        return {
            результат: false,
            сообщение: error.message,
            код_ответа_http: '000',
            link
        };
    }
}
}

class StrategyExecutor {
    constructor(threadId, strategy, processController, linkChecker, links) {
        this.threadId = threadId;
        this.strategy = strategy;
        this.process = processController;
        this.checker = linkChecker;
        this.links = [...links].sort(() => Math.random() - 0.5);
    }

    async execute() {
        try {
            if (!(await this.ensurePortFree())) {
                return { processed: true, bucket: null, percentage: 0, responses: [] };
            }

            await this.process.start(this.threadId, this.strategy);
            LogModule.logMessage('ОТЛАДКА', `Запущен процесс (ciadpi для проверки стратегий) с стратегией: ${this.strategy} на потоке ${this.threadId}`);

            const responses = await this.checkLinks();
            const percentage = this.calculatePercentage(responses);
            const bucket = this.getBucket(percentage);

            await this.process.stop(this.threadId);
            LogModule.logMessage('ОТЛАДКА', `Остановлен процесс (ciadpi для проверки стратегий) с стратегией: ${this.strategy} на потоке ${this.threadId}`);

            return { processed: true, bucket, percentage, responses };
        } catch (error) {
            LogModule.logMessage('ОШИБКА', `Ошибка при выполнении процесса (ciadpi для проверки стратегий) с стратегией: ${this.strategy} на потоке ${this.threadId}: ${error.message}`);
            return { processed: true, bucket: null, percentage: 0, responses: [] };
        }
    }

    async ensurePortFree() {
        for (let i = 0; i < 3; i++) {
            const state = await this.process.checkPort(this.threadId);
            if (state === 'свободен') return true;
            if (state === 'используется_нашим_процессом') {
                await this.process.stop(this.threadId);
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else if (state === 'используется_другим_процессом') {
                LogModule.logMessage('ОШИБКА', `Порт (ciadpi для проверки стратегий) на потоке ${this.threadId} занят другой программой.`);
                return false;
            }
        }
        LogModule.logMessage('ОШИБКА', `Не удалось освободить порт (ciadpi для проверки стратегий) на потоке ${this.threadId}.`);
        return false;
    }

    async checkLinks() {
        const responses = [];
        for (const link of this.links) {
            const resp = await this.checker.check(this.threadId, link);
            responses.push(resp);
        }
        return responses;
    }

    calculatePercentage(responses) {
        if (!responses.length) return 0;
        const successes = responses.filter(r => r.код_ответа_http !== '000').length;
        return Math.round((successes / responses.length) * 100);
    }

    getBucket(percentage) {
        if (percentage === 100) return '100';
        const lower = Math.floor(percentage / 10) * 10;
        return `${lower}-${lower + 9}`;
    }
}

class TaskCoordinator {
    constructor() {
        this.ui = new UIController();
        this.stopped = false;
        this.processedCount = 0;
        this.buckets = {
            '0-9': 0, '10-19': 0, '20-29': 0, '30-39': 0, '40-49': 0,
            '50-59': 0, '60-69': 0, '70-79': 0, '80-89': 0, '90-99': 0, '100': 0
        };
    }

    async run() {
        try {
            this.ui.initialize();
            LogModule.logMessage('ИНФО', 'Начали проверку стратегий...');

            const strategies = InputValidator.process('generated-strategies', 'Нет стратегий для обработки.');
            const links = InputValidator.process('links', 'Нет ссылок для проверки.');
            if (!strategies || !links) {
                this.ui.finalize(true);
                return;
            }

            const threadCount = parseInt(document.getElementById('process-threads').value);
            const groups = this.splitStrategies(strategies, threadCount);

            this.ui.setTotalStrategies(strategies.length);
            this.ui.setTotalLinks(links.length);
            this.ui.setThreads(groups.length);

            const params = {
                connectionTimeout: document.getElementById('curl-connection-timeout').value,
                maxTimeout: document.getElementById('curl-max-timeout').value,
                httpMethod: document.getElementById('curl-http-method').value,
                httpVersion: document.getElementById('curl-http-version').value,
                tlsVersion: document.getElementById('curl-tls-version').value,
                userAgent: document.getElementById('curl-user-agent').value
            };

            const processController = new ProcessController(window.appConfig);
            const linkChecker = new LinkChecker(params);

            const tasks = groups.map((group, index) => {
                const threadId = index + 1;
                return this.processGroup(threadId, group, links, processController, linkChecker);
            });

            await Promise.all(tasks);
            this.ui.finalize(this.stopped);
        } catch (error) {
            LogModule.logMessage('ОШИБКА', `Ошибка: ${error.message}`);
            if (this.ui && typeof this.ui.finalize === 'function') {
                this.ui.finalize(true);
            }
        }
    }

    stop() {
        this.stopped = true;
        this.ui.setStatus('Останавливаем...');
        this.ui.disableStop();
    }

    splitStrategies(strategies, count) {
        const size = Math.ceil(strategies.length / count);
        return Array.from({ length: count }, (_, i) => strategies.slice(i * size, (i + 1) * size));
    }

    async processGroup(threadId, strategies, links, processController, linkChecker) {
        for (const strategy of strategies) {
            if (this.stopped) break;
            
            const executor = new StrategyExecutor(threadId, strategy, processController, linkChecker, links);
            const result = await executor.execute();
            
            if (result.processed) {
                this.processedCount++;
                this.ui.setProcessed(this.processedCount);
                if (result.bucket) {
                    this.buckets[result.bucket]++;
                    this.ui.updateBucket(result.bucket, this.buckets[result.bucket]);
                }
                this.ui.appendResult(this.formatResult(strategy, result.responses, result.percentage));
            }
        }
        const currentThreads = parseInt(this.ui.elements.threads.textContent);
        this.ui.setThreads(Math.max(0, currentThreads - 1));
    }

    formatResult(strategy, responses, percentage) {
        const lines = responses.map(r => {
            const color = r.результат ? 'green' : 'red';
            const message = r.результат ? 'OK' : r.сообщение;
            return `<p class="${color}">${r.код_ответа_http} - ${r.link} - ${message}</p>`;
        }).join('');
        return `<div class="result-block" data-percentage="${percentage}"><p><===</p><p class="blue">Стратегия: ${strategy}</p>${lines}<p>${percentage}%</p><p>===></p></div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    let coordinator;

    document.getElementById('process-start').addEventListener('click', () => {
        coordinator = new TaskCoordinator();
        coordinator.run();
    });

    document.getElementById('process-stop').addEventListener('click', () => {
        if (coordinator) {
            coordinator.stop();
        }
    });

    document.getElementById('select-result')?.addEventListener('change', function() {
        const selectedRange = this.value;
        const blocks = document.querySelectorAll('.result-block');

        blocks.forEach(block => {
            const percentage = parseInt(block.getAttribute('data-percentage'), 10);
            let shouldDisplay = false;

            switch (selectedRange) {
                case 'all':
                    shouldDisplay = true;
                    break;
                case 'hide':
                    shouldDisplay = false;
                    break;
                case '100':
                    shouldDisplay = percentage === 100;
                    break;
                default:
                    if (selectedRange.includes('-')) {
                        const [min, max] = selectedRange.split('-').map(Number);
                        shouldDisplay = percentage >= min && percentage <= max;
                    }
            }

            block.style.display = shouldDisplay ? 'block' : 'none';
        });
    });

    const selectResult = document.getElementById('select-result');
    if (selectResult) {
        selectResult.dispatchEvent(new Event('change'));
    }
});