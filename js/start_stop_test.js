class DOMAccessor {
    static getElement(id) {
        const element = document.getElementById(id);
        if (!element) {
            logMessage("ОШИБКА", `Элемент с ID "${id}" не найден.`);
        }
        return element;
    }
}

class UIController {
    constructor() {
        this.elements = {
            startBtn: DOMAccessor.getElement('process-start'),
            stopBtn: DOMAccessor.getElement('process-stop'),
            status: DOMAccessor.getElement('process-status'),
            threads: DOMAccessor.getElement('current-threads-count'),
            totalLinks: DOMAccessor.getElement('total-links'),
            totalStrategies: DOMAccessor.getElement('total-strategies'),
            processed: DOMAccessor.getElement('processed-strategies-count'),
            result: DOMAccessor.getElement('result'),
            buckets: {
                '0-9': DOMAccessor.getElement('percentage-0-9'),
                '10-19': DOMAccessor.getElement('percentage-10-19'),
                '20-29': DOMAccessor.getElement('percentage-20-29'),
                '30-39': DOMAccessor.getElement('percentage-30-39'),
                '40-49': DOMAccessor.getElement('percentage-40-49'),
                '50-59': DOMAccessor.getElement('percentage-50-59'),
                '60-69': DOMAccessor.getElement('percentage-60-69'),
                '70-79': DOMAccessor.getElement('percentage-70-79'),
                '80-89': DOMAccessor.getElement('percentage-80-89'),
                '90-99': DOMAccessor.getElement('percentage-90-99'),
                '100': DOMAccessor.getElement('percentage-100')
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

    appendResult(html) {
        const resultElement = this.elements.result;
        if (!resultElement) return;

        const wasScrolledToBottom =
            resultElement.scrollHeight - resultElement.clientHeight <= resultElement.scrollTop + 1;

        resultElement.insertAdjacentHTML('beforeend', html);

        const last = resultElement.lastElementChild;
        if (last && typeof this.shouldDisplayBlock === 'function') {
            const range = DOMAccessor.getElement('select-result').value;
            last.style.display = this.shouldDisplayBlock(last, range) ? 'block' : 'none';
        }

        if (wasScrolledToBottom) {
            resultElement.scrollTop = resultElement.scrollHeight;
        }
    }

    shouldDisplayBlock(block, selectedRange) {
        const percentage = parseInt(block.getAttribute('data-percentage'), 10);
        switch (selectedRange) {
            case 'all': return true;
            case 'hide': return false;
            case '0-9': return percentage >= 0 && percentage <= 9;
            case '10-19': return percentage >= 10 && percentage <= 19;
            case '20-29': return percentage >= 20 && percentage <= 29;
            case '30-39': return percentage >= 30 && percentage <= 39;
            case '40-49': return percentage >= 40 && percentage <= 49;
            case '50-59': return percentage >= 50 && percentage <= 59;
            case '60-69': return percentage >= 60 && percentage <= 69;
            case '70-79': return percentage >= 70 && percentage <= 79;
            case '80-89': return percentage >= 80 && percentage <= 89;
            case '90-99': return percentage >= 90 && percentage <= 99;
            case '100': return percentage === 100;
            default: return false;
        }
    }

    filterResults() {
        const select = document.getElementById('select-result');
        const selectedRange = select.value;
        const blocks = document.querySelectorAll('.result-block');
        blocks.forEach(block => {
            const shouldDisplay = this.shouldDisplayBlock(block, selectedRange);
            block.style.display = shouldDisplay ? 'block' : 'none';
        });
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
        const el = DOMAccessor.getElement(id);
        if (!el) return null;
        const text = 'value' in el ? el.value : el.textContent;
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);
        if (!lines.length) {
            logMessage("ОШИБКА", errorMsg);
            return null;
        }
        const cleanText = lines.join('\n');
        'value' in el ? (el.value = cleanText) : (el.textContent = cleanText);
        return lines;
    }
}

class ProcessController {
    constructor(config) {
        this.config = config;
        this.api = config.os.detected_os === 'windows' ? 'windows.php' : 'linux.php';
    }

    async checkPort(threadId) {
        const port = this.config.config.ciadpi_test_servers_tcp_ports[`thread_${threadId}`];
        const response = await this.request({ action: 'check', port });

        if (!response.status) {
            logMessage("ОШИБКА", `Поток ${threadId}: ${response.message}`);
            return 'error';
        }

        switch (response.data.state) {
            case 'free': return 'free';
            case 'in_use_by_us': return 'ours';
            case 'in_use_by_others': return 'others';
            default:
                logMessage("ОШИБКА", `Поток ${threadId}: Неизвестное состояние порта.`);
                return 'error';
        }
    }

    async start(threadId, strategy) {
        const port = this.config.config.ciadpi_test_servers_tcp_ports[`thread_${threadId}`];
        const response = await this.request({
            action: 'check_and_start',
            port,
            arguments: strategy
        });

        return {
            status: response.status,
            message: response.message
        };
    }

    async stop(threadId) {
        const port = this.config.config.ciadpi_test_servers_tcp_ports[`thread_${threadId}`];
        const response = await this.request({ action: 'check_and_kill', port });

        return {
            status: response.status,
            message: response.message
        };
    }

    async request(body) {
        body.real_file_path = this.config.files.ciadpi_file.filepath;

        try {
            const resp = await fetch(this.api, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (resp.ok) {
                const data = await resp.json();
                return {
                    status: data.result,
                    message: data.message,
                    data: data
                };
            } else {
                const text = await resp.text();
                let errorMessage = `Ошибка сервера: ${resp.status}`;

                if (text.includes("Maximum execution time") ||
				    text.includes("maximum execution time") ||
                    text.includes("Max execution time") ||
                    text.includes("max_execution_time")) {
                    errorMessage = "Превышено время выполнения скрипта!";
                } else if (text.length < 100) {
                    errorMessage += ` - ${text}`;
                }

                return {
                    status: false,
                    message: errorMessage,
                    data: null
                };
            }
        } catch (e) {
            return {
                status: false,
                message: `Ошибка запроса: ${e.message}`,
                data: null
            };
        }
    }
}

class LinkChecker {
    constructor(config, params) {
        this.config = config;
        this.params = params;
    }

    async check(threadId, link, signal) {
        const port = this.config.config.ciadpi_test_servers_tcp_ports[`thread_${threadId}`];
        const body = {
            socks5_server_port: port,
            curl_connection_timeout: this.params.connectionTimeout,
            curl_max_timeout: this.params.maxTimeout,
            curl_http_method: this.params.httpMethod,
            curl_http_version: this.params.httpVersion,
            curl_user_agent: this.params.userAgent,
            link
        };
        try {
            const resp = await fetch('curl.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal
            });
            if (!resp.ok) return { result: false, message: `HTTP ошибка: ${resp.status}`, http_response_code: '000', link };
            const data = await resp.json();
            return { ...data, link };
        } catch (e) {
            return { result: false, message: e.message, http_response_code: '000', link };
        }
    }
}

class StrategyExecutor {
    constructor(threadId, strategy, config, ui, links, checker) {
        this.threadId = threadId;
        this.strategy = strategy;
        this.process = new ProcessController(config);
        this.ui = ui;
        this.links = [...links];
        this.checker = checker;
        this.signal = new AbortController().signal;
    }

    async ensurePortFree() {
        for (let i = 0; i < 3; i++) {
            const state = await this.process.checkPort(this.threadId);

            if (state === 'free') return true;

            if (state === 'ours') {
                const stop = await this.process.stop(this.threadId);
                if (stop.status) {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                logMessage("ОШИБКА", `Поток ${this.threadId}: Не удалось остановить процесс - ${stop.message}`);
            }
            else if (state === 'others') {
                logMessage("ОШИБКА", `Поток ${this.threadId}: Порт занят другой программой.`);
                return false;
            }
            else if (state === 'error') {
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
        }
        logMessage("ОШИБКА", `Поток ${this.threadId}: Не удалось освободить порт после попыток.`);
        return false;
    }

    async execute() {
        if (!(await this.ensurePortFree())) {
            this.ui.appendResult(this.formatResult('Не удалось подготовить порт', [], 0));
            return { processed: true, bucket: null };
        }

        const start = await this.process.start(this.threadId, this.strategy);
        if (!start.status) {
            logMessage("ОШИБКА", `Не удалось запустить поток ${this.threadId} на порту ${this.process.config.config.ciadpi_test_servers_tcp_ports[`thread_${this.threadId}`]} с стратегией: ${this.strategy}`);
            this.ui.appendResult(this.formatResult(`Ошибка запуска: ${start.message}`, [], 0));
            return { processed: true, bucket: null };
        }

        logMessage("ОТЛАДКА", `Запущен поток ${this.threadId} на порту ${this.process.config.config.ciadpi_test_servers_tcp_ports[`thread_${this.threadId}`]} с стратегией: ${this.strategy}`);

        const responses = await this.checkLinks();
        const percentage = this.calculatePercentage(responses);
        const bucket = this.getBucket(percentage);

        const stop = await this.process.stop(this.threadId);
        const status = stop.status ? 'Остановлен' : `Не удалось остановить: ${stop.message}`;
        this.ui.appendResult(this.formatResult(status, responses, percentage));

        return { processed: true, bucket: stop.status ? bucket : null };
    }

    async checkLinks() {
        this.shuffleLinks();
        const responses = [];
        for (const link of this.links) {
            const resp = await this.checker.check(this.threadId, link, this.signal);
            responses.push(resp);
        }
        return responses;
    }

    shuffleLinks() {
        for (let i = this.links.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.links[i], this.links[j]] = [this.links[j], this.links[i]];
        }
    }

    calculatePercentage(responses) {
        if (!responses.length) return 0;
        const successes = responses.filter(r => r.http_response_code !== '000').length;
        return Math.round((successes / responses.length) * 100);
    }

    getBucket(percentage) {
        return percentage === 100 ? '100' : `${Math.floor(percentage / 10) * 10}-${Math.floor(percentage / 10) * 10 + 9}`;
    }

    formatResult(status, responses, percentage) {
        const lines = responses.map(r => `<p class="${r.http_response_code !== '000' ? 'green' : 'red'}">${r.http_response_code} - ${r.link} - ${r.message}</p>`).join('');
        return `<div class="result-block" data-percentage="${percentage}"><p><===</p><p>Запущен</p><p class="blue">Стратегия: ${this.strategy}</p>${lines}<p>${percentage}%</p><p>${status}</p><p>===></p></div>`;
    }
}

class TaskCoordinator {
    constructor(config) {
        this.config = config;
        this.ui = new UIController();
        this.stopped = false;
        this.abort = new AbortController();
        this.processedCount = 0;
        this.buckets = {
            '0-9': 0, '10-19': 0, '20-29': 0, '30-39': 0, '40-49': 0,
            '50-59': 0, '60-69': 0, '70-79': 0, '80-89': 0, '90-99': 0, '100': 0
        };
    }

    setServerButtonsState(disabled) {
        for (let i = 1; i <= 8; i++) {
            const startBtn = document.getElementById(`start-main-server-${i}`);
            const stopBtn = document.getElementById(`stop-main-server-${i}`);
            if (startBtn) startBtn.disabled = disabled;
            if (stopBtn) stopBtn.disabled = disabled;
        }
    }

    async run() {
        try {
            this.setServerButtonsState(true);

            this.ui.initialize();
            logMessage("ИНФО", "Начали проверку стратегий...");

            const strategies = InputValidator.process('generated-strategies', 'Нет стратегий для обработки.');
            const links = InputValidator.process('links', 'Нет ссылок для проверки.');
            if (!strategies || !links) {
                this.ui.finalize(true);
                logMessage("ИНФО", "Проверка стратегий остановлена.");
                return;
            }

            this.ui.setTotalStrategies(strategies.length);
            this.ui.setTotalLinks(links.length);

            const threadCount = Math.min(parseInt(DOMAccessor.getElement('process-threads').value), strategies.length);
            const groups = this.splitStrategies(strategies, threadCount);
            this.ui.setThreads(groups.length);

            const checker = new LinkChecker(this.config, {
                connectionTimeout: DOMAccessor.getElement('curl-connection-timeout').value,
                maxTimeout: DOMAccessor.getElement('curl-max-timeout').value,
                httpMethod: DOMAccessor.getElement('curl-http-method').value,
                httpVersion: DOMAccessor.getElement('curl-http-version').value,
                userAgent: DOMAccessor.getElement('curl-user-agent').value
            });

            const tasks = groups.map((cmds, idx) => this.processGroup(idx + 1, cmds, links, checker));
            await Promise.all(tasks);
            this.ui.finalize(this.stopped);
            logMessage("ИНФО", this.stopped ? "Проверка стратегий остановлена." : "Проверка стратегий завершена.");
        } catch (e) {
            logMessage("ОШИБКА", `Непредвиденная ошибка: ${e.message}`);
            this.ui.finalize(true);
        } finally {
            this.setServerButtonsState(false);
        }
    }

    stop() {
        logMessage("ИНФО", "Останавливаем проверку стратегий...");
        this.stopped = true;
        this.abort.abort();
        this.ui.setStatus('Останавливаем...');
        this.ui.disableStop();
    }

    splitStrategies(strategies, count) {
        const size = Math.ceil(strategies.length / count);
        return Array.from({ length: count }, (_, i) => {
            const start = i * size;
            return strategies.slice(start, Math.min(start + size, strategies.length));
        }).filter(group => group.length);
    }

    async processGroup(threadId, strategies, links, checker) {
        for (const cmd of strategies) {
            if (this.stopped) break;
            const executor = new StrategyExecutor(threadId, cmd, this.config, this.ui, links, checker);
            const { processed, bucket } = await executor.execute();
            if (processed) {
                this.processedCount++;
                this.ui.setProcessed(this.processedCount);
            }
            if (bucket) {
                this.buckets[bucket]++;
                this.ui.updateBucket(bucket, this.buckets[bucket]);
            }
        }
        const current = parseInt(this.ui.elements.threads.textContent);
        this.ui.setThreads(Math.max(0, current - 1));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    let coordinator;
    document.addEventListener('appDataReady', () => {
        DOMAccessor.getElement('process-start').addEventListener('click', () => {
            coordinator = new TaskCoordinator(window.appData);
            coordinator.run();
        });

        DOMAccessor.getElement('process-stop').addEventListener('click', () => {
            if (coordinator) coordinator.stop();
        });

        const selectResult = DOMAccessor.getElement('select-result');
        if (selectResult) {
            selectResult.addEventListener('change', () => {
                const ui = new UIController();
                ui.filterResults();
            });
        }
    });
});