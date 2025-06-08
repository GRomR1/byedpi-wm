//4_generate.js
const parameters = [
    { id: 'buf-size', weightId: 'gen-buf-size-weight', valueId: 'gen-buf-size-value', validator: validateBufSize, endOfString: true },
    { id: 'def-ttl', weightId: 'gen-def-ttl-weight', valueId: 'gen-def-ttl-value', validator: validateDefTtl, endOfString: true },
    { id: 'tfo', weightId: 'gen-tfo-weight', endOfString: true },
    { id: 'mod-http', weightId: 'gen-mod-http-weight', valueId: 'gen-mod-http-value', endOfString: true },
    { id: 'drop-sack', weightId: 'gen-drop-sack-weight', endOfString: true },
    { id: 'split', weightId: 'gen-split-weight', isDesync: true, modifiable: true },
    { id: 'disorder', weightId: 'gen-disorder-weight', isDesync: true, modifiable: true },
    { id: 'oob', weightId: 'gen-oob-weight', isDesync: true, modifiable: true, hasAddons: ['oob-data'] },
    { id: 'disoob', weightId: 'gen-disoob-weight', isDesync: true, modifiable: true, hasAddons: ['oob-data'] },
    { id: 'tlsrec', weightId: 'gen-tlsrec-weight', isDesync: true, modifiable: true },
    { id: 'fake', weightId: 'gen-fake-weight', isDesync: true, modifiable: true, hasAddons: ['fake-offset', 'md5sig', 'ttl', 'fake-data', 'fake-sni', 'fake-tls-mod'] },
    { id: 'fake-offset', weightId: 'gen-fake-offset-weight', modifiable: true },
    { id: 'md5sig', weightId: 'gen-md5sig-weight' },
    { id: 'ttl', weightId: 'gen-ttl-weight', valueId: 'gen-ttl-value', validator: validateTtl },
    { id: 'fake-data', weightId: 'gen-fake-data-weight', valueId: 'gen-fake-data-value', validator: validateFakeData },
    { id: 'fake-sni', weightId: 'gen-fake-sni-weight', valueId: 'gen-fake-sni-value', validator: validateFakeSni },
    { id: 'fake-tls-mod', weightId: 'gen-fake-tls-mod-weight', valueId: 'gen-fake-tls-mod-value' },
    { id: 'oob-data', weightId: 'gen-oob-data-weight', valueId: 'gen-oob-data-value', validator: validateOobData },
];

const modifiers = [
    { id: 'empty', weightId: 'gen-weight', flag: '', offsetFromId: 'gen-offset-from-value', offsetToId: 'gen-offset-to-value', repeatFromId: 'gen-repeat-from-value', repeatToId: 'gen-repeat-to-value', skipFromId: 'gen-skip-from-value', skipToId: 'gen-skip-to-value' },
    { id: 'n', weightId: 'gen-n-weight', flag: '+n', offsetFromId: 'gen-n-offset-from-value', offsetToId: 'gen-n-offset-to-value', repeatFromId: 'gen-n-repeat-from-value', repeatToId: 'gen-n-repeat-to-value', skipFromId: 'gen-n-skip-from-value', skipToId: 'gen-n-skip-to-value' },
    { id: 'nm', weightId: 'gen-nm-weight', flag: '+nm', offsetFromId: 'gen-nm-offset-from-value', offsetToId: 'gen-nm-offset-to-value', repeatFromId: 'gen-nm-repeat-from-value', repeatToId: 'gen-nm-repeat-to-value', skipFromId: 'gen-nm-skip-from-value', skipToId: 'gen-nm-skip-to-value' },
    { id: 'ne', weightId: 'gen-ne-weight', flag: '+ne', offsetFromId: 'gen-ne-offset-from-value', offsetToId: 'gen-ne-offset-to-value', repeatFromId: 'gen-ne-repeat-from-value', repeatToId: 'gen-ne-repeat-to-value', skipFromId: 'gen-ne-skip-from-value', skipToId: 'gen-ne-skip-to-value' },
    { id: 's', weightId: 'gen-s-weight', flag: '+s', offsetFromId: 'gen-s-offset-from-value', offsetToId: 'gen-s-offset-to-value', repeatFromId: 'gen-s-repeat-from-value', repeatToId: 'gen-s-repeat-to-value', skipFromId: 'gen-s-skip-from-value', skipToId: 'gen-s-skip-to-value' },
    { id: 'sm', weightId: 'gen-sm-weight', flag: '+sm', offsetFromId: 'gen-sm-offset-from-value', offsetToId: 'gen-sm-offset-to-value', repeatFromId: 'gen-sm-repeat-from-value', repeatToId: 'gen-sm-repeat-to-value', skipFromId: 'gen-sm-skip-from-value', skipToId: 'gen-sm-skip-to-value' },
    { id: 'se', weightId: 'gen-se-weight', flag: '+se', offsetFromId: 'gen-se-offset-from-value', offsetToId: 'gen-se-offset-to-value', repeatFromId: 'gen-se-repeat-from-value', repeatToId: 'gen-se-repeat-to-value', skipFromId: 'gen-se-skip-from-value', skipToId: 'gen-se-skip-to-value' },
    { id: 'h', weightId: 'gen-h-weight', flag: '+h', offsetFromId: 'gen-h-offset-from-value', offsetToId: 'gen-h-offset-to-value', repeatFromId: 'gen-h-repeat-from-value', repeatToId: 'gen-h-repeat-to-value', skipFromId: 'gen-h-skip-from-value', skipToId: 'gen-h-skip-to-value' },
    { id: 'hm', weightId: 'gen-hm-weight', flag: '+hm', offsetFromId: 'gen-hm-offset-from-value', offsetToId: 'gen-hm-offset-to-value', repeatFromId: 'gen-hm-repeat-from-value', repeatToId: 'gen-hm-repeat-to-value', skipFromId: 'gen-hm-skip-from-value', skipToId: 'gen-hm-skip-to-value' },
    { id: 'he', weightId: 'gen-he-weight', flag: '+he', offsetFromId: 'gen-he-offset-from-value', offsetToId: 'gen-he-offset-to-value', repeatFromId: 'gen-he-repeat-from-value', repeatToId: 'gen-he-repeat-to-value', skipFromId: 'gen-he-skip-from-value', skipToId: 'gen-he-skip-to-value' },
];

const getValue = (id) => document.getElementById(id)?.value || '';
const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const weightedRandomChoice = (items) => {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight === 0) return null;
    let random = Math.random() * totalWeight;
    for (const item of items) {
        random -= item.weight;
        if (random <= 0) return item;
    }
    return items[items.length - 1];
};

function validateBufSize(value) {
    const DEFAULT_BUFFER_SIZE = 16384;
    const MIN_SIZE = 1;
    const MAX_SIZE = 131072;

    const trimmedValue = String(value || '').trim();
    if (!trimmedValue) return DEFAULT_BUFFER_SIZE;

    const number = parseInt(trimmedValue, 10);
    if (isNaN(number)) return DEFAULT_BUFFER_SIZE;

    return number >= MIN_SIZE && number <= MAX_SIZE ? number : DEFAULT_BUFFER_SIZE;
}

function validateDefTtl(value) {
    const DEFAULT_TTL = 64;
    const MIN_TTL = 1;
    const MAX_TTL = 255;

    const trimmedValue = String(value || '').trim();
    if (!trimmedValue) return DEFAULT_TTL;

    const number = parseInt(trimmedValue, 10);
    if (isNaN(number)) return DEFAULT_TTL;

    return number >= MIN_TTL && number <= MAX_TTL ? number : DEFAULT_TTL;
}

function validateTtl(value) {
    const DEFAULT_TTL = 64;
    const MIN_TTL = 1;
    const MAX_TTL = 255;

    const trimmedValue = String(value || '').trim();
    if (!trimmedValue) return DEFAULT_TTL;

    const number = parseInt(trimmedValue, 10);
    if (isNaN(number)) return DEFAULT_TTL;

    return number >= MIN_TTL && number <= MAX_TTL ? number : DEFAULT_TTL;
}

function validateOobData(value) {
    const DEFAULT_VALUE = 'a';
    const VALID_PATTERN = /^(?:\\.|.)$/;
    const ESCAPE_FORMATS = {
        'n': true, '0': true,
        'x': /^x[\da-fA-F]{2}$/,
        '0x': /^0x[\da-fA-F]{2}$/
    };

    const strValue = String(value ?? '').trim();
    if (!strValue) return DEFAULT_VALUE;

    if (strValue.length === 1) {
        return strValue.charCodeAt(0) <= 127 ? strValue : DEFAULT_VALUE;
    }

    const [prefix, ...rest] = strValue.slice(1).split('');
    const fullCode = rest.join('');

    return (
        strValue.startsWith('\\') &&
        (
            (ESCAPE_FORMATS[prefix] && !rest.length) ||
            (prefix === 'x' && ESCAPE_FORMATS.x.test(fullCode)) ||
            (prefix === '0' && rest[0] === 'x' && ESCAPE_FORMATS['0x'].test(rest.slice(1).join('')))
        ) ? strValue : DEFAULT_VALUE);
}

function validateFakeData(value) {
    const DEFAULT_VALUE = '\x6D\x69\x63';
    const VALID_ESCAPE = /^(?:\\n|\\0|\\x[\da-fA-F]{2}|\\0x[\da-fA-F]{2}|[^\\])+$/;

    const strValue = String(value ?? '').trim();
    if (!strValue) return DEFAULT_VALUE;

    return VALID_ESCAPE.test(strValue) &&
           !/\\[^n0x]/.test(strValue) &&
           !/\\x[^0-9a-fA-F]|\\0x[^0-9a-fA-F]/.test(strValue)
           ? strValue
           : DEFAULT_VALUE;
}

function validateFakeSni(value) {
    const DEFAULT_DOMAIN = 'microsoft.com';
    const DOMAIN_REGEX = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

    const trimmed = String(value ?? '').trim().toLowerCase();
    if (!trimmed) return DEFAULT_DOMAIN;

    return DOMAIN_REGEX.test(trimmed) ? trimmed : DEFAULT_DOMAIN;
}

function validateDesyncParameters() {
    return parameters.some(param => param.isDesync && parseInt(getValue(param.weightId), 10) > 0);
}

function validateModifiers() {
    return modifiers.some(mod => parseInt(getValue(mod.weightId), 10) > 0);
}

function generateModifier(modifier, modificatorChoice) {
    const weight = parseInt(getValue(modifier.weightId), 10);
    if (weight === 0) return null;

    const offsetFrom = parseInt(getValue(modifier.offsetFromId), 10);
    const offsetTo = parseInt(getValue(modifier.offsetToId), 10);
    const repeatFrom = parseInt(getValue(modifier.repeatFromId), 10);
    const repeatTo = parseInt(getValue(modifier.repeatToId), 10);
    const skipFrom = parseInt(getValue(modifier.skipFromId), 10);
    const skipTo = parseInt(getValue(modifier.skipToId), 10);

    const offsetMin = Math.min(offsetFrom, offsetTo);
    const offsetMax = Math.max(offsetFrom, offsetTo);
    const repeatMin = Math.min(repeatFrom, repeatTo);
    const repeatMax = Math.max(repeatFrom, repeatTo);
    const skipMin = Math.min(skipFrom, skipTo);
    const skipMax = Math.max(skipFrom, skipTo);

    let offset = getRandomInt(offsetMin, offsetMax);

    if (modifier.id === 'empty') {
        if (modificatorChoice === 'offset-and-flag') {
            return `${offset}`;
        } else if (modificatorChoice === 'complex-and-flag') {
            const repeat = getRandomInt(repeatMin, repeatMax);
            const skip = getRandomInt(skipMin, skipMax);
            return `${offset}:${repeat}:${skip}`;
        }
    }

    if (modificatorChoice === 'offset-and-flag') {
        return `${offset}${modifier.flag}`;
    } else if (modificatorChoice === 'complex-and-flag') {
        const repeat = getRandomInt(repeatMin, repeatMax);
        const skip = getRandomInt(skipMin, skipMax);
        return `${offset}:${repeat}:${skip}${modifier.flag}`;
    }
    
    return null;
}

function generateParameterStrategy(param, modificatorChoice, isDesyncInstance = false) {
    const weight = parseInt(getValue(param.weightId), 10);
    if (weight === 0) return null;

    let strategy = `--${param.id}`;
    if (param.valueId) {
        let value = getValue(param.valueId);
        if (param.validator) value = param.validator(value);
        if (param.id === 'fake-data') value = ':' + value;
        strategy += ` ${value}`;
    }

    if (param.modifiable) {
        const availableModifiers = modifiers.map(mod => ({ ...mod, weight: parseInt(getValue(mod.weightId), 10) }));
        const modifier = weightedRandomChoice(availableModifiers);
        if (modifier) {
            const modString = generateModifier(modifier, modificatorChoice);
            if (modString) strategy += ` ${modString}`;
        }
    }

    if (isDesyncInstance && param.hasAddons) {
        const addons = parameters.filter(p => param.hasAddons.includes(p.id)).map(addon => ({
            ...addon,
            weight: parseInt(getValue(addon.weightId), 10)
        }));
        const selectedAddons = addons.filter(addon => addon.weight > 0 && Math.random() < addon.weight * 0.1);
        for (const addon of selectedAddons) {
            const addonStrategy = generateParameterStrategy(addon, modificatorChoice, false);
            if (addonStrategy) strategy += ` ${addonStrategy}`;
        }
    }

    return strategy;
}

function generateStrategies() {
    const logArea = document.getElementById('log');

    if (!validateDesyncParameters()) {
        LogModule.logMessage('ОШИБКА', 'Необходимо выбрать хотя бы один десинхронизатор!');
        return;
    }

    if (!validateModifiers()) {
        LogModule.logMessage('ОШИБКА', 'Необходимо выбрать хотя бы один флаг!');
        return;
    }
	
    LogModule.logMessage('ИНФО', 'Начали генерацию...');	

    const desyncCount = parseInt(getValue('gen-desync-count'), 10) || 1;
    const stringsCount = parseInt(getValue('gen-strings-count'), 10) || 1;
    const modificatorChoice = getValue('modificator-choise');

    const desyncParams = parameters
        .filter(p => p.isDesync)
        .map(p => ({ ...p, weight: parseInt(getValue(p.weightId), 10) }));

    const endParams = parameters
        .filter(p => p.endOfString)
        .map(p => ({ ...p, weight: parseInt(getValue(p.weightId), 10) }));

    const strategies = [];
    for (let i = 0; i < stringsCount; i++) {
        let strategyParts = [];

        for (let j = 0; j < desyncCount; j++) {
            const param = weightedRandomChoice(desyncParams);
            if (!param) break;
            const cmd = generateParameterStrategy(param, modificatorChoice, true);
            if (cmd) strategyParts.push(cmd);
        }

        endParams.filter(p => p.weight > 0).forEach(param => {
            if (Math.random() < param.weight * 0.1) { // 10% за единицу веса
                const cmd = generateParameterStrategy(param, modificatorChoice);
                if (cmd) strategyParts.push(cmd);
            }
        });

        if (strategyParts.length > 0) {
            strategies.push(strategyParts.join(' '));
        }
    }

    const uniqueStrategies = [...new Set(strategies)];
    document.getElementById('generated-strategies').value = uniqueStrategies.join('\n').replace(/<br\s*\/?>/gi, '\n');

    LogModule.logMessage('ИНФО', `Сгенерировано ${strategies.length} стратегий.`);
    LogModule.logMessage('ИНФО', `Уникальных стратегий: ${uniqueStrategies.length}`);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('generate').addEventListener('click', generateStrategies);
});