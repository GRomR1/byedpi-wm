//8_default_select_links.js
class DefaultSelectLinks {
    static init() {
        try {
            const button = document.getElementById('add-links');
            if (!button) {
                throw new Error('Элемент #add-links не найден');
            }
            
            button.addEventListener('click', this.handleAddLinks.bind(this));
        } catch (error) {
            LogModule.logMessage('ОШИБКА', `Ошибка: ${error.message}`);
        }
    }

    static handleAddLinks() {
        try {
            const selectElement = this.getValidatedElement('select-links', 'select');
            const linksTextarea = this.getValidatedElement('links', 'textarea');
            
            const selectedGroup = this.getSelectedGroup(selectElement);
            const links = this.getGroupLinks(selectedGroup);
            
            this.addLinksToTextarea(linksTextarea, links, selectedGroup);
            
        } catch (error) {
            LogModule.logMessage('ОШИБКА', error.message);
        }
    }

    static getValidatedElement(elementId, expectedType) {
        const element = document.getElementById(elementId);
        
        if (!element) {
            throw new Error(`Элемент #${elementId} не найден`);
        }
        
        if (expectedType && element.tagName.toLowerCase() !== expectedType) {
            throw new Error(`Элемент #${elementId} не является ${expectedType}`);
        }
        
        return element;
    }

    static getSelectedGroup(selectElement) {
        const selectedGroup = selectElement.value;
        
        if (!selectedGroup) {
            throw new Error('Не выбрана группа ссылок по умолчанию');
        }
        
        return selectedGroup;
    }

    static getGroupLinks(groupName) {
        if (!window.appConfig || typeof window.appConfig !== 'object') {
            throw new Error('Конфигурация приложения не загружена');
        }
        
        const links = window.appConfig.ссылки_по_умолчанию_для_проверки?.[groupName];
        
        if (!Array.isArray(links)) {
            throw new Error(`Для группы "${groupName}" нет данных о ссылках по умолчанию`);
        }
        
        if (links.length === 0) {
            throw new Error(`Группа "${groupName}" не содержит ссылок по умолчанию`);
        }
        
        return links;
    }

    static addLinksToTextarea(textarea, links, groupName) {
        const currentValue = textarea.value.trim();
        const newLinks = links.join('\n');
        const separator = currentValue ? '\n' : '';
        
        textarea.value = currentValue + separator + newLinks;
        
        textarea.scrollTop = textarea.scrollHeight;
        
        LogModule.logMessage('ИНФО', `Добавлено ${links.length} ссылок по умолчанию из группы "${groupName}"`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    DefaultSelectLinks.init();
});