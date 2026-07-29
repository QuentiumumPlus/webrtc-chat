class ChatApp {
  constructor() {
    this.user = null;
    this.users = [];
    this.webrtc = null;
    this.ui = new UIManager();
    this.activeCall = null;
    this.pollTimer = null;
    this.init();
  }

  init() {
    this.setupLogin();
    this.setupInput();
    this.setupCalls();
    this.setupWebRTC();
    window.app = this;
  }

  setupLogin() {
    this.ui.elements.loginForm.addEventListener('submit', e => {
      e.preventDefault();
      const name = this.ui.elements.usernameInput.value.trim();
      if (name) this.join(name);
    });
  }

  async join(username) {
    try {
      const r = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      this.user = await r.json();
      this.ui.showApp(this.user);
      this.startPoll();
    } catch (e) {
      console.error('Join error:', e);
      alert('Bağlantı hatası');
    }
  }

  startPoll() {
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), 1500);
  }

  async poll() {
    if (!this.user) return;
    try {
      const r = await fetch('/api/poll/' + this.user.id);
      const d = await r.json();
      if (d.users) {
        this.users = d.users;
        this.ui.updateUsers(d.users, this.user.id);
      }
      if (d.messages) {
        d.messages.forEach(m => this.handleSignal(m));
      }
    } catch (e) {}
  }

  async signal(to, type, data) {
    try {
      await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.user.id, to, type, data })
      });
    } catch (e) {}
  }

  async handleSignal(m) {
    if (m.from === this.user?.id) return;

    if (m.type === 'offer') {
      this.activeCall = { peerId: m.from, callerName: m.name, callType: m.data.callType, offer: m.data.offer };
      this.ui.showIncomingCall(m.name, m.avatar, m.data.callType);
    } else if (m.type === 'answer') {
      const peer = this.webrtc.peers.get(m.from);
      if (peer) await peer.setRemoteDescription(new RTCSessionDescription(m.data.answer));
    } else if (m.type === 'ice') {
      const peer = this.webrtc.peers.get(m.from);
      if (peer && m.data.candidate) await peer.addIceCandidate(new RTCIceCandidate(m.data.candidate));
    } else if (m.type === 'msg') {
      this.ui.addMessage({ id: m.id, senderId: m.from, senderName: m.name, content: m.data.content, type: 'text', timestamp: m.ts }, false, m.avatar);
    } else if (m.type === 'file') {
      this.ui.addMessage({ id: m.id, senderId: m.from, senderName: m.name, type: 'file', fileName: m.data.fileName, fileSize: m.data.fileSize, fileData: m.data.fileData, timestamp: m.ts }, false, m.avatar);
    } else if (m.type === 'reject' || m.type === 'end') {
      this.webrtc.endCall(m.from);
      this.ui.hideCallScreen();
      this.ui.hideIncomingCall();
      this.activeCall = null;
    }
  }

  setupWebRTC() {
    this.webrtc = new WebRTCManager(null);
    this.webrtc.onSignal = (peerId, type, data) => this.signal(peerId, type, data);
    this.webrtc.onMessage = d => {
      this.ui.addMessage({ id: Date.now().toString(), senderId: this.ui.currentChat, senderName: 'Peer', content: d.content, type: 'text', timestamp: d.timestamp }, false, null);
    };
    this.webrtc.onFile = d => {
      this.ui.addMessage({ id: d.id || Date.now().toString(), senderId: this.ui.currentChat, senderName: 'Peer', type: 'file', fileName: d.fileName, fileSize: d.fileSize, fileData: d.fileData, timestamp: d.timestamp }, false, null);
    };
    this.webrtc.onCallEnd = () => { this.ui.hideCallScreen(); this.ui.hideIncomingCall(); this.activeCall = null; };
  }

  setupInput() {
    this.ui.elements.sendBtn.addEventListener('click', () => this.send());
    this.ui.elements.messageInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!this.ui.elements.sendBtn.disabled) this.send(); }
    });
    this.ui.elements.fileInput.addEventListener('change', e => this.handleFiles(e.target.files));

    const dz = this.ui.elements.dropZone;
    const mc = document.querySelector('.main-content');
    mc.addEventListener('dragover', e => { e.preventDefault(); this.ui.showDropZone(); });
    dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) this.ui.hideDropZone(); });
    dz.addEventListener('drop', e => { e.preventDefault(); this.ui.hideDropZone(); this.handleFiles(e.dataTransfer.files); });
    mc.addEventListener('drop', e => e.preventDefault());
  }

  async send() {
    const content = this.ui.elements.messageInput.value.trim();
    if (!content || !this.ui.currentChat) return;
    const msg = { id: Date.now().toString(), senderId: this.user.id, senderName: this.user.username, content, type: 'text', timestamp: Date.now() };

    if (this.ui.currentChatType === 'user') {
      const sent = this.webrtc.sendMessage(this.ui.currentChat, content);
      if (!sent) await this.signal(this.ui.currentChat, 'msg', { content });
    }
    this.ui.addMessage(msg, true, this.user.avatar);
    this.ui.elements.messageInput.value = '';
    this.ui.autoResizeTextarea();
    this.ui.updateSendButton();
  }

  async handleFiles(files) {
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = async () => {
        const info = { fileName: file.name, fileSize: file.size, fileData: reader.result };
        if (this.ui.currentChatType === 'user') {
          const sent = this.webrtc.sendFile(this.ui.currentChat, info);
          if (!sent) await this.signal(this.ui.currentChat, 'file', info);
        }
        this.ui.addMessage({ id: Date.now().toString(), senderId: this.user.id, senderName: this.user.username, type: 'file', fileName: file.name, fileSize: file.size, timestamp: Date.now() }, true, this.user.avatar);
      };
      reader.readAsDataURL(file);
    }
  }

  setupCalls() {
    this.ui.elements.voiceCallBtn.addEventListener('click', () => this.startCall('voice'));
    this.ui.elements.videoCallBtn.addEventListener('click', () => this.startCall('video'));
    this.ui.elements.endCallBtn.addEventListener('click', () => this.endCall());
    this.ui.elements.muteBtn.addEventListener('click', () => { this.ui.elements.muteBtn.style.opacity = this.webrtc.toggleAudio() ? '1' : '0.5'; });
    this.ui.elements.cameraBtn.addEventListener('click', async () => {
      try { await this.webrtc.getLocalStream(true, true); } catch (e) {}
    });
    this.ui.elements.acceptCallBtn.addEventListener('click', () => this.acceptCall());
    this.ui.elements.rejectCallBtn.addEventListener('click', () => this.rejectCall());
    this.ui.elements.groupForm.addEventListener('submit', e => { e.preventDefault(); this.ui.hideGroupModal(); });
    this.ui.elements.createGroupBtn.addEventListener('click', () => this.ui.showGroupModal());
  }

  async startCall(type) {
    if (!this.ui.currentChat || this.ui.currentChatType !== 'user') return;
    try {
      await this.webrtc.getLocalStream(type === 'voice' || type === 'video', type === 'video');
      const peer = this.webrtc.createPeerConnection(this.ui.currentChat);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await this.signal(this.ui.currentChat, 'offer', { offer, callType: type });
      this.ui.showCallScreen(this.ui.elements.chatName.textContent, null, type);
      this.activeCall = { peerId: this.ui.currentChat, callType: type };
    } catch (e) { alert('Mikrofon/kamera erişimi reddedildi'); }
  }

  async acceptCall() {
    if (!this.activeCall) return;
    try {
      await this.webrtc.getLocalStream(true, this.activeCall.callType === 'video');
      const peer = this.webrtc.createPeerConnection(this.activeCall.peerId);
      await peer.setRemoteDescription(new RTCSessionDescription(this.activeCall.offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await this.signal(this.activeCall.peerId, 'answer', { answer });
      this.ui.hideIncomingCall();
      this.ui.showCallScreen(this.activeCall.callerName, null, this.activeCall.callType);
    } catch (e) {}
  }

  async rejectCall() {
    if (!this.activeCall) return;
    await this.signal(this.activeCall.peerId, 'reject', {});
    this.ui.hideIncomingCall();
    this.activeCall = null;
  }

  async endCall() {
    if (this.activeCall) {
      await this.signal(this.activeCall.peerId, 'end', {});
      this.webrtc.endCall(this.activeCall.peerId);
      this.activeCall = null;
    } else { this.webrtc.endAllCalls(); }
    this.ui.hideCallScreen();
  }
}

document.addEventListener('DOMContentLoaded', () => new ChatApp());
