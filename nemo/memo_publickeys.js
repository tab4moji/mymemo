/*
  ※【注意】以下のコメントブロックは、このプロジェクトの重要な開発記録です。絶対に削除・変更しないでください.
  
  memo_publickeys.js - ハードコードされた暗号キー情報を格納する共通ライブラリ
  -------------------------------------------------
  Version History:
  1.0 (2025-06-16):
    - AES暗号化用のパスワードと公開鍵(JWK形式)をハードコードし、システムに組み込むための初版。
    - ユーザには入力させず、システム内部で利用するための定数として公開.
*/

(function(window) {
  "use strict";
  
  // ハードコードされたAES暗号化パスワード
  const aesPassword = "helloworld";
  
  // ハードコードされた公開鍵 (JWK形式)
  const publicKey = {
    "alg": "RS256",
    "e": "AQAB",
    "ext": true,
    "key_ops": [
      "verify"
    ],
    "kty": "RSA",
    "n": "r1iyZc0cm_yJRmjgVaOUpIcRlNuZFkFSaUdfRMuTGS2R16adIJMe33sMxZMVUro874RkY2wVU5dGrZ_Sq8e9GIqGOcd3meUpHFexn3b3Ang5WzBJGOvqPcweLtSFVTn-XahFyWrpOUtu3FfYAMTM6GMvCyHSzdyYu1FMCJjFbB2lzkxZSyoH2f3Ijf94ju4CJrLbtVHgrA7EV7uGlP1sq8LL9pLWzahm64QitcbXwCK0Wsxttgn-H5rMKR9yH1mMdGMYzPSYq8uXZj5HQMaPWVzSx7vzN_W_cNJN1yhboJgc1kGdITw_g-HA0wypbchh0onPR3pQhzq1GFp3DdQ_Pw"
  };
  
  window.memoPublicKeys = {
    aesPassword: aesPassword,
    publicKey: publicKey
  };
  
})(window);

