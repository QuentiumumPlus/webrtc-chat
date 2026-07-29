class SoundManager {
  constructor() {
    this.ctx = null;
    this.init();
  }

  init() {
    // Audio context'i first user action'da ac
    const start = () => {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      document.removeEventListener('click', start);
      document.removeEventListener('touchstart', start);
    };
    document.addEventListener('click', start);
    document.addEventListener('touchstart', start);
  }

  ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Arama sesi (ring ring)
  playRingtone() {
    this.ensureCtx();
    const now = this.ctx.currentTime;

    const playBeep = (start, freq, dur) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.3, now + start + 0.05);
      gain.gain.linearRampToValueAtTime(0.3, now + start + dur - 0.05);
      gain.gain.linearRampToValueAtTime(0, now + start + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
    };

    // Ring ring pattern
    playBeep(0, 440, 0.3);
    playBeep(0.4, 440, 0.3);
    playBeep(1.5, 440, 0.3);
    playBeep(1.9, 440, 0.3);
  }

  // Baglanma sesi (tik tak)
  playConnecting() {
    this.ensureCtx();
    const now = this.ctx.currentTime;

    const beep = (start) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 600;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.2, now + start + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + start + 0.1);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + 0.1);
    };

    beep(0);
    beep(0.2);
    beep(0.4);
  }

  // Baglanti kuruldu (ding)
  playConnected() {
    this.ensureCtx();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523, now);
    osc.frequency.linearRampToValueAtTime(659, now + 0.1);
    osc.frequency.linearRampToValueAtTime(784, now + 0.2);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.2);
    gain.gain.linearRampToValueAtTime(0, now + 0.4);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  // Arama kapatildi (bip bip)
  playEndCall() {
    this.ensureCtx();
    const now = this.ctx.currentTime;

    const beep = (start) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 400;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.2, now + start + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + start + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + 0.15);
    };

    beep(0);
    beep(0.2);
  }

  // Mesaj sesi (ding)
  playMessage() {
    this.ensureCtx();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 800;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain.gain.linearRampToValueAtTime(0, now + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  // Gelen arama (ring ring - farkli)
  playIncomingRing() {
    this.ensureCtx();
    const now = this.ctx.currentTime;

    const playTone = (start, freq, dur) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.25, now + start + 0.03);
      gain.gain.linearRampToValueAtTime(0.25, now + start + dur - 0.03);
      gain.gain.linearRampToValueAtTime(0, now + start + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
    };

    playTone(0, 500, 0.2);
    playTone(0.25, 600, 0.2);
    playTone(0.5, 500, 0.2);
    playTone(0.75, 600, 0.2);
  }

  // Bildirim sesi
  playNotification() {
    this.ensureCtx();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain.gain.linearRampToValueAtTime(0, now + 0.15);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }
}

window.soundManager = new SoundManager();
