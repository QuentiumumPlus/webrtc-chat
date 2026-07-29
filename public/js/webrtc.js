class WebRTCManager {
  constructor() {
    this.peers = new Map();
    this.localStream = null;
    this.dataChannels = new Map();
    this.onSignal = null;
    this.onMessage = null;
    this.onFile = null;
    this.onCallEnd = null;
    this.onRemoteStream = null;
  }

  createPeerConnection(peerId) {
    if (this.peers.has(peerId)) {
      try { this.peers.get(peerId).close(); } catch (e) {}
      this.peers.delete(peerId);
      this.dataChannels.delete(peerId);
    }

    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ]
    };

    const peer = new RTCPeerConnection(config);
    this.peers.set(peerId, peer);

    // Local stream'deki track'leri ekle
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        peer.addTrack(track, this.localStream);
      });
    }

    // Remote stream geldiginde
    peer.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        const remoteVideo = document.getElementById('remote-video');
        if (remoteVideo) {
          remoteVideo.srcObject = event.streams[0];
        }
        if (this.onRemoteStream) this.onRemoteStream(event.streams[0]);
      }
    };

    // ICE candidate
    peer.onicecandidate = (event) => {
      if (event.candidate && this.onSignal) {
        this.onSignal(peerId, 'ice', { candidate: event.candidate });
      }
    };

    // Connection state
    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.endCall(peerId);
      }
    };

    peer.oniceconnectionstatechange = () => {
      const state = peer.iceConnectionState;
      if (state === 'failed') {
        this.restartIce(peerId);
      } else if (state === 'disconnected') {
        // Biraz bekle, belki düzelir
        setTimeout(() => {
          if (peer.iceConnectionState === 'disconnected') {
            this.endCall(peerId);
          }
        }, 5000);
      }
    };

    // Data channel
    peer.ondatachannel = (event) => {
      this.setupChannel(peerId, event.channel);
    };

    const ch = peer.createDataChannel('chat', { ordered: true });
    this.setupChannel(peerId, ch);

    return peer;
  }

  restartIce(peerId) {
    const peer = this.peers.get(peerId);
    if (peer && peer.signalingState === 'stable') {
      peer.createOffer({ iceRestart: true }).then(offer => {
        peer.setLocalDescription(offer);
        this.onSignal(peerId, 'offer', { offer });
      }).catch(e => console.error('ICE restart error:', e));
    }
  }

  setupChannel(peerId, ch) {
    ch.onopen = () => {
      this.dataChannels.set(peerId, ch);
    };
    ch.onclose = () => {
      this.dataChannels.delete(peerId);
    };
    ch.onerror = (e) => {
      console.error('Data channel error:', e);
    };
    ch.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === 'message' && this.onMessage) this.onMessage(d);
        else if (d.type === 'file' && this.onFile) this.onFile(d);
      } catch (err) {
        console.error('Channel parse error:', err);
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
      } catch (e) { return false; }
    }
    return false;
  }

  sendFile(peerId, info) {
    const ch = this.dataChannels.get(peerId);
    if (ch && ch.readyState === 'open') {
      try {
        ch.send(JSON.stringify({ type: 'file', ...info }));
        return true;
      } catch (e) { return false; }
    }
    return false;
  }

  async getLocalStream(audio, video) {
    try {
      // Once mevcut stream'i temizle
      if (this.localStream) {
        this.localStream.getTracks().forEach(t => t.stop());
      }

      const constraints = {
        audio: audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        } : false,
        video: video ? {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        } : false
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Local video'yu goster
      const lv = document.getElementById('local-video');
      if (lv && video) {
        lv.srcObject = this.localStream;
      }

      // Mevcut peer'lere track ekle
      this.peers.forEach(peer => {
        this.localStream.getTracks().forEach(track => {
          const senders = peer.getSenders();
          const existing = senders.find(s => s.track && s.track.kind === track.kind);
          if (existing) {
            existing.replaceTrack(track);
          } else {
            peer.addTrack(track, this.localStream);
          }
        });
      });

      return this.localStream;
    } catch (e) {
      console.error('getUserMedia error:', e);
      throw e;
    }
  }

  toggleAudio() {
    if (this.localStream) {
      const t = this.localStream.getAudioTracks()[0];
      if (t) {
        t.enabled = !t.enabled;
        return t.enabled;
      }
    }
    return false;
  }

  toggleVideo() {
    if (this.localStream) {
      const t = this.localStream.getVideoTracks()[0];
      if (t) {
        t.enabled = !t.enabled;
        return t.enabled;
      }
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
