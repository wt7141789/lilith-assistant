// modules/utils.js

/**
 * 支持自定义正则或简易 'Start|End' 分隔符格式
 */
export function createSmartRegExp(input, flags = 's') {
    if (!input) return null;
    if (input.includes('|') && !input.includes('(') && !input.includes(')')) {
        const parts = input.split('|');
        if (parts.length === 2) {
            const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const start = escape(parts[0].trim());
            const end = escape(parts[1].trim());
            if (start && end) {
                return new RegExp(`${start}([\\s\\S]*?)${end}`, flags);
            }
        }
    }
    return new RegExp(input, flags);
}

/**
 * 提取正文内容
 */
export function extractContent(text, userState) {
    if (!text) return text;
    let result = text;
    if (!userState) return result; // 安全检查

    if (userState.extractionEnabled && userState.extractionRegex) {
        try {
            const pattern = createSmartRegExp(userState.extractionRegex, 's'); 
            const match = pattern.exec(result);
            if (match) {
                result = match[1] !== undefined ? match[1] : match[0];
            }
        } catch (e) {
            console.error('[Lilith] Regex Extraction Error:', e);
        }
    }

    if (userState.textReplacementEnabled && userState.textReplacementRegex) {
        try {
            const regex = createSmartRegExp(userState.textReplacementRegex, 'g'); 
            const replacement = userState.textReplacementString || '';
            result = result.replace(regex, replacement);
        } catch (e) {
             console.error('[Lilith] Regex Replacement Error:', e);
        }
    }

    // 内容净化
    result = result.replace(/chatu8/gi, '');

    return result;
}

/**
 * 获取页面上下文
 */
export function getPageContext(limit = 15, userState) {
    try {
        const chatDiv = document.getElementById('chat');
        if (!chatDiv) return [];
        const messages = Array.from(chatDiv.querySelectorAll('.mes'));
        return messages.slice(-limit).map(msg => {
            const name = msg.getAttribute('ch_name') || 'User';
            let text = msg.querySelector('.mes_text')?.innerText || '';
            text = extractContent(text, userState); 
            return { name, message: text };
        }).filter(m => m.message.length > 1);
    } catch (e) { return []; }
}
