// ============ SOUND ============
const SFX = {
  ctx: null,
  get() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; },
  tone(f, d, v = 0.15) { const c = this.get(), o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(v, c.currentTime); g.gain.linearRampToValueAtTime(0, c.currentTime + d); o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + d); },
  msg() { this.tone(880, 0.08); },
  ring() { this.tone(440, 0.25); setTimeout(() => this.tone(440, 0.25), 350); },
  connected() { this.tone(523, 0.12); setTimeout(() => this.tone(659, 0.12), 80); setTimeout(() => this.tone(784, 0.15), 160); },
  ended() { this.tone(400, 0.12); setTimeout(() => this.tone(300, 0.15), 150); }
};

// ============ STATE ============
let me = null, currentChat = null, callPeer = null, ringInterval = null;
let localStream = null, peerConn = null;
const peers = new Map(), pendingSignals = [];

// ============ DOM ============
const $ = s => document.getElementById(s);
const show = el => el && el.classList.remove('hidden');
const hide = el => el && el.classList.add('hidden');
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const mkav = name => { const c = ['#e17055','#00b894','#6c5ce7','#fdcb6e','#e84393','#00cec9','#d63031','#0984e3']; return { i: name[0].toUpperCase(), c: c[name.charCodeAt(0) % c.length] }; };
const ts = t => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

// ============ API ============
async function api(path, body) {
  const opt = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
  const r = await fetch('/api/' + path, opt);
  return r.json();
}

// ============ LOGIN ============
$('loginForm').onsubmit = async e => {
  e.preventDefault();
  const name = $('usernameInput').value.trim();
  if (!name) return;
  $('loginBtn').disabled = true;
  me = await api('join', { username: name });
  if (me.error) { alert(me.error); $('loginBtn').disabled = false; return; }
  hide($('loginView')); show($('mainView'));
  $('myAvatar').style.background = me.avatar.c;
  $('myAvatar').textContent = me.avatar.i;
  $('myName').textContent = name;
  SFX.msg();
  startPolling();
};

// ============ POLLING ============
function startPolling() {
  poll();
  setInterval(poll, 2000);
  setInterval(pollFast, 600);
}

async function poll() {
  if (!me) return;
  const d = await api('poll/' + me.id);
  if (d.error) return;
  renderUsers(d.users || []);
  if (d.messages) d.messages.forEach(handleSignal);
}

async function pollFast() {
  if (!me) return;
  const d = await api('poll/' + me.id);
  if (!d.error && d.messages) d.messages.forEach(handleSignal);
}

// ============ USERS ============
function renderUsers(users) {
  const others = users.filter(u => u.id !== me.id);
  $('onlineCount').textContent = others.length;
  const list = $('userList');
  if (!others.length) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--txt3);font-size:13px">Baska kimse yok</div>';
    return;
  }
  list.innerHTML = others.map(u => `
    <div class="user-item ${currentChat?.id === u.id ? 'active' : ''}" data-id="${u.id}">
      <div class="u-av" style="background:${u.avatar.c}">${u.avatar.i}<div class="u-dot"></div></div>
      <div><div class="u-name">${esc(u.username)}</div><div class="u-sub">Cevrimici</div></div>
    </div>
  `).join('');
  list.querySelectorAll('.user-item').forEach(el => el.onclick = () => openChat(el.dataset.id, others.find(u => u.id === el.dataset.id)));
  if (currentChat) {
    const online = others.find(u => u.id === currentChat.id);
    $('chatStatus').textContent = online ? 'Cevrimici' : 'Cevrimdisi';
    $('chatStatus').style.color = online ? 'var(--green)' : 'var(--txt3)';
  }
}

// ============ CHAT ============
async function openChat(uid, u) {
  if (!u) { const d = await api('poll/' + me.id); u = (d.users || []).find(x => x.id === uid); }
  if (!u) return;
  currentChat = u;
  hide($('emptyState')); show($('chatHeader')); show($('messagesArea')); show($('chatInput'));
  $('chatAvatar').style.background = u.avatar.c;
  $('chatAvatar').textContent = u.avatar.i;
  $('chatName').textContent = u.username;
  $('chatStatus').textContent = 'Cevrimici';
  $('chatStatus').style.color = 'var(--green)';
  $('messages').innerHTML = '';
  renderUsers([...document.querySelectorAll('.user-item')].map(el => {
    const av = el.querySelector('.u-av');
    return { id: el.dataset.id, username: el.querySelector('.u-name').textContent, avatar: { i: av.textContent.trim(), c: av.style.background } };
  }));
  $('msgInput').focus();
}

// ============ MESSAGES ============
$('sendBtn').onclick = sendMsg;
$('msgInput').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } };

async function sendMsg() {
  const txt = $('msgInput').value.trim();
  if (!txt || !currentChat) return;
  $('msgInput').value = '';

  addMsg({ sender_name: me.username, sender_avatar: me.avatar, content: txt, created_at: Date.now() }, true);

  if (peers.has(currentChat.id)) {
    const ch = peers.get(currentChat.id).dc;
    if (ch && ch.readyState === 'open') { ch.send(JSON.stringify({ type: 'msg', content: txt })); return; }
  }

  await api('signal', { from: me.id, to: currentChat.id, type: 'msg', data: { content: txt } });
}

function addMsg(m, sent) {
  const av = m.sender_avatar || mkav(m.sender_name || 'U');
  const d = document.createElement('div');
  d.className = 'msg' + (sent ? ' sent' : '');
  d.innerHTML = `
    <div class="msg-av" style="background:${av.c}">${av.i}</div>
    <div class="msg-body">
      <div class="msg-name">${esc(m.sender_name || '')}</div>
      <div class="msg-bubble">${esc(m.content || '')}</div>
      <div class="msg-time">${ts(m.created_at)}</div>
    </div>`;
  $('messages').appendChild(d);
  $('messagesArea').scrollTop = $('messagesArea').scrollHeight;
}

// ============ SIGNAL HANDLER ============
async function handleSignal(m) {
  if (m.from === me?.id) return;

  switch (m.type) {
    case 'msg':
      SFX.msg();
      if (currentChat && m.from === currentChat.id) {
        addMsg({ sender_name: m.name, sender_avatar: m.avatar, content: m.data.content, created_at: m.ts }, false);
      }
      break;
    case 'offer':
      callPeer = m.from;
      window._incOffer = m.data.offer;
      window._incType = m.data.callType;
      SFX.ring();
      ringInterval = setInterval(() => SFX.ring(), 1500);
      const av = m.avatar || mkav(m.name || '?');
      $('incAvatar').style.background = av.c; $('incAvatar').textContent = av.i;
      $('incName').textContent = m.name;
      $('incType').textContent = m.data.callType === 'video' ? 'Goruntulu Arama' : 'Sesli Arama';
      show($('incomingOverlay'));
      setTimeout(() => { if (!$('incomingOverlay').classList.contains('hidden')) rejectCall(); }, 25000);
      break;
    case 'answer':
      const p = peers.get(m.from);
      if (p) { await p.pc.setRemoteDescription(new RTCSessionDescription(m.data.answer)); SFX.connected(); $('callStatusText').textContent = 'Baglandi!'; }
      break;
    case 'ice':
      const p2 = peers.get(m.from);
      if (p2 && m.data.candidate) await p2.pc.addIceCandidate(new RTCIceCandidate(m.data.candidate)).catch(() => {});
      break;
    case 'call-end': case 'call-reject':
      cleanupCall(); break;
  }
}

// ============ FILE ============
$('btnFile').onclick = () => $('fileInput').click();
$('fileInput').onchange = e => { for (const f of e.target.files) sendFile(f); };

function sendFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    addMsg({ sender_name: me.username, sender_avatar: me.avatar, content: '📎 ' + file.name, created_at: Date.now() }, true);
    if (currentChat) await api('signal', { from: me.id, to: currentChat.id, type: 'file', data: { fileName: file.name, fileData: reader.result } });
  };
  reader.readAsDataURL(file);
}

// ============ WEBRTC ============
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

async function getMedia(audio, video) {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: audio ? { echoCancellation: true, noiseSuppression: true } : false, video: video ? { width: { ideal: 640 }, height: { ideal: 480 } } : false });
  $('localVideo').srcObject = localStream;
  return localStream;
}

function makePeer(id) {
  const pc = new RTCPeerConnection(rtcConfig);
  if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  pc.onicecandidate = e => { if (e.candidate) sendSig(id, 'ice', { candidate: e.candidate }); };
  pc.ontrack = e => { if (e.streams[0]) $('remoteVideo').srcObject = e.streams[0]; };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') { SFX.connected(); $('callStatusText').textContent = 'Baglandi!'; }
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') endCall();
  };

  const dc = pc.createDataChannel('chat', { ordered: true });
  dc.onmessage = e => { try { const d = JSON.parse(e.data); if (d.type === 'msg') { SFX.msg(); addMsg({ sender_name: 'Peer', sender_avatar: mkav('P'), content: d.content, created_at: Date.now() }, false); } } catch(err) {} };

  peers.set(id, { pc, dc });
  return pc;
}

async function sendSig(to, type, data) {
  if (!me) return;
  await api('signal', { from: me.id, to, type, data });
}

// ============ CALLS ============
$('btnVoice').onclick = () => startCall('voice');
$('btnVideo').onclick = () => startCall('video');
$('callEnd').onclick = endCall;
$('callMute').onclick = () => { if (localStream) { const t = localStream.getAudioTracks()[0]; if (t) t.enabled = !t.enabled; } };
$('callCam').onclick = () => { if (localStream) { const t = localStream.getVideoTracks()[0]; if (t) t.enabled = !t.enabled; } };
$('incAccept').onclick = acceptCall;
$('incReject').onclick = rejectCall;

async function startCall(type) {
  if (!currentChat) return;
  callPeer = currentChat.id;
  await getMedia(type === 'voice' || type === 'video', type === 'video');
  const pc = makePeer(callPeer);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await sendSig(callPeer, 'offer', { offer, callType: type });
  show($('callOverlay')); hide($('chatHeader')); hide($('messagesArea')); hide($('chatInput'));
  $('callName').textContent = currentChat.username;
  $('callAvatar').style.background = currentChat.avatar.c; $('callAvatar').textContent = currentChat.avatar.i;
  $('callStatusText').textContent = 'Araniyor...';
  setTimeout(() => { if ($('callStatusText')?.textContent === 'Araniyor...') endCall(); }, 30000);
}

async function acceptCall() {
  hide($('incomingOverlay')); stopRing();
  const type = window._incType || 'voice';
  await getMedia(type === 'voice' || type === 'video', type === 'video');
  const pc = makePeer(callPeer);
  await pc.setRemoteDescription(new RTCSessionDescription(window._incOffer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await sendSig(callPeer, 'answer', { answer });
  show($('callOverlay')); hide($('chatHeader')); hide($('messagesArea')); hide($('chatInput'));
  $('callName').textContent = $('incName').textContent;
  $('callAvatar').style.background = $('incAvatar').style.background;
  $('callAvatar').textContent = $('incAvatar').textContent;
  $('callStatusText').textContent = 'Baglandi!';
  SFX.connected();
}

async function rejectCall() {
  hide($('incomingOverlay')); stopRing();
  if (callPeer) await sendSig(callPeer, 'call-reject', {});
  callPeer = null; window._incOffer = null;
}

async function endCall() {
  if (callPeer) await sendSig(callPeer, 'call-end', {}).catch(() => {});
  cleanupCall();
}

function cleanupCall() {
  stopRing(); SFX.ended();
  hide($('callOverlay')); hide($('incomingOverlay'));
  peers.forEach(p => { try { p.pc.close(); } catch(e) {} }); peers.clear();
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  $('remoteVideo').srcObject = null; $('localVideo').srcObject = null;
  callPeer = null; window._incOffer = null;
}

function stopRing() { if (ringInterval) { clearInterval(ringInterval); ringInterval = null; } }

window.onbeforeunload = () => { if (me) navigator.sendBeacon('/api/leave/' + me.id); };
