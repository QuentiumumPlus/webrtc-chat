// ============ SOUND ============
const SFX = {
  ctx: null,
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  beep(freq, dur, vol = 0.2) {
    this.init();
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(); o.stop(this.ctx.currentTime + dur);
  },
  msg() { this.beep(800, 0.1, 0.1); },
  ring() { this.beep(440, 0.3); setTimeout(() => this.beep(440, 0.3), 400); },
  connect() { this.beep(523, 0.15); setTimeout(() => this.beep(659, 0.15), 100); setTimeout(() => this.beep(784, 0.2), 200); },
  end() { this.beep(400, 0.15); setTimeout(() => this.beep(300, 0.2), 200); },
  notify() { this.beep(660, 0.1, 0.1); }
};

// ============ STATE ============
let me = null;
let users = [];
let chatWith = null;
let chatType = null;
let webrtc = null;
let activeCall = null;
let ringTimer = null;

// ============ API ============
async function api(path, body) {
  const opt = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
  const r = await fetch('/api/' + path, opt);
  return r.json();
}

// ============ DOM ============
const $ = id => document.getElementById(id);
const show = el => el.classList.remove('hidden');
const hide = el => el.classList.add('hidden');

// ============ LOGIN ============
$('loginForm').onsubmit = async e => {
  e.preventDefault();
  const name = $('nameInput').value.trim();
  if (!name) return;
  me = await api('join', { username: name });
  if (me.error) return alert(me.error);
  SFX.notify();
  hide($('loginPage')); show($('appPage'));
  $('myInfo').textContent = me.username;
  startPoll();
};

// ============ POLLING ============
let pollId, sigId;
function startPoll() {
  poll(); pollId = setInterval(poll, 2000);
  sigPoll(); sigId = setInterval(sigPoll, 800);
}

async function poll() {
  if (!me) return;
  const d = await api('poll/' + me.id);
  if (d.error) return;
  users = d.users || [];
  renderUsers();
  if (d.messages) d.messages.forEach(handleSignal);
}

async function sigPoll() {
  if (!me) return;
  const d = await api('poll/' + me.id);
  if (d.error) return;
  if (d.messages && d.messages.length) d.messages.forEach(handleSignal);
}

// ============ USERS ============
function renderUsers() {
  const list = $('userList');
  const others = users.filter(u => u.id !== me.id);
  $('userCount').textContent = others.length + ' kisi';

  if (!others.length) {
    list.innerHTML = '<div class="no-users">Henuz kimse yok</div>';
    return;
  }

  list.innerHTML = others.map(u => `
    <div class="user-item ${chatWith === u.id ? 'active' : ''}" data-id="${u.id}">
      <div class="user-avatar" style="background:${u.avatar.c}">
        ${u.avatar.i}
        <div class="dot"></div>
      </div>
      <div>
        <div class="user-name">${esc(u.username)}</div>
        <div class="user-status">Cevrimici</div>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.user-item').forEach(el => {
    el.onclick = () => openChat(el.dataset.id);
  });
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ============ CHAT ============
function openChat(uid) {
  const u = users.find(x => x.id === uid);
  if (!u) return;
  chatWith = uid;
  chatType = 'user';
  hide($('emptyScreen')); show($('chatScreen'));
  $('chatUser').innerHTML = `<div class="user-avatar" style="background:${u.avatar.c};width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff">${u.avatar.i}</div> ${esc(u.username)}`;
  $('messages').innerHTML = '';
  renderUsers();
  $('msgInput').focus();
}

// ============ MESSAGES ============
$('btnSend').onclick = sendMsg;
$('msgInput').onkeydown = e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
};

async function sendMsg() {
  const txt = $('msgInput').value.trim();
  if (!txt || !chatWith) return;

  addMsg({ name: me.username, avatar: me.avatar, text: txt, sent: true, ts: Date.now() });
  $('msgInput').value = '';

  // WebRTC data channel ile dene
  if (webrtc && webrtc.send(chatWith, txt)) return;

  // Degilse signaling ile gonder
  await api('signal', { from: me.id, to: chatWith, type: 'msg', data: { content: txt } });
}

function addMsg(m) {
  const div = document.createElement('div');
  div.className = 'msg' + (m.sent ? ' sent' : '');
  const time = new Date(m.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  div.innerHTML = `
    <div class="msg-av" style="background:${m.avatar.c}">${m.avatar.i}</div>
    <div class="msg-body">
      <div class="msg-name">${esc(m.name)}</div>
      <div class="msg-text">${esc(m.text)}</div>
      <div class="msg-time">${time}</div>
    </div>
  `;
  $('messages').appendChild(div);
  $('messages').scrollTop = $('messages').scrollHeight;
}

// ============ SIGNAL HANDLER ============
async function handleSignal(m) {
  if (m.from === me.id) return;

  switch (m.type) {
    case 'msg':
      SFX.msg();
      if (chatWith === m.from) {
        addMsg({ name: m.name, avatar: m.avatar, text: m.data.content, sent: false, ts: m.ts });
      }
      break;

    case 'offer':
      activeCall = { peerId: m.from, name: m.name, type: m.data.callType, offer: m.data.offer };
      SFX.ring();
      ringTimer = setInterval(() => SFX.ring(), 1500);
      $('callerName').textContent = m.name;
      $('callerType').textContent = m.data.callType === 'video' ? 'Goruntulu Arama' : 'Sesli Arama';
      show($('incomingCall'));
      setTimeout(() => { if (activeCall && activeCall.peerId === m.from) rejectCall(); }, 25000);
      break;

    case 'answer':
      SFX.connect();
      if (webrtc && webrtc.peers[m.from]) {
        await webrtc.peers[m.from].setRemoteDescription(new RTCSessionDescription(m.data.answer));
        $('callStatus').textContent = 'Baglandi!';
      }
      break;

    case 'ice':
      if (webrtc && webrtc.peers[m.from] && m.data.candidate) {
        try { await webrtc.peers[m.from].addIceCandidate(new RTCIceCandidate(m.data.candidate)); } catch(e) {}
      }
      break;

    case 'reject': case 'end':
      SFX.end();
      stopRing();
      webrtc && webrtc.hangup(m.from);
      hide($('callScreen')); hide($('incomingCall'));
      activeCall = null;
      break;
  }
}

function stopRing() { if (ringTimer) { clearInterval(ringTimer); ringTimer = null; } }

// ============ FILE ============
$('btnFile').onclick = () => $('fileInput').click();
$('fileInput').onchange = e => { for (const f of e.target.files) sendFile(f); };

function sendFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    const data = { fileName: file.name, fileSize: file.size, fileData: reader.result };
    addMsg({ name: me.username, avatar: me.avatar, text: '📎 ' + file.name, sent: true, ts: Date.now() });
    if (chatWith) await api('signal', { from: me.id, to: chatWith, type: 'file', data });
  };
  reader.readAsDataURL(file);
}

// ============ WEBRTC ============
class P2P {
  constructor() { this.peers = {}; this.stream = null; this.ch = {}; }

  create(id) {
    if (this.peers[id]) this.hangup(id);
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    this.peers[id] = pc;

    // Track ekle
    if (this.stream) {
      this.stream.getTracks().forEach(t => pc.addTrack(t, this.stream));
    }

    // ICE
    pc.onicecandidate = e => {
      if (e.candidate) api('signal', { from: me.id, to: id, type: 'ice', data: { candidate: e.candidate } });
    };

    // Remote stream
    pc.ontrack = e => {
      if (e.streams[0]) $('remoteVideo').srcObject = e.streams[0];
    };

    // Data channel - gelen
    pc.ondatachannel = e => this.setupCh(id, e.channel);

    // Connection state
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') this.hangup(id);
    };

    // Data channel - giden
    const ch = pc.createDataChannel('chat', { ordered: true });
    this.setupCh(id, ch);

    return pc;
  }

  setupCh(id, ch) {
    ch.onopen = () => { this.ch[id] = ch; };
    ch.onclose = () => { delete this.ch[id]; };
    ch.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === 'msg') {
          SFX.msg();
          addMsg({ name: 'Peer', avatar: { i: '?', c: '#666' }, text: d.content, sent: false, ts: Date.now() });
        }
      } catch(err) {}
    };
  }

  send(id, msg) {
    const ch = this.ch[id];
    if (ch && ch.readyState === 'open') {
      ch.send(JSON.stringify({ type: 'msg', content: msg }));
      return true;
    }
    return false;
  }

  async getMedia(audio, video) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio, video });
      $('localVideo').srcObject = this.stream;
      return this.stream;
    } catch(e) { throw e; }
  }

  toggleAudio() {
    const t = this.stream?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; return t.enabled; }
    return false;
  }

  toggleVideo() {
    const t = this.stream?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; return t.enabled; }
    return false;
  }

  hangup(id) {
    if (this.peers[id]) { try { this.peers[id].close(); } catch(e) {} delete this.peers[id]; }
    delete this.ch[id];
    if (!Object.keys(this.peers).length) {
      if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
      $('remoteVideo').srcObject = null;
      $('localVideo').srcObject = null;
    }
  }

  hangupAll() {
    Object.keys(this.peers).forEach(id => this.hangup(id));
  }
}

// ============ CALLS ============
$('btnVoice').onclick = () => startCall('voice');
$('btnVideo').onclick = () => startCall('video');
$('btnEnd').onclick = endCall;
$('btnAccept').onclick = acceptCall;
$('btnReject').onclick = rejectCall;
$('btnMute').onclick = () => { if (webrtc) webrtc.toggleAudio(); };
$('btnCam').onclick = () => { if (webrtc) webrtc.toggleVideo(); };

async function startCall(type) {
  if (!chatWith) return;
  try {
    webrtc = new P2P();
    await webrtc.getMedia(type === 'voice' || type === 'video', type === 'video');
    const pc = webrtc.create(chatWith);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sent = await api('signal', { from: me.id, to: chatWith, type: 'offer', data: { offer, callType: type } });
    if (sent.error) { alert('Kullanici cevrimdisi'); webrtc.hangupAll(); return; }

    show($('callScreen')); hide($('chatScreen'));
    $('callName').textContent = users.find(u => u.id === chatWith)?.username || '';
    $('callStatus').textContent = 'Araniyor...';
    activeCall = { peerId: chatWith, type };

    SFX.connect();
    setTimeout(() => { if (activeCall) endCall(); }, 30000);
  } catch(e) { alert('Mikrofon/kamera erisimi reddedildi'); }
}

async function acceptCall() {
  if (!activeCall) return;
  stopRing();
  try {
    webrtc = new P2P();
    const type = activeCall.type;
    await webrtc.getMedia(type === 'voice' || type === 'video', type === 'video');
    const pc = webrtc.create(activeCall.peerId);
    await pc.setRemoteDescription(new RTCSessionDescription(activeCall.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await api('signal', { from: me.id, to: activeCall.peerId, type: 'answer', data: { answer } });

    SFX.connect();
    hide($('incomingCall')); show($('callScreen'));
    $('callName').textContent = activeCall.name;
    $('callStatus').textContent = 'Baglandi!';
  } catch(e) { console.error(e); }
}

function rejectCall() {
  if (!activeCall) return;
  stopRing();
  api('signal', { from: me.id, to: activeCall.peerId, type: 'reject', data: {} });
  hide($('incomingCall'));
  activeCall = null;
}

function endCall() {
  stopRing();
  SFX.end();
  if (activeCall) {
    api('signal', { from: me.id, to: activeCall.peerId, type: 'end', data: {} });
    webrtc && webrtc.hangup(activeCall.peerId);
    activeCall = null;
  } else {
    webrtc && webrtc.hangupAll();
  }
  hide($('callScreen'));
}

// ============ CLEANUP ============
window.onbeforeunload = () => { if (me) navigator.sendBeacon('/api/leave/' + me.id); };
