class WebRTCManager {
  constructor() {
    this.peers = new Map();
    this.localStream = null;
    this.dataChannels = new Map();
    this.onSignal = null;
    this.onMessage = null;
    this.onFile = null;
    this.onCallEnd = null;
  }

  createPeerConnection(peerId) {
    // Eski peer'i temizle
    if (this.peers.has(peerId)) {
      this.peers.get(peerId).close();
      this.peers.delete(peerId);
      this.dataChannels.delete(peerId);
    }

    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });
    this.peers.set(peerId, peer);

    peer.onicecandidate = e => {
      if (e.candidate && this.onSignal) {
        this.onSignal(peerId, 'ice', { candidate: e.candidate });
      }
    };

    peer.ontrack = e => {
      const v = document.getElementById('remote-video');
      if (v && e.streams[0]) v.srcObject = e.streams[0];
    };

    peer.ondatachannel = e => this.setupChannel(peerId, e.channel);

    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.endCall(peerId);
      }
    };

    peer.oniceconnectionstatechange = () => {
      const state = peer.iceConnectionState;
      if (state === 'failed' || state === 'disconnected') {
        this.endCall(peerId);
      }
    };

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => peer.addTrack(t, this.localStream));
    }

    const ch = peer.createDataChannel('chat', { ordered: true });
    this.setupChannel(peerId, ch);

    return peer;
  }

  setupChannel(peerId, ch) {
    ch.onopen = () => {
      this.dataChannels.set(peerId, ch);
    };
    ch.onclose = () => {
      this.dataChannels.delete(peerId);
    };
    ch.onerror = e => {
      console.error('Data channel error:', e);
    };
    ch.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === 'message' && this.onMessage) this.onMessage(d);
        else if (d.type === 'file' && this.onFile) this.onFile(d);
      } catch (err) {
        console.error('Channel message parse error:', err);
      }
    };
    if (ch.readyState === 'open') {
      this.dataChannels.set(peerId, ch);
    }
  }

  sendMessage(peerId, msg) {
    const ch = this.dataChannels.get(peerId);
    if (ch && ch.readyState === 'open') {
      try {
        ch.send(JSON.stringify({ type: 'message', content: msg, timestamp: Date.now() }));
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  sendFile(peerId, info) {
    const ch = this.dataChannels.get(peerId);
    if (ch && ch.readyState === 'open') {
      try {
        ch.send(JSON.stringify({ type: 'file', ...info }));
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  async getLocalStream(audio, video) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio, video });
      const lv = document.getElementById('local-video');
      if (lv && video) lv.srcObject = this.localStream;
      this.peers.forEach(p => {
        this.localStream.getTracks().forEach(t => p.addTrack(t, this.localStream));
      });
      return this.localStream;
    } catch (e) {
      throw e;
    }
  }

  toggleAudio() {
    const t = this.localStream?.getAudioTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      return t.enabled;
    }
    return false;
  }

  toggleVideo() {
    const t = this.localStream?.getVideoTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      return t.enabled;
    }
    return false;
  }

  endCall(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      try { peer.close(); } catch (e) {}
      this.peers.delete(peerId);
    }
    this.dataChannels.delete(peerId);
    if (!this.peers.size) this.stopStream();
    if (this.onCallEnd) this.onCallEnd();
  }

  stopStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    const lv = document.getElementById('local-video');
    const rv = document.getElementById('remote-video');
    if (lv) lv.srcObject = null;
    if (rv) rv.srcObject = null;
  }

  endAllCalls() {
    this.peers.forEach(p => {
      try { p.close(); } catch (e) {}
    });
    this.peers.clear();
    this.dataChannels.clear();
    this.stopStream();
  }
}

window.WebRTCManager = WebRTCManager;
