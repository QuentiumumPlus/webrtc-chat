const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const users = new Map();
const messages = new Map();

function generateId() {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function generateAvatar(username) {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
  const initial = username.charAt(0).toUpperCase();
  const colorIndex = username.charCodeAt(0) % colors.length;
  return { initial, color: colors[colorIndex] };
}

app.post('/api/users', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  const user = {
    id: generateId(),
    username,
    avatar: generateAvatar(username),
    joinedAt: Date.now(),
    lastSeen: Date.now()
  };

  users.set(user.id, user);
  messages.set(user.id, []);
  res.json(user);
});

app.get('/api/users', (req, res) => {
  res.json(Array.from(users.values()));
});

app.post('/api/signal', (req, res) => {
  const { senderId, targetId, type, signal } = req.body;
  const sender = users.get(senderId);
  if (!sender) return res.status(404).json({ error: 'Sender not found' });

  const targetMessages = messages.get(targetId) || [];
  targetMessages.push({
    id: generateId(),
    senderId,
    senderName: sender.username,
    senderAvatar: sender.avatar,
    targetId,
    type,
    signal,
    timestamp: Date.now()
  });
  messages.set(targetId, targetMessages);
  res.json({ success: true });
});

app.get('/api/poll/:userId', (req, res) => {
  const { userId } = req.params;
  const user = users.get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.lastSeen = Date.now();
  users.set(userId, user);

  const pendingMessages = messages.get(userId) || [];
  messages.set(userId, []);

  res.json({
    messages: pendingMessages,
    users: Array.from(users.values())
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
