/*
  ※【注意】以下のコメントブロックは、このプロジェクトの重要な開発記録です。絶対に削除・変更しないでください。
  
  memo_lib.js - 共通ライブラリ（ユーティリティ／暗号化／ログ出力モジュール）
  -------------------------------------------------
  Version History:
  1.0 (2025-06-16):
    - memo.js (1.3) からユーティリティ関数、暗号化／復号ロジック、ログ出力機能、APIQueue モジュールを分離。
    - Base64変換ユーティリティ、エラーハンドリング関数、暗号化／復号関数、ログ出力の仕組みを集約。
    - 各モジュール間の依存関係を整理し、グローバル変数 window.memoLib として公開。
*/

(function(window) {
  "use strict";
  
  // ── 共通エラーハンドリング関数 ─────────────────────────────
  function handleError(err, customMessage) {
    const message = customMessage ? customMessage + ": " : "An error occurred: ";
    console.error(message, err);
    showToastError(message + (err.message || err));
  }
  
  // ── エラートースト通知 ─────────────────────────────
  function showToastError(message) {
    const toast = document.createElement('div');
    toast.className = 'error-toast';
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
    toast.style.color = '#fff';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '5px';
    toast.style.zIndex = '2000';
    toast.style.fontFamily = "'Press Start 2P', cursive";
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.5s';
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 500);
    }, 3000);
  }
  
  // ── エラー表示用UI ─────────────────────────────
  function ShowError(error_message, title = "ERRor!") {
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
        .error-container {
          text-align: center;
          background-color: #222;
          padding: 30px;
          border: 4px solid #f00;
          border-radius: 10px;
          box-shadow: 0 0 20px #f00;
          animation: shake 0.5s;
        }
        @keyframes shake {
          0% { transform: translateX(0); }
          20% { transform: translateX(-10px); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-10px); }
          80% { transform: translateX(10px); }
          100% { transform: translateX(0); }
        }
      </style>
      <div class="error-container">
        <h1>💥 ${title} 💣</h1>
        <p>${error_message}</p>
      </div>
    `;
  }
  
  // ── APIQueue モジュール ─────────────────────────────
  const APIQueue = (function () {
    let queue = Promise.resolve();
    return {
      enqueue(requestFunc) {
        queue = queue.then(() => requestFunc());
        return queue;
      },
      reset() {
        queue = Promise.resolve();
      }
    };
  })();
  
  // ── Base64変換ユーティリティ ─────────────────────────────
  function uint8ToBase64(uint8Arr) {
    const CHUNK_SIZE = 0x8000;
    let index = 0;
    let result = '';
    while (index < uint8Arr.length) {
      let slice = uint8Arr.subarray(index, Math.min(index + CHUNK_SIZE, uint8Arr.length));
      result += String.fromCharCode.apply(null, slice);
      index += CHUNK_SIZE;
    }
    return window.btoa(result);
  }
  
  function base64ToUint8(base64Str) {
    const binary = window.atob(base64Str);
    const len = binary.length;
    let bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  
  // ── 暗号化／復号ロジック ─────────────────────────────
  function deriveEncryptionKey(password, salt) {
    var enc = new TextEncoder();
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
          ["encrypt"]
        );
      });
  }
  
  function deriveDecryptionKey(password, salt) {
    var enc = new TextEncoder();
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
          ["decrypt"]
        );
      });
  }
  
  function encryptText(plainText, password) {
    var enc = new TextEncoder();
    var salt = window.crypto.getRandomValues(new Uint8Array(16));
    var iv = window.crypto.getRandomValues(new Uint8Array(12));
    var plainBytes = enc.encode(plainText);
    return deriveEncryptionKey(password, salt)
      .then(function(key) {
        return window.crypto.subtle.encrypt(
          { name: "AES-GCM", iv: iv, tagLength: 128 },
          key,
          plainBytes
        );
      })
      .then(function(encrypted) {
        var encryptedArray = new Uint8Array(encrypted);
        var dataObj = {
          salt: uint8ToBase64(salt),
          iv: uint8ToBase64(iv),
          data: uint8ToBase64(encryptedArray)
        };
        var json = JSON.stringify(dataObj);
        var result = window.btoa(json);
        return result;
      });
  }
  
  function decryptText(encryptedText, password) {
    var decoded;
    try {
      decoded = window.atob(encryptedText);
    } catch (e) {
      return Promise.reject(new Error("Base64 decode error: " + e.message));
    }
    var dataObj = JSON.parse(decoded);
    if (!dataObj.salt || !dataObj.iv || !dataObj.data) {
      return Promise.reject(new Error("暗号化データが不完全です。"));
    }
    var salt = base64ToUint8(dataObj.salt);
    var iv = base64ToUint8(dataObj.iv);
    var data = base64ToUint8(dataObj.data);
    return deriveDecryptionKey(password, salt)
      .then(function(key) {
        return window.crypto.subtle.decrypt(
          { name: "AES-GCM", iv: iv, tagLength: 128 },
          key,
          data
        );
      })
      .then(function(decrypted) {
        var textDecoder = new TextDecoder();
        return textDecoder.decode(decrypted);
      })
      .catch(function(e) {
        console.error("復号に失敗:", e);
        throw e;
      });
  }
  
  // ── ログ出力の仕組み ─────────────────────────────
  // (logContainer に差し込むシンプルな関数を生成)
  function initLogger(logContainer) {
    return function log(msg) {
      const p = document.createElement('div');
      p.textContent = new Date().toLocaleTimeString() + ' - ' + msg;
      logContainer.appendChild(p);
      logContainer.scrollTop = logContainer.scrollHeight;
      console.log(msg);
    };
  }
  
  // ── モジュールの公開 ─────────────────────────────
  window.memoLib = {
    handleError: handleError,
    showToastError: showToastError,
    ShowError: ShowError,
    APIQueue: APIQueue,
    uint8ToBase64: uint8ToBase64,
    base64ToUint8: base64ToUint8,
    deriveEncryptionKey: deriveEncryptionKey,
    deriveDecryptionKey: deriveDecryptionKey,
    encryptText: encryptText,
    decryptText: decryptText,
    initLogger: initLogger
  };
  
})(window);

