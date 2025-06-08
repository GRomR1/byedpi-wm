//11_validate_input.js
(function() {
const allowedSymbols = {
    ':': true, '/': true, '\\': true, '.': true, ',': true, '&': true,
    '=': true, '-': true, '?': true, '(': true, ')': true, '+': true,
    '[': true, ']': true, '{': true, '}': true, ';': true, '"': true,
    "'": true, '<': true, '>': true, '*': true, '%': true, '$': true,
    '_': true, '#': true, '!': true, '\n': true, '\r': true,
    '@': true, '^': true, '`': true, '|': true
};

    function isAllowedChar(char) {
        return (
            (char >= 'a' && char <= 'z') || 
            (char >= 'A' && char <= 'Z') || 
            (char >= '0' && char <= '9') || 
            allowedSymbols[char] ||          
            char === ' ' ||                 
            char === '\n' ||                
            char === '\r'                   
        );
    }

    function filterText(text) {
        let result = '';
        for (let i = 0; i < text.length; i++) {
            if (isAllowedChar(text[i])) {
                result += text[i];
            }
        }
        return result;
    }

    function shouldFilter(element) {
        return (
            element.tagName === 'TEXTAREA' ||
            (element.tagName === 'INPUT' && element.type === 'text')
        );
    }

    function handleKeyPress(event) {
        if (!shouldFilter(event.target)) return;
        const char = event.key;
        if (char.length === 1 && !isAllowedChar(char)) {
            event.preventDefault();
        }
    }

    function pasteForTextarea(element, filteredText) {
        const start = element.selectionStart;
        const end = element.selectionEnd;
        const before = element.value.substring(0, start);
        const after = element.value.substring(end);
        
        element.value = before + filteredText + after;
        
        let newPosition;
        if (filteredText.endsWith('\n')) {
            newPosition = start + filteredText.length;
        } else {
            newPosition = start + filteredText.length;
        }
        
        element.selectionStart = element.selectionEnd = newPosition;
        
        const inputEvent = new Event('input', { bubbles: true });
        element.dispatchEvent(inputEvent);
    }

    function handlePaste(event) {
        const element = event.target;
        if (!shouldFilter(element)) return;
        
        event.preventDefault();
        const clipboardData = event.clipboardData || window.clipboardData;
        const pastedText = clipboardData.getData('text/plain');
        const filteredText = filterText(pastedText);
        
        if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
            pasteForTextarea(element, filteredText);
        }
    }

    document.addEventListener('keypress', handleKeyPress);
    document.addEventListener('paste', handlePaste);
})();