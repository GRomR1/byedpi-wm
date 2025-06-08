//5_copy.js
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
        const button = document.getElementById(buttonId);
        if (!button) return;

        button.addEventListener('click', () => {
            const target = document.getElementById(targetId);
            if (!target) {
                LogModule.logMessage('ОШИБКА', `Элемент ${targetId} не найден.`);
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
      const trimmed = line.trim();
      if (!trimmed) return null;

      const urlStr = trimmed.includes('://') 
        ? trimmed 
        : `https://${trimmed}`;

      try {
        const url = new URL(urlStr);
        return url.hostname.replace(/:\d+$/, '');
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
            LogModule.logMessage('ОШИБКА', `Ошибка копирования: ${error.message}.`);
        }
    }

    static copyToClipboard(text) {
        if (!text) {
            LogModule.logMessage('ИНФО', 'Нечего копировать.');
            return;
        }

        if (navigator.clipboard) {
            navigator.clipboard.writeText(text)
                .then(() => LogModule.logMessage('ИНФО', 'Скопировано.'))
                .catch(err => {
                    LogModule.logMessage('ОШИБКА', `Ошибка копирования: ${err}.`);
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
            LogModule.logMessage('ИНФО', 'Скопировано.');
        } catch (err) {
            LogModule.logMessage('ОШИБКА', 'Не удалось скопировать.');
        } finally {
            document.body.removeChild(textarea);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    CopyManager.init();
});