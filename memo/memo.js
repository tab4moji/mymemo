/*
  ※【注意】以下のコメントブロックは、このプロジェクトの重要な開発記録です。絶対に削除・変更しないでください.
  
  memo.js - 統合版メインスクリプト
  -------------------------------------------------
  Version History:
  1.0 (2025-06-14):
    【規約対応】初版。各ファイル頭に履歴コメントおよび追記コメントを追加するように変更。
  1.1 (2025-06-14):
    【見た目】コンテンツ画面をダークでポップ、サイバーなマトリックス風8bitデザインに変更。
  1.2 (2025-06-14):
    【修正】API通信の同時発火によるセッション競合を防ぐため、APIQueue モジュールを導入し全通信を順次処理するように変更。
    【修正】セッションキーのズレ問題解消のため、各APIリクエストで最新のsessionKeyを参照するよう payload生成のタイミングを変更。
    【修正】リファクタリング。変数宣言の統一とブロックスコープの利用、Arrow Function の採用、DOM 操作の安全性向上、fetch 処理の形式統一、全体的なリファクタリングを実施。
  1.3 (2025-06-15):
    【修正】Promiseチェーンに完全統一し、async/await を一切使用しない仕様に変更。安全なBase64変換ユーティリティを導入、各APIリクエストの同時発火禁止、キャッシュ機能導入。
    【修正】非同期操作におけるエラーハンドリングの強化、ページ更新時のタイトル反映の問題解消、ローカルキャッシュ利用の最適化、エラー用 UI の適切な呼び出し。
  1.4 (2025-06-16):
    【修正】共通処理（ユーティリティ関数、暗号化／復号ロジック、ログ出力機能、APIQueue）の分離を実施し、memo_lib.js として外部ライブラリ化。これにより、memo.js はアプリ固有のUIとロジックに専念する。
  1.5 (2025-06-16):
    【修正】CSS の外部化に伴い、memo.css に追加CSSを移動。これにより、memo.js 内で動的にスタイルを挿入する処理を削除。
  1.6 (2025-06-16):
    【修正】CSS外部化対応：UI要素のスタイル設定を全て memo.css に移動し、JS 内ではクラス付与のみを実施。（対象：login画面、service setup画面、アプリ本体UI、登録UI、リセットボタン）
    【修正】インラインスタイルの削除：生成HTML内の <style> タグや element.style の設定を削除し、対応する CSS クラスを付与する形に変更。
    【修正】各DOM生成部分に対して新たなCSSクラス（app-container、app-header、main-area、sidebar、content-area、title-input、content-editor、registration-overlay、registration-box、etc.）を付与。
  1.7 (2025-06-16):
    【リファクタ】共通APIリクエスト処理とUI生成関数、Enterキーイベントの共通化によって冗長化を解消。サーバとの通信シーケンスおよびユーザーの見た目は全く変更なし.
  1.8 (2025-06-16):
    【新規UI機能】memo.js の起動時動作を３パターンに分類．
      - パターンA: ブラウザ内に service_path が存在する場合、従来のログイン画面（username, password, New Register）を表示。
      - パターンB: localStorage が無い／service_path 未設定の場合は、登録画面としてログイン画面（username, password, New Register）を表示。New Register押下後、招待状入力欄（紹介状(JSON形式)のみ）を表示し、システムにハードコードされたAES鍵と公開鍵（memo_publickeys.jsから取得）で招待状の復号と username のハッシュ検証に加え、招待状から得られた URL と既存の service_path（あれば）の照合を行い、一致していればその後の動作へ進む。  
      - いずれの場合も、無効なセッション発生時は、Registration 画面と同様のデザインによるセッションエラー画面で、Reset Session と セッション再接続の両方の対処が可能となるように実装.
*/

(function () {
  "use strict";

  // グローバルなユーザ情報を保持（ログイン後に設定）
  var currentUser = { username: null, password: null };

  // ── 既存ユーティリティ関数 ─────────────────────────────
  function play_music(id) {
    console.log("play_music called with id:", id);
    return;
  }

  function createLoader(text) {
    const loader = document.createElement('div');
    loader.className = 'loader';
    loader.textContent = text;
    return loader;
  }

  function createResetButton() {
    const resetBtn = document.createElement('button');
    resetBtn.id = 'resetLocalStorageBtn';
    resetBtn.classList.add('reset-button'); // [変更1]
    resetBtn.innerText = 'ReSet!!';
    resetBtn.addEventListener('click', () => {
      if (confirm("LocalStorage を消去してもいいか？（再設定が必要になります）")) {
        localStorage.clear();
        location.reload();
      }
    });
    document.body.appendChild(resetBtn);
  }

  function bindEnterKey(element, handler) {
    element.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') handler();
    });
  }

  // ── パターンA：ログイン画面 (service_path 存在時) ─────────────────────────────
  function showLoginScreen() {
    document.body.innerHTML = `
      <div class="login-wrapper">
        <div class="login-container">
          <h1>Memo!</h1>
          <input type="text" id="name" placeholder="username" autocomplete="email">
          <input type="password" id="password" placeholder="password" autocomplete="new-password">
          <button id="enterBtn" class="login-btn">New Register</button>
        </div>
      </div>
    `;
    createResetButton();
    const usernameInput = document.getElementById('name');
    const passwordInput = document.getElementById('password');
    const enterBtn = document.getElementById('enterBtn');

    function login() {
      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();
      const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
      if (!username || !password) {
        memoLib.ShowError('USERname と PassWOrd を入力してください。', "NO!");
      } else if (!passwordPattern.test(password)) {
        memoLib.ShowError('パスワードは8文字以上で、大文字・小文字・数字を含む形式にしてください。', "NO!");
      } else {
        // ログイン成功時にグローバル情報を保持
        currentUser.username = username;
        currentUser.password = password;
        serviceGate(username, password);
      }
    }

    [usernameInput, passwordInput].forEach(input => bindEnterKey(input, login));
    enterBtn.addEventListener('click', login);
  }

  // ── パターンB：登録画面 (service_path 未設定時) ─────────────────────────────
  function showRegistrationScreen() {
    document.body.innerHTML = `
      <div class="login-wrapper">
        <div class="login-container">
          <h1>Memo!</h1>
          <input type="text" id="regName" placeholder="username" autocomplete="email">
          <input type="password" id="regPassword" placeholder="password" autocomplete="new-password">
          <button id="registerBtn" class="login-btn">New Register</button>
        </div>
      </div>
    `;
    createResetButton();
    const regNameInput = document.getElementById('regName');
    const regPasswordInput = document.getElementById('regPassword');
    const registerBtn = document.getElementById('registerBtn');

    function register() {
      const username = regNameInput.value.trim();
      const password = regPasswordInput.value.trim();
      if (!username || !password) {
        memoLib.ShowError('ユーザ名とパスワードを入力してください。', "NO!");
      } else {
        // ログインとは別の登録フロー：グローバルに登録情報を保持し、次の招待状入力へ進む
        currentUser.username = username;
        currentUser.password = password;
        showInvitationPane(username, password);
      }
    }

    [regNameInput, regPasswordInput].forEach(input => bindEnterKey(input, register));
    registerBtn.addEventListener('click', register);
  }

  // ── 招待状入力画面 ─────────────────────────────
  function showInvitationPane(username, password) {
    document.body.innerHTML = `
      <div class="setup-wrapper">
        <div class="setup-box">
          <h1>Registration</h1>
          <label for="invitationInput">紹介状 (JSON形式):</label>
          <textarea id="invitationInput" rows="10" placeholder="ここに招待状JSONを貼り付けて"></textarea>
          <button id="verifyInvitationBtn" class="setup-btn">Verify Invitation</button>
        </div>
      </div>
    `;
    createResetButton();
    const invitationInput = document.getElementById('invitationInput');
    const verifyInvitationBtn = document.getElementById('verifyInvitationBtn');

    verifyInvitationBtn.addEventListener('click', function () {
      const invitationStr = invitationInput.value.trim();
      if (!invitationStr) {
        memoLib.ShowError('紹介状を入力してください。', "NO!");
        return;
      }
      // ハードコードされたAES鍵と公開鍵を使用するため、memo_publickeys.jsから取得
      const aesPassword = window.memoPublicKeys.aesPassword;
      const publicKeyStr = JSON.stringify(window.memoPublicKeys.publicKey);
      verifyInvitation(invitationStr, aesPassword, publicKeyStr)
        .then(function (decryptedInvitation) {
          return computeHashStr(username).then(function (hashStr) {
            if (hashStr !== decryptedInvitation.username_hash) {
              throw new Error("Username hash の不一致。");
            }
            return decryptedInvitation;
          });
        })
        .then(function (invitation) {
          const storedServicePathEncrypted = localStorage.getItem('service_path');
          if (storedServicePathEncrypted) {
            return memoLib.decryptText(storedServicePathEncrypted, password).then(function (decryptedPath) {
              if (decryptedPath !== invitation.url) {
                throw new Error("Invitation の URL と保存された service_path が一致しません。");
              }
              return invitation;
            });
          } else {
            return memoLib.encryptText(invitation.url, password).then(function (encryptedPath) {
              localStorage.setItem('service_path', encryptedPath);
              return invitation;
            });
          }
        })
        .then(function () {
          serviceGate(username, password);
        })
        .catch(function (error) {
          memoLib.ShowError("招待状検証エラー: " + error.message);
          console.error("Invitation verification error:", error);
        });
    });
  }

  // ── 招待状復号・署名検証 (memo_verify_invitation から流用) ─────────────────────────────
  async function verifyInvitation(invitationJsonString, aesPassword, publicKeyJwkString) {
    if (typeof pako === 'undefined' || typeof base32 === 'undefined') {
      throw new Error("必要なライブラリがロードされていません。");
    }
    let parsedInvitation, encryptedDataBase32, signatureBase32, iv, actualEncryptedData, publicKey;
    try {
      parsedInvitation = JSON.parse(invitationJsonString);
      encryptedDataBase32 = parsedInvitation.encrypted_data;
      signatureBase32 = parsedInvitation.signature;
      if (!encryptedDataBase32 || !signatureBase32) {
        throw new Error("招待状フォーマットが不正です。（encrypted_data と signature が必要）");
      }
      const publicKeyJwk = JSON.parse(publicKeyJwkString);
      publicKey = await window.crypto.subtle.importKey(
        "jwk",
        publicKeyJwk,
        { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
        true,
        ["verify"]
      );
      function base32ToArrayBuffer(base32String) {
        const decodedBytes = base32.decode.asBytes(base32String);
        return new Uint8Array(decodedBytes).buffer;
      }
      const decodedEncryptedBuffer = base32ToArrayBuffer(encryptedDataBase32);
      const decodedEncryptedUint8 = new Uint8Array(decodedEncryptedBuffer);
      if (decodedEncryptedUint8.length < 16) {
        throw new Error("暗号文が短すぎます。IVが含まれていない可能性があります。");
      }
      iv = decodedEncryptedUint8.slice(0, 16);
      actualEncryptedData = decodedEncryptedUint8.slice(16);
    } catch (e) {
      console.error("招待状のパース、公開鍵のインポート、またはBase32デコード中にエラー:", e);
      throw e;
    }
    try {
      const salt = new TextEncoder().encode("some-static-salt-for-demo-purposes");
      const aesKey = await (function deriveEncryptionKey(password, salt) {
        const enc = new TextEncoder();
        return window.crypto.subtle.importKey(
          "raw",
          enc.encode(password),
          { name: "PBKDF2" },
          false,
          ["deriveBits"]
        )
          .then(function(keyMaterial) {
            return window.crypto.subtle.deriveBits(
              { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
              keyMaterial,
              256
            );
          })
          .then(function(bits) {
            return window.crypto.subtle.importKey(
              "raw",
              bits,
              { name: "AES-GCM" },
              true,
              ["encrypt", "decrypt"]
            );
          });
      })(aesPassword, salt);
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv, tagLength: 128 },
        aesKey,
        actualEncryptedData
      );
      const decompressedData = pako.inflate(new Uint8Array(decryptedBuffer), { to: 'string' });
      const decryptedJsonObject = JSON.parse(decompressedData);
      if (!decryptedJsonObject.url || !decryptedJsonObject.username_hash) {
        throw new Error("復号されたJSONに 'url' または 'username_hash' が含まれていません。");
      }
      const signedMessage = decryptedJsonObject.url + decryptedJsonObject.username_hash;
      const hashedSignedMessageBuffer = await (function sha256(message) {
        const msgUint8 = new TextEncoder().encode(message);
        return crypto.subtle.digest('SHA-256', msgUint8);
      })(signedMessage);
      const decodedSignatureBuffer = (function base32ToArrayBuffer(base32String) {
        const decodedBytes = base32.decode.asBytes(base32String);
        return new Uint8Array(decodedBytes).buffer;
      })(signatureBase32);
      const isValid = await window.crypto.subtle.verify(
        { name: "RSASSA-PKCS1-v1_5" },
        publicKey,
        decodedSignatureBuffer,
        hashedSignedMessageBuffer
      );
      if (!isValid) {
        throw new Error("署名が無効です。招待状が改ざんされたか、公開鍵または署名アルゴリズムに誤りがあります。");
      }
      return decryptedJsonObject;
    } catch (e) {
      console.error("復号または署名検証中にエラーが発生しました:", e);
      throw e;
    }
  }

  // ── ユーザ名のSHA-256ハッシュを16進数文字列に変換 ─────────────────────────────
  function computeHashStr(text) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
      .then(buffer => {
        const hashArray = Array.from(new Uint8Array(buffer));
        return hashArray.map(b => ('00' + b.toString(16)).slice(-2)).join('');
      });
  }

  // ── セッション無効時共通処理（Reset Session と Reconnect Session を統合） ─────────────────────────────
  function showSessionInvalidPane(username, password) {
    document.body.innerHTML = `
      <div class="setup-wrapper">
        <div class="setup-box">
          <h1>セッションエラー</h1>
          <p>セッションが無効です。以下から対処してください。</p>
          <hr>
          <div id="resetSection">
            <h2>Reset Session</h2>
            <p>CAPTCHAを解いて、セッションリセットを要求してください。</p>
            <canvas id="captchaCanvas" width="150" height="50"></canvas>
            <input type="text" id="captchaInput" placeholder="4桁の数字">
            <button id="resetBtn" class="setup-btn">Reset Session</button>
          </div>
          <hr>
          <div id="reconnectSection">
            <h2>Reconnect Session</h2>
            <p>メールで受信したトークンとセッションキーを入力してください。</p>
            <input type="text" id="reconnect_userToken" placeholder="トークン">
            <input type="text" id="reconnect_SessionKey" placeholder="セッションキー">
            <button id="reconnectBtn" class="setup-btn">Reconnect Session</button>
          </div>
        </div>
      </div>
    `;
    var captchaValue = ('0000' + Math.floor(Math.random() * 10000)).slice(-4);
    var canvas = document.getElementById('captchaCanvas');
    var ctx = canvas.getContext('2d');
    ctx.font = "30px Arial";
    ctx.fillStyle = "black";
    var x = 10;
    for (let i = 0; i < 4; i++) {
      let digit = captchaValue[i];
      let angle = (Math.random() - 0.5) * 0.5;
      ctx.save();
      ctx.translate(x, 35);
      ctx.rotate(angle);
      ctx.fillText(digit, 0, 0);
      ctx.restore();
      x += 30;
    }
    document.getElementById('resetBtn').addEventListener('click', function(){
         var input = document.getElementById('captchaInput').value.trim();
         if(input === captchaValue){
             resetSession(username, password);
         } else {
             alert("CAPTCHAが違います。");
         }
    });
    document.getElementById('reconnectBtn').addEventListener('click', function(){
         var userToken = document.getElementById('reconnect_userToken').value.trim();
         var sessionKey = document.getElementById('reconnect_SessionKey').value.trim();
         if(!sessionKey || !userToken){
            alert("セッションキーを入力してください。");
         } else {
            localStorage.setItem('user_token', userToken);
            localStorage.setItem('session_key', sessionKey);
            contents(username, password);
         }
    });
  }

  function resetSession(username, password) {
    var servicePath = "";
    var encryptedServicePath = localStorage.getItem('service_path');
    memoLib.decryptText(encryptedServicePath, password)
         .then(function(decryptedPath) {
             servicePath = decryptedPath;
             var userToken = localStorage.getItem('user_token');
             const payload = {
               command: 'reset_session',
               mail: username,
             };
             var payloadStr = new URLSearchParams(payload).toString();
             return memoLib.APIQueue.enqueue(() => {
                 return fetch(servicePath, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                    body: payloadStr
                 }).then(res => res.json());
             });
         })
         .then(function(data){
             alert("セッションのリセットをリクエストしました。");
         })
         .catch(function(err){
             memoLib.ShowError("reset_session エラー: " + err.message);
         });
  }

  function serviceGate(username, password) {
    const servicePathStored = localStorage.getItem('service_path');
    if (servicePathStored) {
      contents(username, password);
    } else {
      document.body.innerHTML = `
        <div class="setup-wrapper">
          <div class="setup-box">
            <h1>Service Setup</h1>
            <label for="sp">service_path</label>
            <textarea id="sp" placeholder="https://example.com/endpoint"></textarea>
            <button id="goBtn" class="setup-btn">Go!</button>
          </div>
        </div>
      `;
      createResetButton();
      const goBtn = document.getElementById('goBtn');
      const spTextarea = document.getElementById('sp');

      bindEnterKey(spTextarea, () => goBtn.click());

      goBtn.addEventListener('click', function() {
        const newPath = spTextarea.value.trim();
        if (!newPath) {
          spTextarea.parentElement.style.animation = 'shake 0.4s';
        } else {
          memoLib.encryptText(newPath, password)
            .then(function(encryptedPath) {
              localStorage.setItem('service_path', encryptedPath);
              contents(username, password);
            })
            .catch(function(e) {
              memoLib.handleError(e, "Encryption failed");
              memoLib.ShowError("Encryption failed: " + e.message);
            });
        }
      });
    }
  }

  function contents(username, password) {
    var encryptedServicePath = localStorage.getItem('service_path');
    if (!encryptedServicePath) {
      throw new Error("No encrypted service_path found.");
    }
    memoLib.decryptText(encryptedServicePath, password)
      .then(function(_servicePath) {
        var servicePath = _servicePath;
        var userToken = localStorage.getItem('user_token');
        var sessionKey = localStorage.getItem('session_key');
        var pageCache = {};

        document.body.innerHTML = '';
        const container = document.createElement('div');
        container.id = 'app-container';
        container.classList.add('app-container'); // [変更2]
        document.body.appendChild(container);

        const header = document.createElement('div');
        header.classList.add('app-header'); // [変更2]
        header.innerHTML = `<h1>Funky Memo App</h1>`;
        container.appendChild(header);

        const mainArea = document.createElement('div');
        mainArea.classList.add('main-area'); // [変更2]
        container.appendChild(mainArea);

        const sidebar = document.createElement('div');
        sidebar.classList.add('sidebar'); // [変更2]
        mainArea.appendChild(sidebar);

        const sidebarTitle = document.createElement('h2');
        sidebarTitle.classList.add('sidebar-title'); // [変更2]
        sidebarTitle.innerText = 'Pages';
        sidebar.appendChild(sidebarTitle);

        const pageList = document.createElement('ul');
        pageList.classList.add('page-list'); // [変更2]
        sidebar.appendChild(pageList);

        const contentArea = document.createElement('div');
        contentArea.classList.add('content-area'); // [変更2]
        mainArea.appendChild(contentArea);

        const titleContainer = document.createElement('div');
        titleContainer.classList.add('title-container'); // [変更2]
        contentArea.appendChild(titleContainer);

        const titleLabel = document.createElement('span');
        titleLabel.classList.add('title-label'); // [変更2]
        titleLabel.innerText = "Title: ";
        titleContainer.appendChild(titleLabel);

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.classList.add('title-input'); // [変更2]
        titleContainer.appendChild(titleInput);

        const contentEditor = document.createElement('textarea');
        contentEditor.classList.add('content-editor'); // [変更2]
        contentArea.appendChild(contentEditor);

        const controlPanel = document.createElement('div');
        controlPanel.classList.add('control-panel'); // [変更2]
        contentArea.appendChild(controlPanel);

        const saveOrUpdateBtn = document.createElement('button');
        saveOrUpdateBtn.classList.add('save-update-btn'); // [変更2]
        controlPanel.appendChild(saveOrUpdateBtn);

        const refreshBtn = document.createElement('button');
        refreshBtn.classList.add('refresh-btn'); // [変更2]
        refreshBtn.innerText = 'Refresh';
        refreshBtn.addEventListener('click', function() {
          if (currentPageKey && currentPageKey !== "NEW") {
            log('Refreshing page from server: ' + currentPageKey);
            loadPageContent(currentPageKey, true);
          } else {
            log('No page selected to refresh.');
          }
        });
        controlPanel.appendChild(refreshBtn);

        const logArea = document.createElement('div');
        logArea.classList.add('log-area'); // [変更2]
        container.appendChild(logArea);

        const log = memoLib.initLogger(logArea);

        let currentPageKey = "NEW";
        let pages = [];

        function updateSession(newSession) {
          sessionKey = newSession;
          localStorage.setItem('session_key', sessionKey);
          log('DEBUG: sessionKey updated to: ' + newSession);
        }

        function renderPageList() {
          pageList.innerHTML = "";
          const newItem = document.createElement('li');
          newItem.classList.add('page-item');
          newItem.dataset.key = "NEW";
          newItem.innerText = "NEW!";
          newItem.addEventListener('click', function() {
            currentPageKey = "NEW";
            titleInput.value = "";
            contentEditor.value = "";
            saveOrUpdateBtn.innerText = "saveAS";
            highlightSelectedPage();
          });
          pageList.appendChild(newItem);
          pages.forEach(function(page) {
            const li = document.createElement('li');
            li.classList.add('page-item');
            li.dataset.key = page.key;
            li.innerText = page.title;
            li.addEventListener('click', function() {
              currentPageKey = page.key;
              loadPageContent(page.key);
              saveOrUpdateBtn.innerText = "UpDate";
              highlightSelectedPage();
            });
            pageList.appendChild(li);
          });
          highlightSelectedPage();
        }

        function highlightSelectedPage() {
          const lis = pageList.getElementsByTagName('li');
          for (const li of lis) {
            if (li.dataset.key === currentPageKey) {
              li.classList.add('selected');
            } else {
              li.classList.remove('selected');
            }
          }
        }

        function apiRequest(payload, description) {
          const payloadStr = new URLSearchParams(payload).toString();
          log('DEBUG: Sending ' + description + ' request: ' + payloadStr);
          return memoLib.APIQueue.enqueue(() => {
            return fetch(servicePath, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: payloadStr
            })
              .then(response => response.json())
              .then(data => {
                if (data.sessionKey) updateSession(data.sessionKey);
                if (data.error && data.error.toLowerCase().includes("session")) {
                  handleInvalidSession();
                  throw new Error("Session error detected.");
                }
                return data;
              });
          });
        }

        function loadPageList() {
          log('Loading page list...');
          pageList.innerHTML = '';
          const loader = createLoader("Loading pages...");
          pageList.appendChild(loader);
          const payload = {
            command: 'get',
            token: userToken,
            sessionKey: sessionKey,
            key: '__page_list__',
            default: '[]'
          };
          return apiRequest(payload, "loadPageList")
            .then(function(data) {
              log('DEBUG: Received loadPageList response: ' + JSON.stringify(data));
              const listStr = data['__page_list__'] || '[]';
              try {
                pages = JSON.parse(listStr);
              } catch (e) {
                log('Error parsing page list JSON: ' + e);
                pages = [];
              }
              renderPageList();
              if (pageList.contains(loader)) {
                pageList.removeChild(loader);
              }
              log('Page list loaded. Count: ' + pages.length);
              return data;
            })
            .catch(function(err) {
              log('Error fetching page list: ' + err);
              memoLib.showToastError("Failed to load page list: " + (err.message || err));
              throw err;
            });
        }

        function updatePageList() {
          log('Updating page list on server...');
          const listStr = JSON.stringify(pages);
          const payload = {
            command: 'set',
            token: userToken,
            sessionKey: sessionKey,
            key: '__page_list__',
            value: listStr
          };
          return apiRequest(payload, "updatePageList")
            .then(function(data) {
              log('DEBUG: Received updatePageList response: ' + JSON.stringify(data));
              log('Page list updated (' + data.result + ')');
              return data;
            })
            .catch(function(err) {
              log('Error updating page list: ' + err);
              memoLib.showToastError("Failed to update page list: " + (err.message || err));
              throw err;
            });
        }

        function loadPageContent(pageKey, forceRefresh) {
          if (pageKey !== "NEW" && !forceRefresh && pageCache.hasOwnProperty(pageKey)) {
            log('Using cached content for page: ' + pageKey);
            currentPageKey = pageKey;
            highlightSelectedPage();
            contentEditor.value = pageCache[pageKey];
            return Promise.resolve({ cached: true, content: pageCache[pageKey] });
          }
          currentPageKey = pageKey;
          highlightSelectedPage();
          const loader = createLoader("Loading content...");
          contentEditor.value = "";
          contentArea.appendChild(loader);
          log('Fetching content for page: ' + pageKey);
          const payload = {
            command: 'get',
            token: userToken,
            sessionKey: sessionKey,
            key: pageKey,
            default: ''
          };
          return apiRequest(payload, "loadPageContent")
            .then(function(data) {
              log('DEBUG: Received loadPageContent response: ' + JSON.stringify(data));
              if (contentArea.contains(loader)) contentArea.removeChild(loader);
              if (data.error) {
                contentEditor.value = 'Error: ' + data.error;
                log('Error loading page ' + pageKey + ': ' + data.error);
              } else {
                var pageContent = data[pageKey] || '';
                contentEditor.value = pageContent;
                pageCache[pageKey] = pageContent;
                log('Content loaded for: ' + pageKey);
              }
              if (pageKey !== "NEW") {
                var found = pages.find(function(p) { return p.key === pageKey; });
                titleInput.value = (found && found.title) ? found.title : '';
                saveOrUpdateBtn.innerText = "UpDate";
              }
              return data;
            })
            .catch(function(err) {
              if (contentArea.contains(loader)) { contentArea.removeChild(loader); }
              contentEditor.value = 'Error loading content: ' + err;
              log('Error fetching content for ' + pageKey + ': ' + err);
              memoLib.showToastError("Failed to load page content: " + (err.message || err));
              throw err;
            });
        }

        function setPageContent(pageKey, content) {
          log('Setting content for: ' + pageKey);
          const payload = {
            command: 'set',
            token: userToken,
            sessionKey: sessionKey,
            key: pageKey,
            value: content
          };
          return apiRequest(payload, "setPageContent")
            .then(function(data) {
              log('DEBUG: Received setPageContent response: ' + JSON.stringify(data));
              log('Set command success for ' + pageKey + ' (' + data.result + ')');
              if (pageKey !== "NEW") {
                pageCache[pageKey] = content;
              }
              return data;
            })
            .catch(function(err) {
              log('Error setting content for ' + pageKey + ': ' + err);
              memoLib.showToastError("Failed to set page content: " + (err.message || err));
              throw err;
            });
        }

        function deletePage(pageKey) {
          pages = pages.filter(function(page) { return page.key !== pageKey; });
          return updatePageList()
            .then(function() {
              renderPageList();
              if (currentPageKey === pageKey) {
                contentEditor.value = '';
                currentPageKey = "NEW";
                highlightSelectedPage();
              }
            })
            .catch(function(err) {
              log('Error deleting page ' + pageKey + ': ' + err);
              memoLib.showToastError("Failed to delete page: " + (err.message || err));
            });
        }

        saveOrUpdateBtn.addEventListener('click', function() {
          if (currentPageKey === "NEW") {
            const newTitle = titleInput.value.trim();
            const content = contentEditor.value;
            if (!newTitle) {
              alert("新規ページタイトルを入力してください。");
            } else {
              const newKey = "page" + (pages.length + 1);
              pages.push({ key: newKey, title: newTitle });
              updatePageList()
                .then(function() {
                  renderPageList();
                  return setPageContent(newKey, content);
                })
                .then(function() {
                  currentPageKey = newKey;
                  saveOrUpdateBtn.innerText = "UpDate";
                  highlightSelectedPage();
                })
                .catch(function(err) {
                  log("Error in saveAS sequence: " + err);
                  memoLib.showToastError("Failed to save new page: " + (err.message || err));
                });
            }
          } else {
            const content = contentEditor.value;
            setPageContent(currentPageKey, content)
              .then(function() {
                log("Page " + currentPageKey + " updated.");
                var found = pages.find(function(p) { return p.key === currentPageKey; });
                if (found && titleInput.value.trim() !== "") {
                  found.title = titleInput.value.trim();
                  renderPageList();
                }
              })
              .catch(function(err) {
                log("Error in UpDate sequence: " + err);
                memoLib.showToastError("Failed to update page: " + (err.message || err));
              });
          }
        });

        function showRegistrationUI() {
          log('No user token found. Auto-registering with username (email): ' + username);
          const regOverlay = document.createElement('div');
          regOverlay.classList.add('registration-overlay');
          container.appendChild(regOverlay);

          const regBox = document.createElement('div');
          regBox.classList.add('registration-box');
          regOverlay.appendChild(regBox);

          const regTitle = document.createElement('h2');
          regTitle.classList.add('reg-title');
          regTitle.innerText = 'Registering...';
          regBox.appendChild(regTitle);

          log('DEBUG: Sending registration request with username: ' + username);
          const regPayload = { command: 'register', user: username };
          const regPayloadStr = new URLSearchParams(regPayload).toString();
          fetch(servicePath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: regPayloadStr
          })
            .then(function(response) { return response.json(); })
            .then(function(data) {
              log('DEBUG: Received registration response: ' + JSON.stringify(data));
              if (data.token && data['sessionKey']) {
                userToken = data.token;
                sessionKey = data['sessionKey'];
                localStorage.setItem('user_token', userToken);
                localStorage.setItem('session_key', sessionKey);
                log('Registration successful. Token: ' + userToken);
                if (container.contains(regOverlay)) {
                  container.removeChild(regOverlay);
                }
                showAppUI();
              } else {
                log('Registration failed: ' + JSON.stringify(data));
                if (container.contains(regOverlay)) {
                  container.removeChild(regOverlay);
                }
                showSessionInvalidPane(username, password);
              }
            })
            .catch(function(err) {
              log('Registration error: ' + err);
              if (container.contains(regOverlay)) {
                container.removeChild(regOverlay);
              }
              memoLib.showToastError("Registration failed: " + (err.message || err));
            });
        }

        function showAppUI() {
          log('Launching main app UI.');
          loadPageList();
          titleInput.value = "";
          contentEditor.value = "";
          saveOrUpdateBtn.innerText = "saveAS";
        }

        if (!userToken) {
          showRegistrationUI();
        } else {
          log('User token found: ' + userToken);
          showAppUI();
        }
      })
      .catch(function(e) {
        memoLib.ShowError("Failed to decrypt service path.");
      });
  }

  window.addEventListener('load', function() {
    if (localStorage.getItem('service_path')) {
      showLoginScreen();
    } else {
      showRegistrationScreen();
    }
  });
})();

