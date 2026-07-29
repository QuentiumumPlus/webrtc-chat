const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const users = new Map();
const msgs = new Map();

function gid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function mkav(n) { const c = ['#e17055','#00b894','#6c5ce7','#fdcb6e','#e84393','#00cec9','#d63031','#0984e3']; return { i: n[0].toUpperCase(), c: c[n.charCodeAt(0) % c.length] }; }

// Join
app.post('/api/join', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'required' });
  for (const [k, v] of users) if (v.username === username) { users.delete(k); msgs.delete(k); }
  const u = { id: gid(), username, avatar: mkav(username), ts: Date.now() };
  users.set(u.id, u);
  msgs.set(u.id, []);
  res.json(u);
});

// Poll
app.get('/api/poll/:uid', (req, res) => {
  const u = users.get(req.params.uid);
  if (!u) return res.status(404).json({ error: 'not found' });
  u.ts = Date.now();
  const m = msgs.get(req.params.uid) || [];
  msgs.set(req.params.uid, []);
  const active = [...users.values()].filter(x => Date.now() - x.ts < 10000);
  res.json({ messages: m, users: active });
});

// Signal
app.post('/api/signal', (req, res) => {
  const { from, to, type, data } = req.body;
  const s = users.get(from);
  if (!s) return res.status(404).json({ error: 'sender' });
  const t = users.get(to);
  if (!t) return res.status(404).json({ error: 'offline' });
  const q = msgs.get(to) || [];
  q.push({ id: gid(), from, name: s.username, avatar: s.avatar, type, data, ts: Date.now() });
  if (q.length > 100) q.splice(0, q.length - 100);
  msgs.set(to, q);
  res.json({ ok: true });
});

// Leave
app.get('/api/leave/:uid', (req, res) => {
  users.delete(req.params.uid);
  msgs.delete(req.params.uid);
  res.json({ ok: true });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log('ChatZone calisiyor: http://localhost:' + PORT));
