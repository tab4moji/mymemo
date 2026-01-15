### 1. WSL2 オーディオ開発の重要情報まとめ

Rustでの実験を通じて判明した、WSL2環境（WSLg / PulseAudio / PipeWireバックエンド）で安定して音を出すための条件は以下の通りだ。

* **ドライバ**: `ALSA` (libasound2) が利用可能。
* **バッファサイズの制約**:
* WSL2の仮想オーディオドライバは、**任意のバッファサイズ（フレーム数）を受け付けない**（`Invalid argument` になる）。
* **「2の累乗 (Power of 2)」** のサイズ（例: 512, 1024, 2048, 4096...）を強く好む。
* レイテンシ制御をする際は、msから計算した値を**最も近い2の累乗**に丸めてからドライバに要求する必要がある。


* **再生方式**: コールバック方式（Rustのcpal）または、ブロッキング書き込み（C言語の`snd_pcm_writei`）による「バケツリレー」方式が有効。

---

### 2. C言語による再現コード

Rustで実装したロジック（波形生成＋バッファサイズ調整）を、C言語とネイティブALSA APIを使って書き直した。

このプログラムは以下の動作をする。

1. 330Hz の波形を計算する（内部は `float` 計算）。
2. WSL2向けに**バッファサイズを2の累乗に補正**して要求する。
3. `int16_t` (S16_LE) 形式でステレオ出力する。
4. 2秒ごとに波形（ノコギリ波→矩形波→正弦波）を切り替える。

#### 事前準備

```bash
sudo apt install libasound2-dev

```

#### ソースコード: `wsl_synth.c`

```c
/*
 * WSL2 ALSA Synthesizer in C
 * * Features:
 * - 330Hz Saw/Square/Sine wave
 * - Blocking Write (Bucket Relay)
 * - Power-of-2 Buffer Negotiation for WSL2 stability
 */

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <math.h>
#include <alsa/asoundlib.h>
#include <unistd.h>

#define SAMPLE_RATE 44100
#define CHANNELS 2
#define TARGET_LATENCY_MS 50   // 目標レイテンシ
#define FREQUENCY 330.0f
#define VOLUME 0.2f

// 波形タイプ
typedef enum {
    WAVE_SINE,
    WAVE_SQUARE,
    WAVE_SAW
} WaveType;

// オシレーター構造体
typedef struct {
    float phase;
    float phase_inc;
    WaveType type;
} Oscillator;

// 最近傍の2の累乗を計算する関数 (WSL2対策)
unsigned int next_power_of_two(unsigned int v) {
    v--;
    v |= v >> 1;
    v |= v >> 2;
    v |= v >> 4;
    v |= v >> 8;
    v |= v >> 16;
    v++;
    return v;
}

// 波形の次のサンプルを取得
float next_sample(Oscillator *osc) {
    float value = 0.0f;
    
    // 位相を進める
    osc->phase += osc->phase_inc;
    if (osc->phase >= 1.0f) osc->phase -= 1.0f;

    switch (osc->type) {
        case WAVE_SINE:
            value = sinf(osc->phase * 2.0f * M_PI);
            break;
        case WAVE_SQUARE:
            value = (osc->phase < 0.5f) ? 1.0f : -1.0f;
            break;
        case WAVE_SAW:
            value = 2.0f * osc->phase - 1.0f;
            break;
    }
    return value;
}

int main() {
    int err;
    snd_pcm_t *handle;
    snd_pcm_hw_params_t *params;
    
    // 1. PCMデバイスを開く
    if ((err = snd_pcm_open(&handle, "default", SND_PCM_STREAM_PLAYBACK, 0)) < 0) {
        fprintf(stderr, "Error opening PCM device: %s\n", snd_strerror(err));
        return 1;
    }

    // 2. パラメータ設定領域の確保
    snd_pcm_hw_params_alloca(&params);
    snd_pcm_hw_params_any(handle, params);

    // インターリーブ・リード/ライト (バケツリレー)
    snd_pcm_hw_params_set_access(handle, params, SND_PCM_ACCESS_RW_INTERLEAVED);
    // フォーマット: Signed 16-bit Little Endian (最も互換性が高い)
    snd_pcm_hw_params_set_format(handle, params, SND_PCM_FORMAT_S16_LE);
    snd_pcm_hw_params_set_channels(handle, params, CHANNELS);
    
    unsigned int rate = SAMPLE_RATE;
    snd_pcm_hw_params_set_rate_near(handle, params, &rate, 0);

    // --- WSL2 特有のバッファサイズ調整 ---
    // 目標レイテンシからフレーム数を計算
    unsigned int target_frames = (rate * TARGET_LATENCY_MS) / 1000;
    
    // 2の累乗に補正 (例: 2205 -> 2048)
    // next_power_of_twoだと4096になるが、近い方を取るロジックにするか、
    // 安全側に倒して単純なPowerOf2を使う。ここでは計算した値以上のPowerOf2を使う。
    unsigned int pow2_frames = next_power_of_two(target_frames);
    // もし差が大きすぎれば一つ下げる (簡易的な Nearest Logic)
    if ((pow2_frames / 2) > 0 && (pow2_frames - target_frames) > (target_frames - pow2_frames / 2)) {
        pow2_frames /= 2;
    }

    // バッファサイズを設定
    snd_pcm_uframes_t buffer_size = pow2_frames;
    if ((err = snd_pcm_hw_params_set_buffer_size_near(handle, params, &buffer_size)) < 0) {
        fprintf(stderr, "Error setting buffer size: %s\n", snd_strerror(err));
        return 1;
    }

    // パラメータを適用
    if ((err = snd_pcm_hw_params(handle, params)) < 0) {
        fprintf(stderr, "Error setting HW params: %s\n", snd_strerror(err));
        return 1;
    }

    printf("ALSA Configured:\n");
    printf("  Rate: %d Hz\n", rate);
    printf("  Buffer Size: %lu frames (Request: %u frames)\n", buffer_size, pow2_frames);

    // 3. オシレーター準備
    Oscillator osc = {0};
    osc.phase = 0.0f;
    osc.phase_inc = FREQUENCY / (float)rate;
    osc.type = WAVE_SAW;

    // バッファ確保 (16bit stereo)
    // buffer_size 分を一気に書くか、小さく刻むかだが、
    // ここでは buffer_size の半分を1チャンクとして書き込む
    snd_pcm_uframes_t frames = buffer_size / 2;
    int16_t *buffer = (int16_t *)malloc(frames * CHANNELS * sizeof(int16_t));

    printf("Playing... (Ctrl+C to stop)\n");

    int counter = 0;
    
    // 4. 再生ループ
    while (1) {
        // バッファを埋める
        for (int i = 0; i < frames; i++) {
            float s = next_sample(&osc) * VOLUME;
            // Float (-1.0 ~ 1.0) -> Int16 (-32767 ~ 32767)
            int16_t val = (int16_t)(s * 32767.0f);
            
            // Stereo (L/R same)
            buffer[i * 2] = val;     // L
            buffer[i * 2 + 1] = val; // R
        }

        // ALSAへ書き込み (ブロッキング)
        err = snd_pcm_writei(handle, buffer, frames);
        
        // エラー処理 (Underrunなど)
        if (err == -EPIPE) {
            // Buffer Underrun
            snd_pcm_prepare(handle);
        } else if (err < 0) {
            fprintf(stderr, "Write error: %s\n", snd_strerror(err));
        }

        // 2秒ごとに波形切り替え (約44100/frames * 2 回ループ)
        counter++;
        int loops_per_sec = rate / frames;
        if (counter > loops_per_sec * 2) {
            counter = 0;
            if (osc.type == WAVE_SAW) {
                osc.type = WAVE_SQUARE;
                printf("Wave: Square\n");
            } else if (osc.type == WAVE_SQUARE) {
                osc.type = WAVE_SINE;
                printf("Wave: Sine\n");
            } else {
                osc.type = WAVE_SAW;
                printf("Wave: Sawtooth\n");
            }
        }
    }

    free(buffer);
    snd_pcm_close(handle);
    return 0;
}

```

### 3. コンパイルと実行

```bash
# ビルド
gcc wsl_synth.c -o wsl_synth_c -lasound -lm

# 実行
./wsl_synth_c

```
