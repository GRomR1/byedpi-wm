class ServerBase {
  constructor(serverNumber) {
    this.serverNumber = serverNumber;
    this.startButtonId = `start-main-server-${serverNumber}`;
    this.stopButtonId = `stop-main-server-${serverNumber}`;
    this.strategyInputId = `my-server-${serverNumber}-strategy`;
    this.hostSelectId = `select-use-domains-list-or-not-${serverNumber}`;
    this.hostLinksId = `my-server-${serverNumber}-links`;
    this.currentStrategy = null;
  }

  getServerConfig() {
    return {
      processFile: this.getProcessFile(),
      ciadpiPath: window.appData?.files?.ciadpi_file?.filepath,
      port: window.appData?.config?.ciadpi_main_servers_tcp_ports?.[`main_${this.serverNumber}`]
    };
  }

  getProcessFile() {
    const osType = window.appData?.os?.detected_os;
    if (osType === "windows") {
      return window.appData?.files?.windows_file?.filename;
    } else if (osType === "linux") {
      return window.appData?.files?.linux_file?.filename;
    }
    return null;
  }

  validateConfig(processFile, ciadpiPath, port) {
    const errors = [];
    if (!processFile) errors.push('файл обработки');
    if (!ciadpiPath) errors.push('путь к ciadpi');
    if (!port) errors.push('порт');

    if (errors.length > 0) {
      logMessage('ОШИБКА', `(ByeDPI для использования ${this.serverNumber}) -> Отсутствует: ${errors.join(', ')}`);
      return false;
    }
    return true;
  }

  toggleButtons(success) {
    const startButton = document.getElementById(this.startButtonId);
    const stopButton = document.getElementById(this.stopButtonId);
    const strategyInput = document.getElementById(this.strategyInputId);
    const hostSelect = document.getElementById(this.hostSelectId);

    if (startButton) {
      startButton.hidden = success;
      startButton.disabled = false;
      startButton.classList.remove('disabled');
    }
    if (stopButton) {
      stopButton.hidden = !success;
      stopButton.disabled = false;
      stopButton.classList.remove('disabled');
    }

    if (strategyInput) {
      strategyInput.disabled = success;
    }
    if (hostSelect) {
      hostSelect.disabled = success;
    }
  }

  async sendRequest(url, postData) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const response = await fetch(url, {
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
      this.handleRequestError(error);
      throw error;
    }
  }

  handleRequestError(error) {
    const errorMessage = error.name === 'AbortError' 
      ? 'Сработал таймаут' 
      : error.message;
    
    logMessage('ОШИБКА', `(ByeDPI для использования ${this.serverNumber}) -> Ошибка: ${errorMessage}`);
  }
}

class ServerStarter extends ServerBase {
  async handleStart() {
    const startButton = document.getElementById(this.startButtonId);
    if (startButton) {
      startButton.disabled = true;
      startButton.classList.add('disabled');
    }

    try {
      const strategy = this.getSanitizedStrategy();
      if (!this.validateStrategy(strategy)) return;
      
      if (this.shouldUseHosts() && !this.validateHosts()) {
        logMessage('ОШИБКА', `(ByeDPI для использования ${this.serverNumber}) -> Запуск невозможен: хост лист пустой.`);
        return;
      }

      this.currentStrategy = strategy;
      const { processFile, ciadpiPath, port } = this.getServerConfig();
      if (!this.validateConfig(processFile, ciadpiPath, port)) return;

      const postData = this.buildPostData(strategy, port, ciadpiPath);
      const response = await this.sendRequest(processFile, postData);
      await this.handleResponse(response);
    } finally {
      if (startButton) {
        startButton.disabled = false;
        startButton.classList.remove('disabled');
      }
    }
  }

  shouldUseHosts() {
    const hostSelect = document.getElementById(this.hostSelectId);
    return hostSelect && hostSelect.value === 'true';
  }

  validateHosts() {
    const hostLinksElement = document.getElementById(this.hostLinksId);
    return hostLinksElement?.value?.trim().length > 0;
  }

  buildPostData(strategy, port, ciadpiPath) {
    const postData = {
      action: "check_and_start",
      real_file_path: ciadpiPath,
      port: port,
      arguments: strategy
    };

    if (this.shouldUseHosts()) {
      const hostsFileKey = `main_server_${this.serverNumber}_hosts_file`;
      const hostsFilePath = window.appData?.files?.main_server_hosts?.[hostsFileKey]?.filepath;
      
      if (hostsFilePath) {
        postData.hosts_file_name = hostsFilePath;
      } else {
        logMessage('ОШИБКА', `Файл хостов для сервера ${this.serverNumber} не найден.`);
      }
    }

    return postData;
  }

  async handleResponse(response) {
    if (!response.ok) {
      logMessage('ОШИБКА', `HTTP ошибка: ${response.status}`);
      return;
    }

    const data = await response.json();
    if (data.result === true) {
      this.handleSuccess();
      this.saveSuccessfulStrategy();
    } else {
      this.handleFailure(data.message);
    }
  }

  handleSuccess() {
    logMessage('ИНФО', `(ByeDPI для использования ${this.serverNumber}) запустился.`);
    this.toggleButtons(true);
  }

  handleFailure(message) {
    logMessage('ОШИБКА', `(ByeDPI для использования ${this.serverNumber}) запуск не удался: ${message || 'Неизвестная ошибка'}`);
    this.toggleButtons(false);
  }

  getSanitizedStrategy() {
    const strategyInput = document.getElementById(this.strategyInputId);
    return strategyInput?.value?.trim() || '';
  }

  validateStrategy(strategy) {
    if (!strategy) {
      logMessage('ОШИБКА', `(ByeDPI для использования ${this.serverNumber}) Стратегия не введена.`);
      return false;
    }
    return true;
  }

  async saveSuccessfulStrategy() {
    if (!this.currentStrategy) return;

    try {    
      const response = await fetch('save_latest_used_strategies.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          server: this.serverNumber,
          strategy: this.currentStrategy
        })
      });

      const data = await response.json();
      if (data.result) {
        logMessage('ИНФО', data.message || 'Стратегия сохранена');
      } else {
        logMessage('ОШИБКА', `Ошибка сохранения: ${data.message || 'неизвестная ошибка'}`);
      }
    } catch (error) {
      logMessage('ОШИБКА', `Сетевая ошибка: ${error.message}`);
    }
  }
}

class ServerStopper extends ServerBase {
  async handleStop() {
    const stopButton = document.getElementById(this.stopButtonId);
    if (stopButton) {
      stopButton.disabled = true;
      stopButton.classList.add('disabled');
    }

    try {
      const { processFile, ciadpiPath, port } = this.getServerConfig();
      if (!this.validateConfig(processFile, ciadpiPath, port)) return;

      const postData = this.buildPostData(ciadpiPath, port);
      const response = await this.sendRequest(processFile, postData);
      await this.handleResponse(response);
    } finally {
      if (stopButton) {
        stopButton.disabled = false;
        stopButton.classList.remove('disabled');
      }
    }
  }

  buildPostData(ciadpiPath, port) {
    return {
      action: "check_and_kill",
      real_file_path: ciadpiPath,
      port: port
    };
  }

  async handleResponse(response) {
    if (!response.ok) {
      logMessage('ОШИБКА', `HTTP ошибка: ${response.status}`);
      return;
    }

    const data = await response.json();
    if (data.result === true) {
      this.handleSuccess();
    } else {
      this.handleFailure(data.message);
    }
  }

  handleSuccess() {
    logMessage('ИНФО', `(ByeDPI для использования ${this.serverNumber}) остановлен.`);
    this.toggleButtons(false);
  }

  handleFailure(message) {
    logMessage('ОШИБКА', `(ByeDPI для использования ${this.serverNumber}) остановка не удалась: ${message || 'Неизвестная ошибка'}`);
    this.toggleButtons(true);
  }
}

function initializeServerControllers() {
  for (let i = 1; i <= 8; i++) {
    const starter = new ServerStarter(i);
    const stopper = new ServerStopper(i);
    
    document.getElementById(starter.startButtonId)?.addEventListener('click', () => starter.handleStart());
    document.getElementById(stopper.stopButtonId)?.addEventListener('click', () => stopper.handleStop());
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('start-main-server-1')) {
    initializeServerControllers();
  }
});