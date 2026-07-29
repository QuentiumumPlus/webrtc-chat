class UIManager {
  constructor() {
    this.elements = {};
    this.currentChat = null;
    this.currentChatType = null;
    this.typingTimeout = null;

    this.cacheElements();
    this.setupEventListeners();
  }

  cacheElements() {
    this.elements = {
      loginScreen: document.getElementById('login-screen'),
      loginForm: document.getElementById('login-form'),
      usernameInput: document.getElementById('username'),
      app: document.getElementById('app'),
      sidebar: document.getElementById('sidebar'),
      usersList: document.getElementById('users-list'),
      groupsList: document.getElementById('groups-list'),
      usersContainer: document.getElementById('users-container'),
      groupsContainer: document.getElementById('groups-container'),
      userCount: document.getElementById('user-count'),
      groupCount: document.getElementById('group-count'),
      myAvatar: document.getElementById('my-avatar'),
      myUsername: document.getElementById('my-username'),
      welcomeScreen: document.getElementById('welcome-screen'),
      chatScreen: document.getElementById('chat-screen'),
      chatAvatar: document.getElementById('chat-avatar'),
      chatName: document.getElementById('chat-name'),
      chatStatus: document.getElementById('chat-status'),
      messagesContainer: document.getElementById('messages-container'),
      messages: document.getElementById('messages'),
      messageInput: document.getElementById('message-input'),
      sendBtn: document.getElementById('send-btn'),
      typingIndicator: document.getElementById('typing-indicator'),
      typingUser: document.getElementById('typing-user'),
      voiceCallBtn: document.getElementById('voice-call-btn'),
      videoCallBtn: document.getElementById('video-call-btn'),
      fileBtn: document.getElementById('file-btn'),
      fileInput: document.getElementById('file-input'),
      dropZone: document.getElementById('drop-zone'),
      createGroupBtn: document.getElementById('create-group-btn'),
      groupModal: document.getElementById('group-modal'),
      groupForm: document.getElementById('group-form'),
      groupNameInput: document.getElementById('group-name'),
      groupMembersList: document.getElementById('group-members-list'),
      callScreen: document.getElementById('call-screen'),
      callAvatar: document.getElementById('call-avatar'),
      callName: document.getElementById('call-name'),
      callStatus: document.getElementById('call-status'),
      remoteVideo: document.getElementById('remote-video'),
      localVideo: document.getElementById('local-video'),
      muteBtn: document.getElementById('mute-btn'),
      cameraBtn: document.getElementById('camera-btn'),
      endCallBtn: document.getElementById('end-call-btn'),
      incomingCall: document.getElementById('incoming-call'),
      callerAvatar: document.getElementById('caller-avatar'),
      callerName: document.getElementById('caller-name'),
      callTypeText: document.getElementById('call-type-text'),
      acceptCallBtn: document.getElementById('accept-call-btn'),
      rejectCallBtn: document.getElementById('reject-call-btn')
    };
  }

  setupEventListeners() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    this.elements.messageInput.addEventListener('input', () => {
      this.autoResizeTextarea();
      this.updateSendButton();
    });

    this.elements.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (this.elements.sendBtn.disabled) return;
        this.elements.sendBtn.click();
      }
    });

    this.elements.fileBtn.addEventListener('click', () => {
      this.elements.fileInput.click();
    });

    this.elements.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.elements.dropZone.classList.add('dragover');
    });

    this.elements.dropZone.addEventListener('dragleave', () => {
      this.elements.dropZone.classList.remove('dragover');
    });

    this.elements.createGroupBtn.addEventListener('click', () => {
      this.showGroupModal();
    });

    this.elements.groupModal.querySelector('.modal-close').addEventListener('click', () => {
      this.hideGroupModal();
    });

    this.elements.groupModal.querySelector('.modal-overlay').addEventListener('click', () => {
      this.hideGroupModal();
    });
  }

  switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `${tabName}-list`);
    });
  }

  autoResizeTextarea() {
    const textarea = this.elements.messageInput;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  updateSendButton() {
    const hasContent = this.elements.messageInput.value.trim().length > 0;
    this.elements.sendBtn.disabled = !hasContent;
  }

  showLogin() {
    this.elements.loginScreen.classList.remove('hidden');
    this.elements.app.classList.add('hidden');
    this.elements.usernameInput.focus();
  }

  showApp(user) {
    this.elements.loginScreen.classList.add('hidden');
    this.elements.app.classList.remove('hidden');

    this.elements.myAvatar.style.background = user.avatar.color;
    this.elements.myAvatar.textContent = user.avatar.initial;
    this.elements.myUsername.textContent = user.username;
  }

  updateUsers(users, currentUserId) {
    this.elements.usersContainer.innerHTML = '';
    const others = users.filter(u => u.id !== currentUserId);
    this.elements.userCount.textContent = others.length;

    if (others.length === 0) {
      this.elements.usersContainer.innerHTML = `
        <div style="text-align:center; padding:40px 20px; color:var(--text-muted)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;margin:0 auto 12px;display:block;opacity:0.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <p style="font-size:13px">Henuz kimse yok</p>
          <p style="font-size:11px; margin-top:4px">Baska bir sekmede giris yapin</p>
        </div>
      `;
      return;
    }

    others.forEach(user => {
      const userEl = this.createUserElement(user);
      this.elements.usersContainer.appendChild(userEl);
    });
  }

  createUserElement(user) {
    const div = document.createElement('div');
    div.className = 'user-item';
    div.dataset.userId = user.id;

    div.innerHTML = `
      <div class="avatar" style="background: ${user.avatar.color}">
        ${user.avatar.initial}
        <div class="status-dot online"></div>
      </div>
      <div class="user-info">
        <div class="name">${this.escapeHtml(user.username)}</div>
        <div class="status">Çevrimiçi</div>
      </div>
    `;

    div.addEventListener('click', () => {
      this.selectChat(user.id, 'user', user.username, user.avatar);
    });

    return div;
  }

  updateGroups(groups) {
    this.elements.groupsContainer.innerHTML = '';
    this.elements.groupCount.textContent = groups.length;

    groups.forEach(group => {
      const groupEl = this.createGroupElement(group);
      this.elements.groupsContainer.appendChild(groupEl);
    });
  }

  createGroupElement(group) {
    const div = document.createElement('div');
    div.className = 'group-item';
    div.dataset.groupId = group.id;

    const memberCount = group.members.length;
    div.innerHTML = `
      <div class="avatar" style="background: linear-gradient(135deg, #6c5ce7, #00d2a0)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;color:white">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </div>
      <div class="group-info">
        <div class="name">${this.escapeHtml(group.name)}</div>
        <div class="status">${memberCount} üye</div>
      </div>
    `;

    div.addEventListener('click', () => {
      this.selectChat(group.id, 'group', group.name, null);
    });

    return div;
  }

  selectChat(id, type, name, avatar) {
    this.currentChat = id;
    this.currentChatType = type;

    document.querySelectorAll('.user-item, .group-item').forEach(el => {
      el.classList.remove('active');
    });

    if (type === 'user') {
      const userEl = document.querySelector(`[data-user-id="${id}"]`);
      if (userEl) userEl.classList.add('active');
    } else {
      const groupEl = document.querySelector(`[data-group-id="${id}"]`);
      if (groupEl) groupEl.classList.add('active');
    }

    this.elements.welcomeScreen.classList.add('hidden');
    this.elements.chatScreen.classList.remove('hidden');

    this.elements.chatName.textContent = name;

    if (type === 'user' && avatar) {
      this.elements.chatAvatar.style.background = avatar.color;
      this.elements.chatAvatar.textContent = avatar.initial;
      this.elements.chatStatus.textContent = 'Çevrimiçi';
      this.elements.chatStatus.className = 'status-text online';
    } else {
      this.elements.chatAvatar.style.background = 'linear-gradient(135deg, #6c5ce7, #00d2a0)';
      this.elements.chatAvatar.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;color:white"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
      this.elements.chatStatus.textContent = 'Grup sohbeti';
      this.elements.chatStatus.className = 'status-text';
    }

    this.elements.messages.innerHTML = '';
    this.elements.messageInput.focus();
  }

  addMessage(message, isSent, avatar) {
    const div = document.createElement('div');
    div.className = `message ${isSent ? 'sent' : 'received'}`;

    const time = new Date(message.timestamp).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const avatarHtml = avatar
      ? `<div class="message-avatar" style="background: ${avatar.color}">${avatar.initial}</div>`
      : '';

    const senderHtml = !isSent
      ? `<span class="message-sender">${this.escapeHtml(message.senderName)}</span>`
      : '';

    if (message.type === 'file') {
      div.innerHTML = `
        ${avatarHtml}
        <div class="message-content">
          <div class="message-header">
            ${senderHtml}
            <span class="message-time">${time}</span>
          </div>
          <div class="message-bubble file-message">
            <div class="file-attachment">
              <div class="file-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
              </div>
              <div class="file-info">
                <div class="file-name">${this.escapeHtml(message.fileName)}</div>
                <div class="file-size">${this.formatFileSize(message.fileSize)}</div>
              </div>
              <button class="file-download" onclick="window.app.downloadFile('${message.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>
            </div>
            <div class="message-time">${time}</div>
          </div>
        </div>
      `;
    } else {
      div.innerHTML = `
        ${avatarHtml}
        <div class="message-content">
          <div class="message-header">
            ${senderHtml}
            <span class="message-time">${time}</span>
          </div>
          <div class="message-bubble">${this.escapeHtml(message.content)}</div>
        </div>
      `;
    }

    this.elements.messages.appendChild(div);
    this.scrollToBottom();
  }

  showTyping(username) {
    this.elements.typingUser.textContent = username;
    this.elements.typingIndicator.classList.remove('hidden');
  }

  hideTyping() {
    this.elements.typingIndicator.classList.add('hidden');
  }

  showCallScreen(name, avatar, callType) {
    this.elements.callScreen.classList.remove('hidden');
    this.elements.callName.textContent = name;
    this.elements.callStatus.textContent = 'Aranıyor...';

    if (avatar) {
      this.elements.callAvatar.style.background = avatar.color;
      this.elements.callAvatar.textContent = avatar.initial;
    }
  }

  updateCallStatus(status) {
    this.elements.callStatus.textContent = status;
  }

  hideCallScreen() {
    this.elements.callScreen.classList.add('hidden');
  }

  showIncomingCall(name, avatar, callType) {
    this.elements.incomingCall.classList.remove('hidden');
    this.elements.callerName.textContent = name;
    this.elements.callTypeText.textContent = callType === 'video' ? 'Görüntülü arama...' : 'Sesli arama...';

    if (avatar) {
      this.elements.callerAvatar.style.background = avatar.color;
      this.elements.callerAvatar.textContent = avatar.initial;
    }
  }

  hideIncomingCall() {
    this.elements.incomingCall.classList.add('hidden');
  }

  showGroupModal() {
    this.elements.groupModal.classList.remove('hidden');
    this.elements.groupNameInput.focus();
  }

  hideGroupModal() {
    this.elements.groupModal.classList.add('hidden');
    this.elements.groupNameInput.value = '';
  }

  showDropZone() {
    this.elements.dropZone.classList.remove('hidden');
  }

  hideDropZone() {
    this.elements.dropZone.classList.add('hidden');
  }

  scrollToBottom() {
    this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

window.UIManager = UIManager;
