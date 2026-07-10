/**
 * Type: module
 * Scope: global
 * Created: 2026-06-25T08:29:34+09:00
 * Last Updated: 2026-06-25T08:43:55+09:00
 * Status: ACTIVE
 */

/**
 * Markdown解析およびカスタムレンダリングモジュール
 */

/**
 * ネストされたコードブロック（バッククォートの階層）を修復し、パース時の崩れを防ぐ
 * @param {string} text 元のMarkdownテキスト
 * @returns {string} 修復されたMarkdownテキスト
 */
function fixNestedCodeBlocks(text) {
    if (!text || typeof text !== 'string') return text;

    // \r\n (Windows), \r (Mac), \n (Linux) 全ての改行コードを安全に分割
    const lines = text.split(/\r\n|\r|\n/);
    const out = [...lines];
    const stack = [];
    const blocks = [];

    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^(\s*)(`{3,})(.*)$/);
        if (match) {
            const indent = match[1] || '';
            const fence = match[2] || '';
            const info = match[3] || '';
            const hasInfo = info.trim().length > 0;

            if (hasInfo) {
                stack.push({ index: i, indent: indent, fence: fence, info: info, children: [] });
            } else {
                if (stack.length > 0) {
                    const open = stack.pop();
                    open.closeIndex = i;
                    open.closeIndent = indent;

                    if (stack.length > 0) {
                        stack[stack.length - 1].children.push(open);
                    } else {
                        blocks.push(open);
                    }
                } else {
                    stack.push({ index: i, indent: indent, fence: fence, info: info, children: [] });
                }
            }
        }
    }

    while (stack.length > 0) {
        const open = stack.pop();
        open.closeIndex = null;
        if (stack.length > 0) {
            stack[stack.length - 1].children.push(open);
        } else {
            blocks.push(open);
        }
    }

    function adjustLengths(block) {
        let maxChildFence = block.fence.length - 1;

        for (let i = 0; i < block.children.length; i++) {
            const childFenceLen = adjustLengths(block.children[i]);
            maxChildFence = Math.max(maxChildFence, childFenceLen);
        }

        const needed = Math.max(block.fence.length, maxChildFence + 1);
        if (needed > block.fence.length) {
            const newFence = '`'.repeat(needed);
            out[block.index] = block.indent + newFence + block.info;
            if (block.closeIndex !== null) {
                out[block.closeIndex] = block.closeIndent + newFence;
            }
            return needed;
        }

        return block.fence.length;
    }

    for (let i = 0; i < blocks.length; i++) {
        adjustLengths(blocks[i]);
    }

    // 配列ではなく、確実に「改行」で再結合した文字列を返す
    return out.join(String.fromCharCode(10));
}

/**
 * MarkdownテキストをHTMLにパースし、サニタイズした結果を返す
 * @param {string} markdownText 
 * @returns {string} サニタイズ済みHTML文字列
 */
/**
 * 与えられた文字列から 8文字以内の URL-safe Base64 ハッシュ値を生成する
 * FNV-1a 64bitハッシュを元に 48bit (6バイト) のデータを生成して Base64化する
 * @param {string} str 
 * @returns {string} 8文字のURL-safe Base64ハッシュ値
 */
function generateHash(str) {
    if (!str) return '';
    let hash = 14695981039346656037n; // FNV offset basis 64-bit
    const prime = 1099511628211n; // FNV prime 64-bit
    
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    
    for (let i = 0; i < bytes.length; i++) {
        hash ^= BigInt(bytes[i]);
        hash = (hash * prime) & 0xffffffffffffffffn;
    }
    
    // 64-bitのうち、上位6バイト（48ビット）を抽出してBase64にする
    const hashBytes = new Uint8Array(6);
    for (let i = 0; i < 6; i++) {
        hashBytes[i] = Number((hash >> BigInt(40 - i * 8)) & 0xffn);
    }
    
    let binary = '';
    for (let i = 0; i < 6; i++) {
        binary += String.fromCharCode(hashBytes[i]);
    }
    
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, ''); // ちょうど8文字
}

/**
 * MarkdownテキストをHTMLにパースし、サニタイズした結果を返す
 * @param {string} markdownText 
 * @returns {string} サニタイズ済みHTML文字列
 */
function parseMarkdownToHtml(markdownText) {
    const fixedText = fixNestedCodeBlocks(markdownText);
    const renderer = new marked.Renderer();

    // 見出しのカスタムレンダリング（アンカーIDとコピー用アンカータグを付与）
    // 旧引数(text, depth)と新引数({text, depth})の両方に対応する防衛設計
    renderer.heading = function(arg1, arg2) {
        let text = '';
        let depth = 2;
        if (typeof arg1 === 'object' && arg1 !== null) {
            text = arg1.text || '';
            depth = arg1.depth || 2;
        } else {
            text = arg1 || '';
            depth = arg2 || 2;
        }

        const cleanText = text.replace(/<[^>]*>/g, '');
        const escapedText = cleanText.trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\u3000-\u30fe\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\w\-]+/g, '');
        
        const hashId = generateHash(escapedText);
        
        return `<h${depth} id="${hashId}" class="markdown-heading">` +
               `${text}` +
               `<span class="heading-anchor" data-anchor="#${hashId}">🔗</span>` +
               `</h${depth}>\n`;
    };

    // コードブロックのカスタムレンダリング
    // 旧引数(text, lang)と新引数({text, lang})の両方に対応する防衛設計
    renderer.code = function(arg1, arg2) {
        let text = '';
        let infoStr = '';
        if (typeof arg1 === 'object' && arg1 !== null) {
            text = arg1.text || '';
            infoStr = arg1.lang || '';
        } else {
            text = arg1 || '';
            infoStr = arg2 || '';
        }

        const info = (infoStr || '').trim();
        let lang = '';
        let title = '';
        if (info) {
            const colonIdx = info.indexOf(':');
            if (colonIdx !== -1) {
                lang  = info.slice(0, colonIdx).trim();
                title = info.slice(colonIdx + 1).trim();
            } else {
                lang = info.split(/\s+/)[0]; // 最初のワードを言語とする
            }
        }
        const escapedCode = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const langAttr  = lang  ? ` class="language-${lang}"`                    : '';
        const titleAttr = title ? ` data-title="${title.replace(/"/g, '&quot;')}"` : '';
        return `<pre><code${langAttr}${titleAttr}>${escapedCode}</code></pre>\n`;
    };

    marked.use({ renderer });
    const rawHtml = marked.parse(fixedText);
    
    // DOMPurifyでカスタムデータ属性 (data-anchor) の保持を許可する
    return DOMPurify.sanitize(rawHtml, { ALLOW_DATA_ATTR: true });
}

// グローバルオブジェクトに公開
window.MarkdownParser = {
    fixNestedCodeBlocks,
    parseMarkdownToHtml,
    generateHash
};
