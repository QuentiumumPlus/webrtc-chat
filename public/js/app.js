// ============ CONFIG ============
const SUPABASE_URL = 'https://wlohcooukadbiaysxufp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Og0wFXrpDQVev7Y56YaEmw_jn_xfoNu';

console.log('Supabase URL:', SUPABASE_URL);
console.log('Supabase Key:', SUPABASE_KEY);

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Test connection
setTimeout(async () => {
  console.log('Testing Supabase connection...');
  const { data, error } = await sb.from('users').select('*').limit(1);
  console.log('Test result:', { data, error });
  if (error) {
    console.error('CONNECTION FAILED:', error.message);
  } else {
    console.log('CONNECTION OK, users found:', data.length);
  }
}, 1000);

// ============ SOUND ============
const SFX = {
  ctx: null,
  get() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(freq, dur, vol = 0.15) {
    const c = this.get(), o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.linearRampToValueAtTime(0, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  },
  msg() { this.tone(880, 0.08); },
  ring() { this.tone(440, 0.25); setTimeout(() => this.tone(440, 0.25), 350); },
  connected() { this.tone(523, 0.12); setTimeout(() => this.tone(659, 0.12), 80); setTimeout(() => this.tone(784, 0.15), 160); },
  ended() { this.tone(400, 0.12); setTimeout(() => this.tone(300, 0.15), 150); }
};

// ============ STATE ============
let me = null;
let currentChat = null;
let callPeer = null;
let ringInterval = null;
let pollInterval = null;

// ============ DOM ============
const $ = s => document.getElementById(s);
const show = el => el && el.classList.remove('hidden');
const hide = el => el && el.classList.add('hidden');
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const makeAvatar = name => {
  const colors = ['#e17055','#00b894','#6c5ce7','#fdcb6e','#e84393','#00cec9','#d63031','#0984e3'];
  return { initial: name[0].toUpperCase(), color: colors[name.charCodeAt(0) % colors.length] };
};
const timeStr = ts => new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

// ============ LOGIN ============
$('loginForm').onsubmit = async e => {
  e.preventDefault();
  const name = $('usernameInput').value.trim();
  if (!name) return;

  $('loginBtn').disabled = true;
  $('loginBtn').innerHTML = '<span>Katiliyor...</span>';

  try {
    // Eski ayni isimde kullaniciyi sil
    const delRes = await sb.from('users').delete().eq('username', name);
    console.log('Delete old user:', delRes);

    const av = makeAvatar(name);
    const userId = crypto.randomUUID();
    console.log('Creating user:', userId, name);

    const { data, error } = await sb.from('users').insert({
      id: userId,
      username: name,
      avatar: av,
      last_seen: Date.now()
    }).select().single();

    console.log('Insert result:', { data, error });

    if (error) {
      alert('Giris hatasi: ' + error.message);
      $('loginBtn').disabled = false;
      $('loginBtn').innerHTML = '<span>Sohbete Katil</span>';
      return;
    }

    me = data;
    console.log('Logged in as:', me);

    hide($('loginView'));
    show($('mainView'));
    $('myAvatar').style.background = av.color;
    $('myAvatar').textContent = av.initial;
    $('myName').textContent = name;

    startApp();
  } catch (e) {
    console.error('Login error:', e);
    alert('Hata: ' + e.message);
    $('loginBtn').disabled = false;
    $('loginBtn').innerHTML = '<span>Sohbete Katil</span>';
  }
};

// ============ APP ============
function startApp() {
  refreshUsers();
  pollInterval = setInterval(refreshUsers, 2000);
  heartbeat();
  setInterval(heartbeat, 5000);
  listenMessages();
}

async function heartbeat() {
  if (!me) return;
  const { error } = await sb.from('users').update({ last_seen: Date.now() }).eq('id', me.id);
  if (error) console.error('Heartbeat error:', error);
}

async function refreshUsers() {
  if (!me) return;
  const cutoff = Date.now() - 8000;
  const { data, error } = await sb.from('users').select('*').gt('last_seen', cutoff);
  if (error) { console.error('Refresh users error:', error); return; }

  const others = data.filter(u => u.id !== me.id);
  $('onlineCount').textContent = others.length;

  const list = $('userList');
  if (!others.length) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--txt3);font-size:13px">Henuz baska kimse yok</div>';
    return;
  }

  list.innerHTML = others.map(u => `
    <div class="user-item ${currentChat?.id === u.id ? 'active' : ''}" data-id="${u.id}">
      <div class="u-av" style="background:${u.avatar?.color || '#666'}">
        ${u.avatar?.initial || '?'}
        <div class="u-dot"></div>
      </div>
      <div>
        <div class="u-name">${esc(u.username)}</div>
        <div class="u-sub">Cevrimici</div>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.user-item').forEach(el => {
    el.onclick = () => openChat(el.dataset.id, others.find(u => u.id === el.dataset.id));
  });

  if (currentChat) {
    const still = others.find(u => u.id === currentChat.id);
    if (still) {
      $('chatStatus').textContent = 'Cevrimici';
      $('chatStatus').style.color = 'var(--green)';
    } else {
      $('chatStatus').textContent = 'Son gorulme: az once';
      $('chatStatus').style.color = 'var(--txt3)';
    }
  }
}

// ============ CHAT ============
async function openChat(userId, userData) {
  if (!userData) {
    const { data } = await sb.from('users').select('*').eq('id', userId).single();
    userData = data;
  }
  if (!userData) return;

  currentChat = userData;
  hide($('emptyState'));
  show($('chatHeader'));
  show($('messagesArea'));
  show($('chatInput'));

  $('chatAvatar').style.background = userData.avatar?.color || '#666';
  $('chatAvatar').textContent = userData.avatar?.initial || '?';
  $('chatName').textContent = userData.username;

  await loadMessages();
  refreshUsers();
}

async function loadMessages() {
  if (!me || !currentChat) return;

  const { data, error } = await sb.from('messages')
    .select('*')
    .or(`and(sender_id.eq.${me.id},receiver_id.eq.${currentChat.id}),and(sender_id.eq.${currentChat.id},receiver_id.eq.${me.id})`)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) { console.error('Load messages error:', error); return; }

  const el = $('messages');
  el.innerHTML = '';
  if (data) data.forEach(m => appendMessage(m));
  $('messagesArea').scrollTop = $('messagesArea').scrollHeight;
}

function appendMessage(m) {
  const isSent = m.sender_id === me.id;
  const div = document.createElement('div');
  div.className = 'msg' + (isSent ? ' sent' : '');
  const av = m.sender_avatar || makeAvatar(m.sender_name || 'U');

  if (m.type === 'file') {
    div.innerHTML = `
      <div class="msg-av" style="background:${av.color || '#666'}">${av.initial || '?'}</div>
      <div class="msg-body">
        <div class="msg-name">${esc(m.sender_name || '')}</div>
        <div class="msg-bubble">
          <div style="opacity:.7;font-size:12px;margin-bottom:4px">📎 Dosya</div>
          <div>${esc(m.data?.fileName || 'dosya')}</div>
          ${m.data?.fileData ? `<a href="${m.data.fileData}" download="${m.data.fileName}" style="color:var(--accent2);font-size:12px">Indir</a>` : ''}
        </div>
        <div class="msg-time">${timeStr(m.created_at)}</div>
      </div>
    `;
  } else {
    div.innerHTML = `
      <div class="msg-av" style="background:${av.color || '#666'}">${av.initial || '?'}</div>
      <div class="msg-body">
        <div class="msg-name">${esc(m.sender_name || '')}</div>
        <div class="msg-bubble">${esc(m.content || '')}</div>
        <div class="msg-time">${timeStr(m.created_at)}</div>
      </div>
    `;
  }

  $('messages').appendChild(div);
}

// ============ SEND ============
$('sendBtn').onclick = sendMsg;
$('msgInput').onkeydown = e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
};
$('msgInput').oninput = () => {
  $('sendBtn').disabled = !$('msgInput').value.trim();
};

async function sendMsg() {
  const txt = $('msgInput').value.trim();
  if (!txt || !me || !currentChat) return;

  $('msgInput').value = '';
  $('sendBtn').disabled = true;

  const msgData = {
    id: crypto.randomUUID(),
    sender_id: me.id,
    sender_name: me.username,
    sender_avatar: me.avatar,
    receiver_id: currentChat.id,
    type: 'msg',
    content: txt,
    data: {},
    created_at: Date.now()
  };

  console.log('Sending message:', msgData);
  const { data, error } = await sb.from('messages').insert(msgData);
  console.log('Send result:', { data, error });

  if (error) {
    console.error('Send error:', error);
  } else {
    appendMessage(msgData);
    $('messagesArea').scrollTop = $('messagesArea').scrollHeight;
  }
}

// ============ REALTIME ============
function listenMessages() {
  if (!me) return;

  console.log('Setting up realtime for user:', me.id);

  sb.channel('messages-realtime')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      payload => {
        const m = payload.new;
        console.log('Realtime message:', m);
        if (m.sender_id === me.id) return;
        if (m.type === 'offer' || m.type === 'answer' || m.type === 'ice' || m.type === 'call-end' || m.type === 'call-reject') {
          handleSignal(m);
          return;
        }
        SFX.msg();
        if (currentChat && m.sender_id === currentChat.id) {
          appendMessage(m);
          $('messagesArea').scrollTop = $('messagesArea').scrollHeight;
        }
      }
    )
    .subscribe((status) => {
      console.log('Realtime status:', status);
    });
}

function handleSignal(m) {
  switch (m.type) {
    case 'offer': handleIncomingCall(m); break;
    case 'answer': handleCallAnswer(m); break;
    case 'ice': handleICE(m); break;
    case 'call-end': case 'call-reject': cleanupCall(); break;
  }
}

// ============ FILE ============
$('attachBtn').onclick = () => $('fileInput').click();
$('fileInput').onchange = e => {
  for (const f of e.target.files) uploadFile(f);
};

async function uploadFile(file) {
  if (!me || !currentChat) return;
  const reader = new FileReader();
  reader.onload = async () => {
    await sb.from('messages').insert({
      id: crypto.randomUUID(),
      sender_id: me.id,
      sender_name: me.username,
      sender_avatar: me.avatar,
      receiver_id: currentChat.id,
      type: 'file',
      content: '',
      data: { fileName: file.name, fileSize: file.size, fileData: reader.result },
      created_at: Date.now()
    });
  };
  reader.readAsDataURL(file);
}

// ============ WEBRTC ============
let localStream = null;
let peerConn = null;

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

async function getMedia(audio, video) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: audio ? { echoCancellation: true, noiseSuppression: true } : false,
      video: video ? { width: { ideal: 640 }, height: { ideal: 480 } } : false
    });
    $('localVideo').srcObject = localStream;
    return localStream;
  } catch (e) {
    alert('Mikrofon/kamera erisimi reddedildi');
    throw e;
  }
}

function createPeer() {
  peerConn = new RTCPeerConnection(rtcConfig);
  if (localStream) localStream.getTracks().forEach(t => peerConn.addTrack(t, localStream));

  peerConn.onicecandidate = e => {
    if (e.candidate) sendSignal('ice', { candidate: e.candidate });
  };

  peerConn.ontrack = e => {
    if (e.streams[0]) $('remoteVideo').srcObject = e.streams[0];
  };

  peerConn.onconnectionstatechange = () => {
    if (peerConn.connectionState === 'connected') {
      SFX.connected();
      $('callStatusText').textContent = 'Baglandi!';
    }
    if (peerConn.connectionState === 'failed' || peerConn.connectionState === 'disconnected') endCall();
  };

  return peerConn;
}

async function sendSignal(type, data) {
  if (!me || !callPeer) return;
  await sb.from('messages').insert({
    id: crypto.randomUUID(),
    sender_id: me.id,
    sender_name: me.username,
    sender_avatar: me.avatar,
    receiver_id: callPeer,
    type,
    content: '',
    data,
    created_at: Date.now()
  });
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
  try {
    callPeer = currentChat.id;
    await getMedia(type === 'voice' || type === 'video', type === 'video');
    const pc = createPeer();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendSignal('offer', { offer, callType: type });

    show($('callOverlay'));
    $('callName').textContent = currentChat.username;
    $('callAvatar').style.background = currentChat.avatar?.color || '#666';
    $('callAvatar').textContent = currentChat.avatar?.initial || '?';
    $('callStatusText').textContent = 'Araniyor...';

    setTimeout(() => { if ($('callStatusText')?.textContent === 'Araniyor...') endCall(); }, 30000);
  } catch (e) { console.error(e); }
}

async function handleIncomingCall(m) {
  if (m.sender_id === me.id) return;
  callPeer = m.sender_id;
  window._incOffer = m.data?.offer;
  window._incType = m.data?.callType;

  SFX.ring();
  ringInterval = setInterval(() => SFX.ring(), 1500);

  const av = m.sender_avatar || makeAvatar(m.sender_name || '?');
  $('incAvatar').style.background = av.color || '#666';
  $('incAvatar').textContent = av.initial || '?';
  $('incName').textContent = m.sender_name || 'Bilinmeyen';
  $('incType').textContent = m.data?.callType === 'video' ? 'Goruntulu Arama' : 'Sesli Arama';
  show($('incomingOverlay'));

  setTimeout(() => { if (!$('incomingOverlay').classList.contains('hidden')) rejectCall(); }, 25000);
}

async function acceptCall() {
  hide($('incomingOverlay'));
  stopRing();
  try {
    const type = window._incType || 'voice';
    await getMedia(type === 'voice' || type === 'video', type === 'video');
    const pc = createPeer();
    await pc.setRemoteDescription(new RTCSessionDescription(window._incOffer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendSignal('answer', { answer });

    const { data: caller } = await sb.from('users').select('*').eq('id', callPeer).single();
    show($('callOverlay'));
    $('callName').textContent = caller?.username || 'Peer';
    $('callAvatar').style.background = caller?.avatar?.color || '#666';
    $('callAvatar').textContent = caller?.avatar?.initial || '?';
    $('callStatusText').textContent = 'Baglandi!';
    SFX.connected();
  } catch (e) { console.error(e); }
}

async function rejectCall() {
  hide($('incomingOverlay'));
  stopRing();
  if (callPeer) await sendSignal('call-reject', {}).catch(() => {});
  callPeer = null;
  window._incOffer = null;
}

async function handleCallAnswer(m) {
  if (peerConn && m.data?.answer) {
    await peerConn.setRemoteDescription(new RTCSessionDescription(m.data.answer));
    SFX.connected();
    $('callStatusText').textContent = 'Baglandi!';
  }
}

async function handleICE(m) {
  if (peerConn && m.data?.candidate) {
    await peerConn.addIceCandidate(new RTCIceCandidate(m.data.candidate)).catch(() => {});
  }
}

async function endCall() {
  if (callPeer && me) await sendSignal('call-end', {}).catch(() => {});
  cleanupCall();
}

function cleanupCall() {
  stopRing();
  SFX.ended();
  hide($('callOverlay'));
  hide($('incomingOverlay'));
  if (peerConn) { try { peerConn.close(); } catch(e) {} peerConn = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  $('remoteVideo').srcObject = null;
  $('localVideo').srcObject = null;
  callPeer = null;
  window._incOffer = null;
}

function stopRing() { if (ringInterval) { clearInterval(ringInterval); ringInterval = null; } }

// ============ CLEANUP ============
window.onbeforeunload = () => {
  if (me) sb.from('users').delete().eq('id', me.id).catch(() => {});
};

// ============ BACK ============
$('backBtn').onclick = () => {
  currentChat = null;
  show($('emptyState'));
  hide($('chatHeader'));
  hide($('messagesArea'));
  hide($('chatInput'));
};

// ============ SEARCH ============
$('searchInput').oninput = e => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.user-item').forEach(el => {
    const name = el.querySelector('.u-name')?.textContent.toLowerCase() || '';
    el.style.display = name.includes(q) ? '' : 'none';
  });
};
