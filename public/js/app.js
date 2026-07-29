class ChatApp {
  constructor() {
    this.user = null;
    this.users = [];
    this.groups = [];
    this.webrtc = null;
    this.ui = new UIManager();
    this.activeCall = null;
    this.pollingInterval = null;
    this.signalQueue = [];

    this.init();
  }

  init() {
    this.setupLoginForm();
    this.setupMessageInput();
    this.setupFileHandling();
    this.setupCallButtons();
    this.setupWebRTC();
    window.app = this;
  }

  setupLoginForm() {
    this.ui.elements.loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = this.ui.elements.usernameInput.value.trim();
      if (username) {
        this.joinChat(username);
      }
    });
  }

  async joinChat(username) {
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      this.user = await response.json();
      this.ui.showApp(this.user);
      this.startPolling();
    } catch (error) {
      console.error('Giriş hatası:', error);
    }
  }

  startPolling() {
    this.poll();
    this.pollingInterval = setInterval(() => this.poll(), 1500);
  }

  async poll() {
    if (!this.user) return;

    try {
      const response = await fetch(`/api/poll/${this.user.id}`);
      const data = await response.json();

      if (data.users) {
        this.users = data.users;
        this.ui.updateUsers(data.users, this.user.id);
      }

      if (data.messages) {
        for (const msg of data.messages) {
          await this.handleSignalMessage(msg);
        }
      }
    } catch (error) {
      console.error('Polling hatası:', error);
    }
  }

  async handleSignalMessage(msg) {
    if (msg.senderId === this.user?.id) return;

    if (msg.type === 'offer') {
      this.activeCall = {
        peerId: msg.senderId,
        callerName: msg.senderName,
        callType: msg.signal.callType,
        offer: msg.signal.offer
      };
      this.ui.showIncomingCall(msg.senderName, msg.senderAvatar, msg.signal.callType);
    } else if (msg.type === 'answer') {
      const peer = this.webrtc.peers.get(msg.senderId);
      if (peer) {
        await peer.setRemoteDescription(new RTCSessionDescription(msg.signal.answer));
        this.ui.updateCallStatus('Bağlanıyor...');
      }
    } else if (msg.type === 'ice-candidate') {
      const peer = this.webrtc.peers.get(msg.senderId);
      if (peer && msg.signal.candidate) {
        await peer.addIceCandidate(new RTCIceCandidate(msg.signal.candidate));
      }
    } else if (msg.type === 'reject') {
      this.webrtc.endCall(msg.senderId);
      this.ui.hideCallScreen();
      this.activeCall = null;
    } else if (msg.type === 'end') {
      this.webrtc.endCall(msg.senderId);
      this.ui.hideCallScreen();
      this.activeCall = null;
    } else if (msg.type === 'message') {
      const sender = this.users.find(u => u.id === msg.senderId);
      const avatar = sender?.avatar || msg.senderAvatar;
      this.ui.addMessage({
        id: msg.id,
        senderId: msg.senderId,
        senderName: msg.senderName,
        content: msg.signal.content,
        type: 'text',
        timestamp: msg.timestamp
      }, false, avatar);
    } else if (msg.type === 'file') {
      const sender = this.users.find(u => u.id === msg.senderId);
      const avatar = sender?.avatar || msg.senderAvatar;
      this.ui.addMessage({
        id: msg.id,
        senderId: msg.senderId,
        senderName: msg.senderName,
        type: 'file',
        fileName: msg.signal.fileName,
        fileSize: msg.signal.fileSize,
        fileData: msg.signal.fileData,
        timestamp: msg.timestamp
      }, false, avatar);
    }
  }

  async sendSignal(targetId, type, signal) {
    try {
      await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: this.user.id,
          targetId,
          type,
          signal
        })
      });
    } catch (error) {
      console.error('Signal gönderme hatası:', error);
    }
  }

  setupWebRTC() {
    this.webrtc = new WebRTCManager({ emit: (event, data) => {} });

    this.webrtc.onSignal = (targetId, type, signal) => {
      this.sendSignal(targetId, type, signal);
    };

    this.webrtc.onMessage = (data) => {
      this.ui.addMessage({
        id: Date.now().toString(),
        senderId: this.ui.currentChat,
        senderName: 'Peer',
        content: data.content,
        type: 'text',
        timestamp: data.timestamp
      }, false, null);
    };

    this.webrtc.onFile = (data) => {
      this.ui.addMessage({
        id: data.id || Date.now().toString(),
        senderId: this.ui.currentChat,
        senderName: 'Peer',
        type: 'file',
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileData: data.fileData,
        timestamp: data.timestamp
      }, false, null);
    };

    this.webrtc.onCallEnd = () => {
      this.ui.hideCallScreen();
      this.ui.hideIncomingCall();
      this.activeCall = null;
    };
  }

  setupMessageInput() {
    this.ui.elements.sendBtn.addEventListener('click', () => {
      this.sendMessage();
    });

    this.ui.elements.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!this.ui.elements.sendBtn.disabled) {
          this.sendMessage();
        }
      }
    });
  }

  async sendMessage() {
    const content = this.ui.elements.messageInput.value.trim();
    if (!content || !this.ui.currentChat) return;

    const message = {
      id: Date.now().toString(),
      senderId: this.user.id,
      senderName: this.user.username,
      content,
      type: 'text',
      timestamp: Date.now()
    };

    if (this.ui.currentChatType === 'user') {
      const sent = this.webrtc.sendMessage(this.ui.currentChat, content);
      if (sent) {
        this.ui.addMessage(message, true, this.user.avatar);
      } else {
        await this.sendSignal(this.ui.currentChat, 'message', { content });
        this.ui.addMessage(message, true, this.user.avatar);
      }
    } else if (this.ui.currentChatType === 'group') {
      this.ui.addMessage(message, true, this.user.avatar);
    }

    this.ui.elements.messageInput.value = '';
    this.ui.autoResizeTextarea();
    this.ui.updateSendButton();
  }

  setupFileHandling() {
    this.ui.elements.fileInput.addEventListener('change', (e) => {
      this.handleFiles(e.target.files);
    });

    const dropZone = this.ui.elements.dropZone;
    const mainContent = document.querySelector('.main-content');

    mainContent.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.ui.showDropZone();
    });

    dropZone.addEventListener('dragleave', (e) => {
      if (!dropZone.contains(e.relatedTarget)) {
        this.ui.hideDropZone();
      }
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.ui.hideDropZone();
      this.handleFiles(e.dataTransfer.files);
    });

    mainContent.addEventListener('drop', (e) => {
      e.preventDefault();
      this.ui.hideDropZone();
    });
  }

  async handleFiles(files) {
    for (const file of files) {
      await this.sendFile(file);
    }
  }

  async sendFile(file) {
    if (!this.ui.currentChat) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result;
      const fileInfo = {
        id: Date.now().toString(),
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileData: base64
      };

      if (this.ui.currentChatType === 'user') {
        const sent = this.webrtc.sendFile(this.ui.currentChat, fileInfo);
        if (!sent) {
          await this.sendSignal(this.ui.currentChat, 'file', {
            fileName: file.name,
            fileSize: file.size,
            fileData: base64
          });
        }
      }

      this.ui.addMessage({
        id: fileInfo.id,
        senderId: this.user.id,
        senderName: this.user.username,
        type: 'file',
        fileName: file.name,
        fileSize: file.size,
        timestamp: Date.now()
      }, true, this.user.avatar);
    };

    reader.readAsDataURL(file);
  }

  setupCallButtons() {
    this.ui.elements.voiceCallBtn.addEventListener('click', () => {
      this.startCall('voice');
    });

    this.ui.elements.videoCallBtn.addEventListener('click', () => {
      this.startCall('video');
    });

    this.ui.elements.endCallBtn.addEventListener('click', () => {
      this.endCurrentCall();
    });

    this.ui.elements.muteBtn.addEventListener('click', () => {
      const enabled = this.webrtc.toggleAudio();
      this.ui.elements.muteBtn.style.opacity = enabled ? '1' : '0.5';
    });

    this.ui.elements.cameraBtn.addEventListener('click', async () => {
      if (!this.webrtc.localStream) {
        try {
          await this.webrtc.getLocalStream(true, true);
          this.ui.elements.cameraBtn.style.opacity = '1';
        } catch (err) {
          console.error('Kamera erişimi reddedildi:', err);
        }
      } else {
        const enabled = this.webrtc.toggleVideo();
        this.ui.elements.cameraBtn.style.opacity = enabled ? '1' : '0.5';
      }
    });

    this.ui.elements.acceptCallBtn.addEventListener('click', () => {
      this.acceptIncomingCall();
    });

    this.ui.elements.rejectCallBtn.addEventListener('click', () => {
      this.rejectIncomingCall();
    });

    this.ui.elements.groupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.createGroup();
    });
  }

  async startCall(callType) {
    if (!this.ui.currentChat || this.ui.currentChatType !== 'user') return;

    try {
      await this.webrtc.getLocalStream(
        callType === 'voice' || callType === 'video',
        callType === 'video'
      );

      this.ui.showCallScreen(
        this.ui.elements.chatName.textContent,
        null,
        callType
      );

      const peer = this.webrtc.createPeerConnection(this.ui.currentChat);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      await this.sendSignal(this.ui.currentChat, 'offer', {
        offer,
        callType
      });

      this.activeCall = {
        peerId: this.ui.currentChat,
        callType
      };
    } catch (err) {
      console.error('Arama başlatılamadı:', err);
      alert('Mikrofon/kamera erişimi reddedildi');
    }
  }

  async acceptIncomingCall() {
    if (!this.activeCall) return;

    try {
      await this.webrtc.getLocalStream(
        this.activeCall.callType === 'voice' || this.activeCall.callType === 'video',
        this.activeCall.callType === 'video'
      );

      const peer = this.webrtc.createPeerConnection(this.activeCall.peerId);
      await peer.setRemoteDescription(new RTCSessionDescription(this.activeCall.offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      await this.sendSignal(this.activeCall.peerId, 'answer', { answer });

      this.ui.hideIncomingCall();
      this.ui.showCallScreen(
        this.activeCall.callerName,
        null,
        this.activeCall.callType
      );
      this.ui.updateCallStatus('Bağlandı');
    } catch (err) {
      console.error('Arama kabul edilemedi:', err);
    }
  }

  async rejectIncomingCall() {
    if (!this.activeCall) return;

    await this.sendSignal(this.activeCall.peerId, 'reject', {});
    this.ui.hideIncomingCall();
    this.activeCall = null;
  }

  async endCurrentCall() {
    if (this.activeCall) {
      await this.sendSignal(this.activeCall.peerId, 'end', {});
      this.webrtc.endCall(this.activeCall.peerId);
      this.activeCall = null;
    } else {
      this.webrtc.endAllCalls();
    }

    this.ui.hideCallScreen();
  }

  async createGroup() {
    const name = this.ui.elements.groupNameInput.value.trim();
    if (!name) return;

    const selectedMembers = [];
    document.querySelectorAll('#group-members-list input:checked').forEach(cb => {
      selectedMembers.push(cb.value);
    });

    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          members: selectedMembers,
          creatorId: this.user.id
        })
      });
      const group = await response.json();
      this.groups.push(group);
      this.ui.updateGroups(this.groups);
      this.ui.hideGroupModal();
      this.ui.selectChat(group.id, 'group', group.name, null);
    } catch (error) {
      console.error('Grup oluşturma hatası:', error);
    }
  }

  showGroupModal() {
    const membersList = this.ui.elements.groupMembersList;
    membersList.innerHTML = '';

    this.users.forEach(user => {
      if (user.id === this.user?.id) return;

      const label = document.createElement('label');
      label.className = 'member-option';
      label.innerHTML = `
        <input type="checkbox" value="${user.id}">
        <div class="avatar small" style="background: ${user.avatar.color}">${user.avatar.initial}</div>
        <span>${user.username}</span>
      `;
      membersList.appendChild(label);
    });

    this.ui.showGroupModal();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ChatApp();
});
