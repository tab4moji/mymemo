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
function parseMarkdownToHtml(markdownText) {
    const fixedText = fixNestedCodeBlocks(markdownText);
    const renderer = new marked.Renderer();

    // コードブロックのカスタムレンダリング
    renderer.code = function({ text, lang: infoStr }) {
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
    return DOMPurify.sanitize(rawHtml);
}

// グローバルオブジェクトに公開
window.MarkdownParser = {
    fixNestedCodeBlocks,
    parseMarkdownToHtml
};
