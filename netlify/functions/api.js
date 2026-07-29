const users = new Map();
const messageQueues = new Map();

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function makeAvatar(name) {
  const c = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F'];
  return { initial: name[0].toUpperCase(), color: c[name.charCodeAt(0) % c.length] };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const url = event.path.replace(/^\/api\/?/, '');
  const parts = url.split('/').filter(Boolean);
  const method = event.httpMethod;

  try {
    if (parts[0] === 'join' && method === 'POST') {
      const { username } = JSON.parse(event.body);
      if (!username) return err(400, 'Username required');

      // Eski aynı isimli kullanıcıyı temizle
      for (const [id, u] of users) {
        if (u.username === username) {
          users.delete(id);
          messageQueues.delete(id);
        }
      }

      const user = { id: genId(), username, avatar: makeAvatar(username), ts: Date.now() };
      users.set(user.id, user);
      messageQueues.set(user.id, []);
      return ok(user);
    }

    if (parts[0] === 'users' && method === 'GET') {
      // Aktif kullanıcıları filtrele (son 10 sn içinde poll yapanlar)
      const now = Date.now();
      const active = [...users.values()].filter(u => now - u.ts < 15000);
      return ok(active);
    }

    if (parts[0] === 'poll' && parts[1] && method === 'GET') {
      const uid = parts[1];
      const user = users.get(uid);
      if (!user) return err(404, 'User not found');
      user.ts = Date.now();

      const msgs = messageQueues.get(uid) || [];
      messageQueues.set(uid, []);

      const now = Date.now();
      const active = [...users.values()].filter(u => now - u.ts < 15000);
      return ok({ messages: msgs, users: active });
    }

    if (parts[0] === 'signal' && method === 'POST') {
      const { from, to, type, data } = JSON.parse(event.body);
      const sender = users.get(from);
      if (!sender) return err(404, 'Sender not found');

      // Hedef kullanıcı aktif mi kontrol et
      const target = users.get(to);
      if (!target) return err(404, 'Target offline');

      const q = messageQueues.get(to) || [];
      q.push({
        id: genId(),
        from,
        name: sender.username,
        avatar: sender.avatar,
        type,
        data,
        ts: Date.now()
      });
      messageQueues.set(to, q);
      return ok({ ok: true });
    }

    if (parts[0] === 'leave' && parts[1] && method === 'POST') {
      const uid = parts[1];
      users.delete(uid);
      messageQueues.delete(uid);
      return ok({ ok: true });
    }

    return err(404, 'Not found');
  } catch (e) {
    return err(500, e.message);
  }
};

function ok(body) { return { statusCode: 200, headers, body: JSON.stringify(body) }; }
function err(code, msg) { return { statusCode: code, headers, body: JSON.stringify({ error: msg }) }; }
