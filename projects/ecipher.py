#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
### 概要

ご要望の通り、2つの異なるパスワードのいずれか一方でデータを復号できる仕組みを構築します。

これは、以下の流れで実現されます。

1.  **暗号化時**:
    * 元のデータを圧縮します。
    * 2つのパスワードから、それぞれ別々の暗号化キーを安全に生成します。
    * 圧縮したデータを、生成した2つのキーで個別に暗号化し、2つの暗号ブロックを作成します。このとき、どちらのパスワードに対応するブロックか識別できるように目印を付けます。
    * これら2つの暗号ブロックの順番をランダムに入れ替え、1つに結合します。
    * 最後に、全体をもう一度圧縮し、Base32形式の安全な文字列に変換します。

2.  **復号時**:
    * 入力された1つのパスワードから暗号化キーを生成します。
    * 暗号化文字列を元のデータ構造に復元し、2つの暗号ブロックに分離します。
    * どちらのブロックが手元のキーで復号できるか、順番に試行します。
    * 正しく復号できたブロックから元のデータを取り出します。

この方法により、2つのパスワードを持つユーザー（例えば、管理者と本人）が、それぞれ自分のパスワードで同じデータにアクセスできるようになります。

---

### 詳細な説明とプログラム

#### 1. 技術仕様

JavaScriptでの復号互換性を考慮し、以下の標準的で強力な技術を選定しました。

* **鍵導出関数 (KDF)**: **PBKDF2-HMAC-SHA256**
    * パスワードから安全に暗号化キーを生成します。単純なハッシュ化よりも総当たり攻撃に強いです。ご要望の「世の中で一番長いハッシュ値」という意図を汲み、現在主流で安全なSHA-256を反復利用するPBKDF2を採用します。
* **暗号化アルゴリズム**: **AES-256-GCM**
    * 現在最も信頼されている共通鍵暗号方式の一つです。データの機密性に加え、改ざんを検知する機能（認証付き暗号）も持ち合わせています。
* **圧縮アルゴリズム**: **zlib**
    * PythonとJavaScript（pako.jsライブラリ使用）で互換性のある、一般的な圧縮形式です。
* **エンコーディング**: **Base32**
    * ファイル名やURLなどで安全に使えるアルファベット大文字と数字で構成される文字列に変換します。

#### 2. データ構造

最終的に生成される文字列は、以下のようなデータ構造をBase32でエンコードしたものです。

`[全体の圧縮] -> [KDFソルトA | KDFソルトB | ブロック1の長さ | ブロック1 | ブロック2の長さ | ブロック2]`

* **KDFソルト**: パスワードからキーを生成する際に使うランダムな値。パスワードごとに用意します。
* **ブロック**: 各パスワードで暗号化されたデータの塊。中身は `[識別子 | Nonce | 認証タグ | 暗号文]` となっています。
    * **識別子**: どちらのパスワード用のブロックかを示す目印です。
    * **Nonce**: 暗号化の際に一度だけ使うランダムな値です。
    * **認証タグ**: データが改ざんされていないか検証するための値です。
"""

import os
import zlib
import base64
import random
import argparse
import sys

# --- pycryptodomeライブラリをインポート ---
from Crypto.Cipher import AES
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Hash import SHA256
from Crypto.Random import get_random_bytes

class DualPasswordCipher:
    """
    2つのパスワードのどちらでも復号できる暗号化・復号化を行うクラス。
    (バックエンドをpycryptodomeに変更)
    """
    # 定数定義 (変更なし)
    _KDF_SALT_SIZE = 16
    _AES_KEY_SIZE = 32  # 256-bit
    _AES_NONCE_SIZE = 12 # GCM推奨
    _AES_TAG_SIZE = 16 # GCMの認証タグは16バイト(128bit)
    _KDF_ITERATIONS = 100_000
    _IDENTIFIER_A = b'PWA_BLOCK'
    _IDENTIFIER_B = b'PWB_BLOCK'
    _IDENTIFIER_LEN = len(_IDENTIFIER_A)

    def encrypt(self, password_a: str, password_b: str, data: bytes) -> str:
        # このメソッドのフローは変更なし
        compressed_data = zlib.compress(data)
        kdf_salt_a = get_random_bytes(self._KDF_SALT_SIZE)
        block_a = self._create_block(password_a, compressed_data, kdf_salt_a, self._IDENTIFIER_A)
        kdf_salt_b = get_random_bytes(self._KDF_SALT_SIZE)
        block_b = self._create_block(password_b, compressed_data, kdf_salt_b, self._IDENTIFIER_B)
        
        blocks = [block_a, block_b]
        random.shuffle(blocks)
        
        payload = kdf_salt_a + kdf_salt_b
        for block in blocks:
            payload += len(block).to_bytes(4, 'big') + block
            
        final_compressed = zlib.compress(payload)
        return base64.b32encode(final_compressed).decode('ascii')

    def decrypt(self, password: str, encrypted_string: str) -> bytes:
        # 例外処理の型をpycryptodomeに合わせる以外、フローは変更なし
        try:
            compressed_payload = base64.b32decode(encrypted_string)
            payload = zlib.decompress(compressed_payload)
            
            kdf_salt_a = payload[0:self._KDF_SALT_SIZE]
            kdf_salt_b = payload[self._KDF_SALT_SIZE : self._KDF_SALT_SIZE * 2]
            
            blocks_payload = payload[self._KDF_SALT_SIZE * 2:]
            blocks_to_try = []
            offset = 0
            while offset < len(blocks_payload):
                block_len = int.from_bytes(blocks_payload[offset:offset+4], 'big')
                offset += 4
                blocks_to_try.append(blocks_payload[offset:offset+block_len])
                offset += block_len

            for block in blocks_to_try:
                identifier = block[:self._IDENTIFIER_LEN]
                
                if identifier == self._IDENTIFIER_A:
                    decrypted = self._try_decrypt_block(password, block, kdf_salt_a)
                    if decrypted is not None:
                        return zlib.decompress(decrypted)
                elif identifier == self._IDENTIFIER_B:
                    decrypted = self._try_decrypt_block(password, block, kdf_salt_b)
                    if decrypted is not None:
                        return zlib.decompress(decrypted)
            
            raise ValueError("Decryption failed. Invalid password or corrupted data.")
        except (zlib.error, ValueError, TypeError) as e:
            raise ValueError(f"Decryption failed. Invalid password or corrupted data. Reason: {e}") from e

    def _create_block(self, password: str, data: bytes, kdf_salt: bytes, identifier: bytes) -> bytes:
        """単一の暗号化ブロックを生成する (pycryptodome版)"""
        key = self._derive_key(password, kdf_salt)
        # GCMモードではNonce(一度しか使わない番号)が必須
        nonce = get_random_bytes(self._AES_NONCE_SIZE)
        cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
        ciphertext, tag = cipher.encrypt_and_digest(data)
        
        # [識別子 | Nonce | 暗号文 | 認証タグ] の順で結合して返す
        return identifier + nonce + ciphertext + tag

    def _try_decrypt_block(self, password: str, block: bytes, kdf_salt: bytes) -> bytes | None:
        """ブロックの復号を試行する (pycryptodome版)"""
        try:
            key = self._derive_key(password, kdf_salt)
            
            # ブロックから各パーツを切り出す
            offset = self._IDENTIFIER_LEN
            nonce = block[offset : offset + self._AES_NONCE_SIZE]
            offset += self._AES_NONCE_SIZE
            
            ciphertext_end = len(block) - self._AES_TAG_SIZE
            ciphertext = block[offset:ciphertext_end]
            tag = block[ciphertext_end:]

            cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
            # decrypt_and_verifyは復号と認証タグの検証を同時に行う
            # 失敗した場合はValueErrorを送出する
            return cipher.decrypt_and_verify(ciphertext, tag)
        except (ValueError, KeyError):
            # パスワードが違う、またはデータが破損している場合
            return None

    def _derive_key(self, password: str, salt: bytes) -> bytes:
        """PBKDF2を使ってパスワードからキーを導出する (pycryptodome版)"""
        return PBKDF2(
            password.encode('utf-8'),
            salt,
            dkLen=self._AES_KEY_SIZE,
            count=self._KDF_ITERATIONS,
            hmac_hash_module=SHA256
        )

# --- コマンドライン処理関数 (変更なし) ---
def encrypt_command(args):
    cipher = DualPasswordCipher()
    if args.input:
        with open(args.input, 'rb') as f: data = f.read()
    else:
        data = sys.stdin.buffer.read()
    encrypted_string = cipher.encrypt(args.password_a, args.password_b, data)
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f: f.write(encrypted_string)
        print(f"✅ Encryption successful. Output written to {args.output}", file=sys.stderr)
    else:
        sys.stdout.write(encrypted_string)

def decrypt_command(args):
    cipher = DualPasswordCipher()
    if args.input:
        with open(args.input, 'r', encoding='utf-8') as f: encrypted_string = f.read()
    else:
        encrypted_string = sys.stdin.read()
    try:
        decrypted_data = cipher.decrypt(args.password, encrypted_string.strip())
        if args.output:
            with open(args.output, 'wb') as f: f.write(decrypted_data)
            print(f"✅ Decryption successful. Output written to {args.output}", file=sys.stderr)
        else:
            sys.stdout.buffer.write(decrypted_data)
    except ValueError as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Encrypt or decrypt data. A file encrypted with two passwords can be decrypted by either one.", formatter_class=argparse.RawDescriptionHelpFormatter)
    subparsers = parser.add_subparsers(dest="command", required=True, help="Available commands")
    parser_encrypt = subparsers.add_parser("encrypt", help="Encrypt data with two passwords.")
    parser_encrypt.add_argument("--password-a", required=True, help="The first password.")
    parser_encrypt.add_argument("--password-b", required=True, help="The second password.")
    parser_encrypt.add_argument("-i", "--input", help="Input file path to encrypt. (Default: stdin)")
    parser_encrypt.add_argument("-o", "--output", help="Output file path for the encrypted data. (Default: stdout)")
    parser_encrypt.set_defaults(func=encrypt_command)
    parser_decrypt = subparsers.add_parser("decrypt", help="Decrypt data with a single password.")
    parser_decrypt.add_argument("--password", required=True, help="The password for decryption.")
    parser_decrypt.add_argument("-i", "--input", help="Input file path to decrypt. (Default: stdin)")
    parser_decrypt.add_argument("-o", "--output", help="Output file path for the decrypted data. (Default: stdout)")
    parser_decrypt.set_defaults(func=decrypt_command)
    if len(sys.argv) == 1:
        parser.print_help(sys.stderr)
        sys.exit(1)
    args = parser.parse_args()
    args.func(args)

if __name__ == '__main__':
    main()
