/* memo_service_gate.js
 * — single entry: serviceGate(username, password)
 * — if localStorage already has BOTH service_path & service_token → contents()
 * — otherwise shows a funky 8-bit dark-mode config screen and, on Go!, stores
 *   the values then calls contents().
 */
function serviceGate(username, password) {
  const path  = localStorage.getItem('service_path');
  const token = localStorage.getItem('service_token');

  // ---------------------------------------------
  // 1. 正常ルート：設定済みなら即座に contents()
  // ---------------------------------------------
  if (path && token) {
    if (typeof contents === 'function') {
      return contents(username, password);
    }
    // ShowError('contents() is not defined yet.');
    // return; // フェールセーフ
  }

  // ---------------------------------------------
  // 2. 未設定ルート：ゴリゴリ DOM 生成でセットアップ画面
  // ---------------------------------------------
  document.body.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
      * { box-sizing: border-box; }

      body {
        margin: 0;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0a0a0a;
        color: #fff;
        font-family: 'Press Start 2P', cursive;
      }
      .setup-box {
        width: 90%;
        max-width: 460px;
        padding: 40px 30px;
        background: #181818;
        border: 4px solid #0ff;
        border-radius: 12px;
        text-align: center;
        animation: neonPulse 2s infinite alternate;
        box-shadow: 0 0 20px #0ff;
      }
      h1 {
        margin-top: 0;
        margin-bottom: 30px;
        color: #ff0;
        animation: titleBeat 1.2s infinite;
      }
      label {
        display: block;
        text-align: left;
        margin: 14px 0 4px;
        color: #0ff;
        font-size: 12px;
      }
      textarea {
        width: 100%;
        min-height: 64px;
        resize: vertical;
        background: #222;
        border: 2px solid #0ff;
        border-radius: 6px;
        padding: 10px;
        font-family: monospace;
        font-size: 14px;
        color: #fff;
      }
      textarea:focus {
        outline: none;
        border-color: #ff0;
        box-shadow: 0 0 8px #ff0;
      }
      button {
        margin-top: 28px;
        padding: 14px 40px;
        border: none;
        background: #0ff;
        color: #0a0a0a;
        font-size: 16px;
        cursor: pointer;
        transition: background 0.25s, transform 0.25s;
      }
      button:hover {
        background: #ff0;
        transform: scale(1.06);
      }
      @keyframes neonPulse {
        from { box-shadow: 0 0 10px #0ff; }
        to   { box-shadow: 0 0 35px #0ff; }
      }
      @keyframes titleBeat {
        0%, 60%, 100% { transform: scale(1); }
        30%           { transform: scale(1.18); }
      }
    </style>

    <div class="setup-box">
      <h1>Service Setup</h1>

      <label for="sp">service_path</label>
      <textarea id="sp" placeholder="https://example.com/endpoint">${path ?? ''}</textarea>

      <label for="st">service_token</label>
      <textarea id="st" placeholder="paste your super-secret token here">${token ?? ''}</textarea>

      <button id="goBtn">Go!</button>
    </div>
  `;

  // -------------------------
  // 3. イベントハンドラ
  // -------------------------
  const $go = document.getElementById('goBtn');
  const $sp = document.getElementById('sp');
  const $st = document.getElementById('st');

  // Allow Enter (⌘+Enter / Ctrl+Enter) inside textarea
  [$sp, $st].forEach(el => {
    el.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') $go.click();
    });
  });

  $go.addEventListener('click', () => {
    const newPath  = $sp.value.trim();
    const newToken = $st.value.trim();

    if (!newPath || !newToken) {
      flashError($sp.parentElement);
      return;
    }
    // 保存して次フェーズへ
    localStorage.setItem('service_path',  newPath);
    localStorage.setItem('service_token', newToken);

    if (typeof contents === 'function') {
      contents(username, password);
    } else {
      alert('contents() がまだ実装されていません！');
    }
  });

  // -------------------------
  // 4. ちょい派手なエフェクト
  // -------------------------
  function flashError(target) {
    target.style.animation = 'shake 0.4s';
    target.addEventListener('animationend', () => {
      target.style.animation = '';
    }, { once: true });

    const styleTag = document.createElement('style');
    styleTag.textContent = `
      @keyframes shake {
        0%,100% { transform: translateX(0); }
        20%,60% { transform: translateX(-10px); }
        40%,80% { transform: translateX(10px); }
      }
    `;
    document.head.appendChild(styleTag);
  }

  play_music();
}
