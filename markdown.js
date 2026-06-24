const FOLD_THRESHOLD = 20;
const SHOW_LINES = 10;

/**
 * テーマの設定・管理
 */
function initTheme() {
    const params = new URLSearchParams(window.location.search);
    let theme = params.get('theme');

    if (!theme) {
        // 保存された設定やOS設定を優先
        theme = localStorage.getItem('markdown-theme') || 
                (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    }

    setTheme(theme);
}

function setTheme(theme) {
    const themeLink = document.getElementById('theme-style');
    if (themeLink) {
        themeLink.href = `markdown_${theme}.css`;
    }
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('markdown-theme', theme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
}

async function loadMarkdown() {
    const params = new URLSearchParams(window.location.search);
    const filename = params.get('content') || 'README';
    const contentDiv = document.getElementById('content');

    try {
        const response = await fetch(`${filename}.md?t=${new Date().getTime()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Failed to load ${filename}`);

        const markdownText = await response.text();
        
        // MarkdownParser (markdown_parse.js) を使用してHTMLを生成
        const cleanHtml = window.MarkdownParser.parseMarkdownToHtml(markdownText);

        contentDiv.innerHTML = cleanHtml;

        contentDiv.querySelectorAll('a').forEach(link => {
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
        });

        processCodeBlocks();
        document.title = filename;

    } catch (error) {
        console.error(error);
        contentDiv.style.display = 'none';
        document.getElementById('error-message').style.display = 'block';
        document.getElementById('error-message').textContent = `Error: ${error.message}`;
    }
}

function processCodeBlocks() {
    const pres = document.querySelectorAll('pre');

    pres.forEach(pre => {
        const code = pre.querySelector('code');
        if (!code) return;

        // 1. デフォルト値の初期化
        let rawClass = code.className || '';
        let lang = 'text';
        let title = '';

        // 2. 言語とタイトルの抽出
        const match = rawClass.match(/language-([^\s"]+)/);
        if (match && match[1]) {
            lang = match[1];
        }
        
        if (code.dataset && code.dataset.title) {
            title = code.dataset.title;
        }

        if (typeof lang !== 'string') {
            lang = 'text';
        }

        // 4. 表示用の言語名変換
        let displayLang = lang;
        if (lang === 'js') displayLang = 'JavaScript';
        if (lang === 'ts') displayLang = 'TypeScript';
        if (lang === 'py') displayLang = 'Python';
        if (lang === 'sh') displayLang = 'Bash';
        if (['ps1', 'pwsh', 'powershell'].includes(lang.toLowerCase())) {
            displayLang = 'PowerShell';
        }

        let originalText = code.textContent;
        originalText = originalText.replace(/^(\s*)`{4,}(.*)$/gm, '$1```$2'); // 4つ以上のバッククォートを3つに切り詰める

        const lines = originalText.split(/\r\n|\r|\n/);
        const totalLines = lines.length;

        code.className = `language-${lang}`;
        code.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.className = 'code-wrapper';

        const header = document.createElement('div');
        header.className = 'code-header';

        const leftDiv = document.createElement('div');
        leftDiv.className = 'header-left';
        if (title) {
            const tSpan = document.createElement('span');
            tSpan.className = 'code-title';
            tSpan.textContent = title;
            leftDiv.appendChild(tSpan);
        }
        const lSpan = document.createElement('span');
        lSpan.className = 'code-lang';
        lSpan.textContent = displayLang;
        leftDiv.appendChild(lSpan);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = async () => {
            try {
                await navigator.clipboard.writeText(originalText);
                copyBtn.textContent = 'Copied!';
                setTimeout(() => copyBtn.textContent = 'Copy', 2000);
            } catch(e) { copyBtn.textContent = 'Error'; }
        };

        header.appendChild(leftDiv);
        header.appendChild(copyBtn);

        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(header);
        wrapper.appendChild(pre);

        if (totalLines > FOLD_THRESHOLD) {
            renderSnipped(code, lines, lang);
        } else {
            renderFull(code, originalText);
        }
    });
}

function renderFull(codeElement, text) {
    codeElement.textContent = text;
    hljs.highlightElement(codeElement);
}

function renderSnipped(codeElement, lines, lang) {
    const headLines = lines.slice(0, SHOW_LINES);
    const tailLines = lines.slice(-SHOW_LINES);
    const hiddenCount = lines.length - (SHOW_LINES * 2);

    const headText = headLines.join('\n');
    const tailText = tailLines.join('\n');

    let headHtml = hljs.highlight(headText, { language: lang, ignoreIllegals: true }).value;
    let tailHtml = hljs.highlight(tailText, { language: lang, ignoreIllegals: true }).value;

    const snipDiv = document.createElement('div');
    snipDiv.className = 'snip-line';
    snipDiv.textContent = `... snip (${hiddenCount} lines hidden) ... Click to expand all`;

    snipDiv.onclick = () => {
        const fullText = lines.join('\n');
        codeElement.innerHTML = '';
        codeElement.textContent = fullText;
        hljs.highlightElement(codeElement);
    };

    codeElement.innerHTML = headHtml + '\n';
    codeElement.appendChild(snipDiv);
    codeElement.insertAdjacentHTML('beforeend', tailHtml);
}

// 初期化処理の登録
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadMarkdown();

    // テーマ切り替えトグルのハンドリング
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleTheme);
    }
});
