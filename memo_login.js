function entry_mode () {
  // ログイン画面のスタイルと内容を動的に生成
  document.body.innerHTML = `
    <style>
      body {
        background-color: #111;
        color: #fff;
        font-family: 'Press Start 2P', cursive;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
      }
      .login-container {
        text-align: center;
        background-color: #222;
        padding: 30px;
        border: 4px solid #0f0;
        border-radius: 10px;
        box-shadow: 0 0 20px #0f0;
        width: 350px;
        animation: pulse 1.5s infinite alternate;
      }
      h1 {
        color: #ff0;
        margin-bottom: 20px;
        /* 複雑な心臓の鼓動 */
        animation: dance 1s infinite;
      }
      @keyframes dance {
        0% { transform: scale(1); }
        20% { transform: scale(1.2); }
        30% { transform: scale(1); }
        50% { transform: scale(1.2); }
        60% { transform: scale(1); }
        80% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      @keyframes pulse {
        from { box-shadow: 0 0 10px #0f0; }
        to { box-shadow: 0 0 30px #0f0; }
      }
      input {
        background: #333;
        border: none;
        border-bottom: 2px solid #0f0;
        color: #fff;
        padding: 10px;
        margin: 10px 0;
        width: 80%;
        font-size: 1em;
      }
      input:focus {
        outline: none;
        border-bottom-color: #ff0;
      }
      button {
        background: #0f0;
        border: none;
        padding: 10px 20px;
        font-size: 1em;
        cursor: pointer;
        color: #111;
        margin-top: 20px;
        transition: background 0.3s;
      }
      button:hover {
        background: #ff0;
      }
      /* レスポンシブ対応 */
      @media (max-width: 600px) {
        .login-container {
          width: 90%;
          padding: 20px;
        }
        input {
          width: 100%;
        }
      }
    </style>
    <div class="login-container">
      <h1>Memo!</h1>
      <input type="text" id="username" placeholder="username">
      <input type="password" id="password" placeholder="password" autocomplete="new-password">
      <button id="enterBtn">Enter</button>
    </div>
  `;

  // 各要素を取得
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const enterBtn = document.getElementById('enterBtn');

  // ログイン処理
  function login() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    // パスワードのフォーマットチェック: 8文字以上かつ大文字・小文字・数字をチェック
    const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

    if (!username || !password) {
      ShowError('USERname と PassWOrd を入力してください。', "NO!");
    } else if (!passwordPattern.test(password)) {
      // パスワードは8文字以上で、大文字・小文字・数字を含む形式にしてください。
      ShowError('パスワードは8文字以上で、大文字・小文字・数字を含む形式にしてください。', "NO!");
      return;
    } else if (typeof serviceGate === "function") {
      // serviceGate 関数が存在する場合に呼び出す
      serviceGate(username, password);
    } else {
      ShowError("serviceGate 関数が見つかりません。");
    }
  }

  // Enter キーでログイン処理を起動
  [usernameInput, passwordInput].forEach(input => {
    input.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        login();
      }
    });
  });

  enterBtn.addEventListener('click', login);
}
