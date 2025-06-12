function play_music (music_id = 0) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  let audioCtx;
  let isPlaying = false; // 再生中フラグ

  // 音符と周波数のマッピング
  const notes = {
      'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
      'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
      'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
      'C6': 1046.50, 'D6': 1174.66, 'E6': 1318.51, 'F6': 1396.91, 'G6': 1567.98, 'A6': 1760.00
  };

  // PSG風の音を鳴らす関数 (ピコピコ感を強めるためアタックとディケイを短く)
  function playTone(audioContext, frequency, duration, waveform = 'square', gain = 0.5, delay = 0) {
      return new Promise(resolve => {
          const now = audioContext.currentTime;
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();

          oscillator.type = waveform;
          oscillator.frequency.setValueAtTime(frequency, now + delay);

          // ピコピコ感を強めるために短いADSR
          const attackTime = 0.005; // さらに短く
          const decayTime = 0.02; // 短く
          const sustainLevel = 0.6; // 少し低め
          const releaseTime = 0.05; // 短く

          gainNode.gain.setValueAtTime(0, now + delay);

          gainNode.gain.linearRampToValueAtTime(gain, now + delay + attackTime);
          gainNode.gain.exponentialRampToValueAtTime(gain * sustainLevel, now + delay + attackTime + decayTime);
          
          const noteEndTime = now + delay + duration;
          gainNode.gain.setValueAtTime(gain * sustainLevel, noteEndTime - releaseTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, noteEndTime);

          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);

          oscillator.start(now + delay);
          oscillator.stop(noteEndTime);

          oscillator.onended = () => {
              oscillator.disconnect();
              gainNode.disconnect();
              resolve();
          };
      });
  }

  // ピューンというレーザー音を鳴らす関数
  function playLaserSound(audioContext, startFreq, endFreq, duration, gain = 0.7, delay = 0) {
      return new Promise(resolve => {
          const now = audioContext.currentTime;
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();

          oscillator.type = 'square'; // レーザー音は矩形波で
          oscillator.frequency.setValueAtTime(startFreq, now + delay);
          oscillator.frequency.exponentialRampToValueAtTime(endFreq, now + delay + duration); // 周波数を急激に変化

          gainNode.gain.setValueAtTime(gain, now + delay);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + delay + duration); // 音量を減衰

          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);

          oscillator.start(now + delay);
          oscillator.stop(now + delay + duration + 0.01); // 少し余裕を持たせて停止

          oscillator.onended = () => {
              oscillator.disconnect();
              gainNode.disconnect();
              resolve();
          };
      });
  }

  // シャッ！というノイズを鳴らす関数
  function playShortNoise(audioContext, duration, gain = 0.3, delay = 0) {
      return new Promise(resolve => {
          const now = audioContext.currentTime;
          const sampleRate = audioContext.sampleRate;
          const frameCount = sampleRate * duration;
          const noiseBuffer = audioContext.createBuffer(1, frameCount, sampleRate);
          const output = noiseBuffer.getChannelData(0);

          for (let i = 0; i < frameCount; i++) {
              output[i] = Math.random() * 2 - 1; // ランダムな値でノイズを生成
          }

          const noiseSource = audioContext.createBufferSource();
          const gainNode = audioContext.createGain();

          noiseSource.buffer = noiseBuffer;
          gainNode.gain.setValueAtTime(gain, now + delay);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + delay + duration); // すぐに減衰

          noiseSource.connect(gainNode);
          gainNode.connect(audioContext.destination);

          noiseSource.start(now + delay);
          noiseSource.stop(now + delay + duration + 0.01);

          noiseSource.onended = () => {
              noiseSource.disconnect();
              gainNode.disconnect();
              resolve();
          };
      });
  }

  // 超速ファンキーピコピコ8bitミュージックのシーケンス
  async function playSuperFastFunky8bitMusic(audioContext) {
      const bpm = 240; // テンポを倍に (以前は120)
      const beatDuration = 60 / bpm; // 1拍の秒数

      // ベースライン (矩形波、低い音)
      const bassline = [
          { note: 'C3', duration: beatDuration * 0.5 }, { note: 'rest', duration: beatDuration * 0.5 },
          { note: 'F3', duration: beatDuration * 0.5 }, { note: 'rest', duration: beatDuration * 0.5 },
          { note: 'G3', duration: beatDuration * 0.5 }, { note: 'rest', duration: beatDuration * 0.5 },
          { note: 'C3', duration: beatDuration * 1.0 },
          
          { note: 'C3', duration: beatDuration * 0.5 }, { note: 'rest', duration: beatDuration * 0.5 },
          { note: 'F3', duration: beatDuration * 0.5 }, { note: 'rest', duration: beatDuration * 0.5 },
          { note: 'G3', duration: beatDuration * 0.5 }, { note: 'rest', duration: beatDuration * 0.5 },
          { note: 'C3', duration: beatDuration * 1.0 }
      ];

      // メロディ (矩形波、高い音) - よりピコピコ感を出すために高めの音も追加
      const melody = [
          { note: 'C5', duration: beatDuration * 0.25 }, { note: 'E5', duration: beatDuration * 0.25 },
          { note: 'G5', duration: beatDuration * 0.25 }, { note: 'F5', duration: beatDuration * 0.25 },
          { note: 'E5', duration: beatDuration * 0.25 }, { note: 'D5', duration: beatDuration * 0.25 },
          { note: 'C5', duration: beatDuration * 0.5 }, { note: 'G5', duration: beatDuration * 0.25 },
          
          { note: 'C5', duration: beatDuration * 0.25 }, { note: 'G5', duration: beatDuration * 0.25 },
          { note: 'A5', duration: beatDuration * 0.25 }, { note: 'G5', duration: beatDuration * 0.25 },
          { note: 'F5', duration: beatDuration * 0.25 }, { note: 'E5', duration: beatDuration * 0.25 },
          { note: 'D5', duration: beatDuration * 0.5 }, { note: 'C5', duration: beatDuration * 0.25 }
      ];

      let currentTime = audioContext.currentTime;
      const playPromises = [];

      // ベースラインの再生
      let bassTimeOffset = 0;
      for (const note of bassline) {
          if (note.note !== 'rest') {
              playPromises.push(playTone(audioContext, notes[note.note], note.duration, 'square', 0.6, bassTimeOffset));
          }
          bassTimeOffset += note.duration;
      }

      // メロディの再生
      let melodyTimeOffset = 0;
      for (let i = 0; i < melody.length; i++) {
          const note = melody[i];
          if (note.note !== 'rest') {
              playPromises.push(playTone(audioContext, notes[note.note], note.duration, 'square', 0.4, melodyTimeOffset));
          }
          // 特定のタイミングでレーザー音とノイズを挿入
          if (i === 3) { // 最初のフレーズの途中でピューン
              playPromises.push(playLaserSound(audioContext, notes['A6'], notes['C4'], beatDuration * 0.5, 0.8, melodyTimeOffset));
          }
          if (i === 10) { // 後半のフレーズの途中でシャッ！
              playPromises.push(playShortNoise(audioContext, 0.05, 0.2, melodyTimeOffset + beatDuration * 0.1));
          }
          melodyTimeOffset += note.duration;
      }
      
      // シーケンスの最後に短いレーザー音とノイズで締め
      playPromises.push(playLaserSound(audioContext, notes['C6'], notes['G4'], beatDuration * 0.5, 0.9, melodyTimeOffset));
      playPromises.push(playShortNoise(audioContext, 0.1, 0.3, melodyTimeOffset + beatDuration * 0.2));


      await Promise.all(playPromises);
      console.log("Super Fast Funky 8-bit Music sequence finished.");
  }

  // 明るいファンキーな8bitミュージックのシーケンス
  async function playSuperBrightFunky8bitMusic(audioContext) {
      const bpm = 260; // さらにテンポアップ！
      const beatDuration = 60 / bpm;
  
      // 明るいベースライン (長調のコード進行を意識)
      const brightBassline = [
          { note: 'C3', duration: beatDuration * 0.5 }, { note: 'rest', duration: beatDuration * 0.5 },
          { note: 'G3', duration: beatDuration * 0.5 }, { note: 'rest', duration: beatDuration * 0.5 },
          { note: 'A3', duration: beatDuration * 0.5 }, { note: 'rest', duration: beatDuration * 0.5 },
          { note: 'F3', duration: beatDuration * 1.0 },
  
          { note: 'C3', duration: beatDuration * 0.5 }, { note: 'rest', duration: beatDuration * 0.5 },
          { note: 'G3', duration: beatDuration * 0.5 }, { note: 'rest', duration: beatDuration * 0.5 },
          { note: 'A3', duration: beatDuration * 0.5 }, { note: 'rest', duration: beatDuration * 0.5 },
          { note: 'F3', duration: beatDuration * 1.0 }
      ];
  
      // 明るいメロディ (長調の音階で跳ねるような動き)
      const brightMelody = [
          { note: 'C5', duration: beatDuration * 0.25 }, { note: 'E5', duration: beatDuration * 0.25 },
          { note: 'G5', duration: beatDuration * 0.25 }, { note: 'C6', duration: beatDuration * 0.25 }, // 高音で明るさ強調
          { note: 'G5', duration: beatDuration * 0.25 }, { note: 'E5', duration: beatDuration * 0.25 },
          { note: 'C5', duration: beatDuration * 0.5 }, { note: 'G5', duration: beatDuration * 0.25 },
  
          { note: 'D5', duration: beatDuration * 0.25 }, { note: 'F5', duration: beatDuration * 0.25 },
          { note: 'A5', duration: beatDuration * 0.25 }, { note: 'D6', duration: beatDuration * 0.25 },
          { note: 'A5', duration: beatDuration * 0.25 }, { note: 'F5', duration: beatDuration * 0.25 },
          { note: 'D5', duration: beatDuration * 0.5 }, { note: 'A5', duration: beatDuration * 0.25 }
      ];
  
      let currentTime = audioContext.currentTime;
      const playPromises = [];
  
      let bassTimeOffset = 0;
      for (const note of brightBassline) {
          if (note.note !== 'rest') {
              playPromises.push(playTone(audioContext, notes[note.note], note.duration, 'square', 0.6, bassTimeOffset));
          }
          bassTimeOffset += note.duration;
      }
  
      let melodyTimeOffset = 0;
      for (const note of brightMelody) {
          if (note.note !== 'rest') {
              playPromises.push(playTone(audioContext, notes[note.note], note.duration, 'square', 0.4, melodyTimeOffset));
          }
          melodyTimeOffset += note.duration;
      }
  
      await Promise.all(playPromises);
      console.log("Super Bright Funky 8-bit Music sequence finished.");
  }

  // くらーいファンキーな8bitミュージックのシーケンス
  async function playDarkFunky8bitMusic(audioContext) {
      const bpm = 220; // 少しテンポを落として、重い雰囲気に
      const beatDuration = 60 / bpm;
  
      // 暗いベースライン (短調のコード進行を意識)
      const darkBassline = [
          { note: 'A3', duration: beatDuration * 0.75 }, { note: 'rest', duration: beatDuration * 0.25 },
          { note: 'D3', duration: beatDuration * 0.75 }, { note: 'rest', duration: beatDuration * 0.25 },
          { note: 'E3', duration: beatDuration * 0.75 }, { note: 'rest', duration: beatDuration * 0.25 },
          { note: 'A3', duration: beatDuration * 1.5 },
  
          { note: 'A3', duration: beatDuration * 0.75 }, { note: 'rest', duration: beatDuration * 0.25 },
          { note: 'D3', duration: beatDuration * 0.75 }, { note: 'rest', duration: beatDuration * 0.25 },
          { note: 'E3', duration: beatDuration * 0.75 }, { note: 'rest', duration: beatDuration * 0.25 },
          { note: 'A3', duration: beatDuration * 1.5 }
      ];
  
      // 暗いメロディ (短調の音階で、少し不穏な動き)
      const darkMelody = [
          { note: 'A4', duration: beatDuration * 0.5 }, { note: 'C5', duration: beatDuration * 0.5 },
          { note: 'D5', duration: beatDuration * 0.5 }, { note: 'E5', duration: beatDuration * 0.5 },
          { note: 'C5', duration: beatDuration * 0.5 }, { note: 'B4', duration: beatDuration * 0.5 }, // 半音下がるような動き
          { note: 'A4', duration: beatDuration * 1.0 },
  
          { note: 'G4', duration: beatDuration * 0.5 }, { note: 'B4', duration: beatDuration * 0.5 },
          { note: 'C5', duration: beatDuration * 0.5 }, { note: 'D5', duration: beatDuration * 0.5 },
          { note: 'B4', duration: beatDuration * 0.5 }, { note: 'A4', duration: beatDuration * 0.5 },
          { note: 'G4', duration: beatDuration * 1.0 }
      ];
  
      let currentTime = audioContext.currentTime;
      const playPromises = [];
  
      let bassTimeOffset = 0;
      for (const note of darkBassline) {
          if (note.note !== 'rest') {
              playPromises.push(playTone(audioContext, notes[note.note], note.duration, 'square', 0.6, bassTimeOffset));
          }
          bassTimeOffset += note.duration;
      }
  
      let melodyTimeOffset = 0;
      for (const note of darkMelody) {
          if (note.note !== 'rest') {
              playPromises.push(playTone(audioContext, notes[note.note], note.duration, 'square', 0.4, melodyTimeOffset));
          }
          melodyTimeOffset += note.duration;
      }
  
      await Promise.all(playPromises);
      console.log("Dark Funky 8-bit Music sequence finished.");
  }

  function play_actually () {
      if (isPlaying) {
          console.log("Already playing or waiting to stop.");
          return;
      }
  
      if (!audioCtx) {
          audioCtx = new AudioContext();
      }
  
      isPlaying = true;

      if (music_id == 0) {
        playSuperFastFunky8bitMusic(audioCtx).then(() => {
            isPlaying = false;
        }).catch(error => {
            console.error("Error playing music:", error);
            isPlaying = false;
        });

      } else if (music_id == 1) {
        playSuperBrightFunky8bitMusic(audioCtx).then(() => {
            isPlaying = false;
        }).catch(error => {
            console.error("Error playing music:", error);
            isPlaying = false;
        });
      } else {
        playDarkFunky8bitMusic(audioCtx).then(() => {
            isPlaying = false;
        }).catch(error => {
            console.error("Error playing music:", error);
            isPlaying = false;
        });
      }
  }
  
  play_actually ();
}
