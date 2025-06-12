// decryptEncData_function.js

/**
 * 指定したパスワードを用いて、Base32エンコードされた暗号化文字列を復号します。
 * 復号成功時は、元の圧縮解除後のUint8Arrayを返し、失敗時はnullを返します。
 *
 * @param {string} password - 復号に使用するパスワード
 * @param {string} encryptedString - Base32エンコードされた暗号化文字列
 * @returns {Promise<Uint8Array|null>} 復号結果のUint8Array、もしくはエラー時は null
 */
async function decryptEncData(password, encryptedString) {
  try {
    // 定数の定義
    const KDF_SALT_SIZE   = 16;
    const AES_NONCE_SIZE  = 12;
    const KDF_ITERATIONS  = 100000;
    const IDENTIFIER_A_STR = 'PWA_BLOCK';
    const IDENTIFIER_B_STR = 'PWB_BLOCK';
    const IDENTIFIER_LEN  = IDENTIFIER_A_STR.length;
    const stringToUint8Array = (str) => new TextEncoder().encode(str);

    // 必要なライブラリがロードされているか確認
    if (typeof base32 === 'undefined' || typeof pako === 'undefined') {
      console.error("必要なライブラリ(base32.js, pako.js)が読み込まれていません。");
      return null;
    }

    // 1. Base32デコード & 圧縮解除
    const compressedPayload = base32.decode(encryptedString);
    const payload = pako.inflate(new Uint8Array(compressedPayload));

    // 2. KDFソルトの抽出
    const kdfSaltA = payload.slice(0, KDF_SALT_SIZE);
    const kdfSaltB = payload.slice(KDF_SALT_SIZE, KDF_SALT_SIZE * 2);
    const blocksPayload = payload.slice(KDF_SALT_SIZE * 2);
    const blocksToTry = [];
    let offset = 0;
    while (offset < blocksPayload.length) {
      const blockLen = new DataView(
        blocksPayload.buffer,
        blocksPayload.byteOffset + offset,
        4
      ).getUint32(0, false);  // big-endian
      offset += 4;
      blocksToTry.push(blocksPayload.slice(offset, offset + blockLen));
      offset += blockLen;
    }

    // 3. 各ブロックについて復号を試行
    for (const block of blocksToTry) {
      const identifierBytes = block.slice(0, IDENTIFIER_LEN);
      const identifierStr = new TextDecoder().decode(identifierBytes);
      let kdfSalt;
      if (identifierStr === IDENTIFIER_A_STR) kdfSalt = kdfSaltA;
      else if (identifierStr === IDENTIFIER_B_STR) kdfSalt = kdfSaltB;
      else continue;

      try {
        // PBKDF2を利用してAES-GCM鍵を生成
        const baseKey = await crypto.subtle.importKey(
          'raw',
          stringToUint8Array(password),
          { name: 'PBKDF2' },
          false,
          ['deriveKey']
        );
        const aesKey = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: kdfSalt, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
          baseKey,
          { name: 'AES-GCM', length: 256 },
          true,
          ['decrypt']
        );

        // Nonceと暗号文（認証タグ付き）の抽出
        const nonce = block.slice(IDENTIFIER_LEN, IDENTIFIER_LEN + AES_NONCE_SIZE);
        const ciphertextWithTag = block.slice(IDENTIFIER_LEN + AES_NONCE_SIZE);

        // 復号（失敗した場合は例外発生）
        const decryptedCompressed = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: nonce },
          aesKey,
          ciphertextWithTag
        );
        // 圧縮解除して復号データを返す
        return pako.inflate(new Uint8Array(decryptedCompressed));
      } catch (e) {
        // このブロックでの復号失敗は無視して次のブロックへ
        continue;
      }
    }
    // どのブロックでも復号できなかった場合は null を返す
    return null;
  } catch (err) {
    // 予期しないエラーが発生した場合も null を返す
    return null;
  }
}

// CommonJS形式でエクスポート（Node.jsなどで利用する場合）
if (typeof module !== "undefined" && module.exports) {
  module.exports = { decryptEncData };
}
