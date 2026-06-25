/**
 * Type: module
 * Scope: global
 * Created: 2026-06-25T08:29:34+09:00
 * Last Updated: 2026-06-25T08:43:55+09:00
 * Status: ACTIVE
 */

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
        themeLink.href = `markdown_${theme}.css?t=${new Date().getTime()}`;
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
            const href = link.getAttribute('href');
            if (!href) return;

            // 1. ページ内アンカーリンクの場合
            if (href.startsWith('#')) {
                return;
            }

            // 2. 外部リンクの場合
            if (href.startsWith('http://') || href.startsWith('https://')) {
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
                return;
            }

            // 3. ローカルのマークダウンファイルへの相対リンクの場合
            const mdRegex = /\.(md|markdown)$/i;
            const hashIndex = href.indexOf('#');
            const pathPart = hashIndex !== -1 ? href.slice(0, hashIndex) : href;
            const hashPart = hashIndex !== -1 ? href.slice(hashIndex) : '';

            if (mdRegex.test(pathPart)) {
                const parts = filename.split('/');
                parts.pop();
                const baseDir = parts.length > 0 ? parts.join('/') + '/' : '';

                try {
                    const dummyBase = 'http://dummy/';
                    const resolvedUrl = new URL(baseDir + pathPart, dummyBase);
                    let newContent = resolvedUrl.pathname.slice(1);
                    newContent = newContent.replace(mdRegex, '');

                    link.setAttribute('href', `markdown.html?content=${newContent}${hashPart}`);
                    link.removeAttribute('target');
                } catch (e) {
                    console.error('Failed to resolve relative path:', e);
                }
            } else {
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
            }
        });

        processCodeBlocks();
        document.title = filename;

        // ハッシュがあればその要素にスクロール
        if (window.location.hash) {
            const targetId = decodeURIComponent(window.location.hash.slice(1));
            const targetElem = document.getElementById(targetId);
            if (targetElem) {
                setTimeout(() => {
                    targetElem.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            }
        }

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

    // 見出しのアンカークリック時のコピーイベント (イベントデリゲーション)
    const contentDiv = document.getElementById('content');
    if (contentDiv) {
        contentDiv.addEventListener('click', (e) => {
            const anchor = e.target.closest('.heading-anchor');
            if (anchor) {
                const anchorValue = anchor.getAttribute('data-anchor');
                if (anchorValue) {
                    const url = window.location.href.split('#')[0] + anchorValue;
                    navigator.clipboard.writeText(url).then(() => {
                        const originalText = anchor.textContent;
                        anchor.textContent = ' Copied!';
                        setTimeout(() => {
                            anchor.textContent = originalText;
                        }, 1500);
                    }).catch(err => {
                        console.error('Could not copy anchor URL: ', err);
                    });
                }
            }
        });
    }

    // リンクのクリックイベントのハンドリング（SPA風の高速同一ページ遷移）
    if (contentDiv) {
        contentDiv.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link) return;

            const href = link.getAttribute('href');
            if (!href) return;

            // ローカルのマークダウン遷移リンクかチェック
            if (href.startsWith('markdown.html?content=')) {
                // 修飾キーが押されている場合や、左クリック以外はブラウザ標準の挙動（別タブで開く等）に任せる
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                    return;
                }

                e.preventDefault(); // デフォルトの遷移を阻止
                
                // ブラウザ履歴に追加
                history.pushState(null, '', href);
                
                // 再ロード
                loadMarkdown();
            }
        });
    }

    // 履歴の「戻る」「進む」に対応
    window.addEventListener('popstate', () => {
        loadMarkdown();
    });
});
