async function saveDomains(server) {
    const textElement = document.getElementById(`my-server-${server}-links`);
    if (!textElement) {
        logMessage('ОШИБКА', `Элемент для сервера ${server} не найден.`);
        return;
    }

    const validDomains = [];
    const lines = textElement.value.split(/\r?\n/);
    
    for (let line of lines) {
        const trimmed = line.trim().toLowerCase();
        if (!trimmed) continue;
        
        let domain = trimmed
            .replace(/^(https?|ftp):\/\//, '')
            .split('/')[0]
            .split(':')[0]
            .split('?')[0];
     
        if (/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) {
            validDomains.push(domain);
        }
    }
    

    const uniqueDomains = [...new Set(validDomains)];
    textElement.value = uniqueDomains.join('\n');
    const data = { server, text: textElement.value };

    if (uniqueDomains.length > 0) {
        for (let otherServer = 1; otherServer <= 8; otherServer++) {
            if (otherServer === server) continue;
            
            const otherElement = document.getElementById(`my-server-${otherServer}-links`);
            if (!otherElement || !otherElement.value) continue;
            
            const otherDomains = otherElement.value.split('\n');
            for (const domain of uniqueDomains) {
                if (otherDomains.includes(domain)) {
                    logMessage('ОШИБКА', `Домен "${domain}" найден в текущем блоке и блоке сервера ${otherServer}.`);
                    return;
                }
            }
        }
    }

    try {
        const response = await fetch('save_domains.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept-Charset': 'UTF-8',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            logMessage('ОШИБКА', `Ошибка HTTP: ${response.status}`);
            return;
        }

        const result = await response.json();
        logMessage(result.status ? 'ИНФО' : 'ОШИБКА', result.message);
    } catch (error) {
        logMessage('ОШИБКА', `Ошибка при сохранении: ${error.message}`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    for (let server = 1; server <= 8; server++) {
        const button = document.getElementById(`save-domains-main-server-${server}`);
        if (button) {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                saveDomains(server);
            });
        }
    }
});