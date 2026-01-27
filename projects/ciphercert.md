### 1. セットアップ (WSL/Ubuntu)

まず、Torと必要なツールをインストールする。

```bash
# 1. パッケージの更新とインストール
sudo apt update
sudo apt install tor torsocks curl openssl python3-pip -y

# 2. OpenTimestampsクライアントのインストール
python3 -m pip install opentimestamps-client --break-system-packages

# 3. Torサービスの起動 (WSLだと自動起動しない場合があるため)
sudo service tor start

# 4. 【重要】Torが効いているか確認
# 生のIPと、Tor経由のIPが違うことを確認しろ。
echo "My Real IP: $(curl -s http://checkip.amazonaws.com)"
echo "Tor IP    : $(torsocks curl -s http://checkip.amazonaws.com)"

```

※ `Tor IP` が普段のプロバイダと違うIP（海外など）になっていれば準備完了だ。

---

### 2. DigiCert + OpenTimestamps による署名方法 via TOR

これを `.bashrc` に追記して `source ~/.bashrc` するか、スクリプトファイルとして保存してくれ。
全ての通信を `torsocks` でラップすることで、DigiCertサーバーとOTSカレンダーサーバーへのアクセスを匿名化する。

```bash
function timestamp_anon() {
    local TARGET="$1"
    
    if [ -z "$TARGET" ]; then
        echo "Usage: timestamp_anon <filename>"
        return 1
    fi

    echo "--- [1/3] Generating Request (Local) ---"
    # ローカル処理なのでTor不要
    openssl ts -query -data "$TARGET" -no_nonce -sha256 -cert -out "${TARGET}.tsq"

    echo "--- [2/3] Requesting Legal Timestamp from DigiCert (via Tor) ---"
    # 【Tor経由】DigiCertにTSQを投げ、TSR(署名)を受け取る
    # -s: Silent, --fail: エラー時終了
    torsocks curl -s --fail -H "Content-Type: application/timestamp-query" \
         --data-binary @"${TARGET}.tsq" \
         "http://timestamp.digicert.com" -o "${TARGET}.tsr"
    
    # 失敗チェック
    if [ ! -s "${TARGET}.tsr" ]; then
        echo "Error: Failed to fetch timestamp from DigiCert via Tor."
        rm "${TARGET}.tsq"
        return 1
    fi
    rm "${TARGET}.tsq"
    echo "Success: Created ${TARGET}.tsr (DigiCert Signed)"

    echo "--- [3/3] Stamping to Blockchain (via Tor) ---"
    # 【Tor経由】TSRファイルのハッシュをOTSサーバーに登録
    torsocks ots stamp "${TARGET}.tsr"
    
    echo "--- Done! All traces covered. ---"
    echo "Generated:"
    echo "1. ${TARGET}.tsr      (Legal Proof)"
    echo "2. ${TARGET}.tsr.ots  (Blockchain Proof)"
}

```

**実行方法:**

```bash
timestamp_anon 秘密の契約書.pdf

```

---

### 3. DigiCert検証方法 (基本ローカル)

DigiCertの署名検証は、基本的に**ローカルにあるルート証明書**を使って計算するだけなので、通信は発生しない。つまりTorを使うまでもなく安全だ。

```bash
# 検証コマンド (通信なし)
openssl ts -verify -in 秘密の契約書.pdf.tsr -data 秘密の契約書.pdf -CApath /etc/ssl/certs/

```

※ もし「CRL（失効リスト）」などをオンラインで確認する厳密な検証オプションを使う場合のみ、以下のようにTorを通す。

```bash
# 【Tor経由】厳密なオンライン検証が必要な場合
torsocks openssl ts -verify ... (オプション)

```

---

### 4. OpenTimestamps検証方法 via TOR

ここが重要だ。ブロックチェーンの証明を完了させるには、サーバーから「マークルパス（証明書）」をダウンロードする必要がある。これを生IPでやると、「いつ誰がそのファイルを検証しようとしたか」がバレる。

必ず `torsocks` を噛ませろ。

#### ステップ A: アップグレード (必須・Tor経由)

スタンプ直後は「未確定」だ。数時間〜翌日以降に、ブロックチェーン上の情報を取得して `.ots` ファイルを完成させる。

```bash
# 【Tor経由】カレンダーサーバーから証明データをDLして追記
torsocks ots upgrade 秘密の契約書.pdf.tsr.ots

```

※ これが成功すると、ファイルサイズが少し増える。

#### ステップ B: 検証 (ローカル)

アップグレードが済んだ `.ots` ファイルの検証はローカル計算のみで行われる。

```bash
# 検証 (通信なし)
ots verify 秘密の契約書.pdf.tsr.ots

```

出力に **"Success! Bitcoin block ..."** と出れば、ビットコインが存在する限り、そのファイルはその時刻に確実に存在したことが数学的に証明される。

---

### まとめ

1. **セットアップ:** `apt install tor torsocks`
2. **署名:** `torsocks curl` (DigiCert) + `torsocks ots stamp`
3. **完了化:** `torsocks ots upgrade` (後日実行)
