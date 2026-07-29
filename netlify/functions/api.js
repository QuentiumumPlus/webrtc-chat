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

function getActiveUsers() {
  const now = Date.now();
  return [...users.values()].filter(u => now - u.lastPoll < 10000);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const url = event.path.replace(/^\/api\/?/, '');
  const parts = url.split('/').filter(Boolean);
  const method = event.httpMethod;

  try {
    // KULLANICI GIRIS
    if (parts[0] === 'join' && method === 'POST') {
      const { username } = JSON.parse(event.body);
      if (!username) return err(400, 'Username required');

      // Ayni isimde eski kullaniciyi sil
      for (const [id, u] of users) {
        if (u.username.toLowerCase() === username.toLowerCase()) {
          users.delete(id);
          messageQueues.delete(id);
        }
      }

      const user = {
        id: genId(),
        username,
        avatar: makeAvatar(username),
        joinedAt: Date.now(),
        lastPoll: Date.now()
      };
      users.set(user.id, user);
      messageQueues.set(user.id, []);
      return ok(user);
    }

    // POLL - KULLANICILAR + MESAJLAR
    if (parts[0] === 'poll' && parts[1] && method === 'GET') {
      const uid = parts[1];
      let user = users.get(uid);

      // Kullanici yoksa olustur (cold start icin)
      if (!user) {
        return err(404, 'User not found - please rejoin');
      }

      // Son poll zamanini guncelle
      user.lastPoll = Date.now();

      // Mesajlari al ve temizle
      const msgs = messageQueues.get(uid) || [];
      messageQueues.set(uid, []);

      // Aktif kullanici listesi
      const active = getActiveUsers();

      return ok({
        messages: msgs,
        users: active
      });
    }

    // KULLANICI LISTESI (ayri endpoint)
    if (parts[0] === 'users' && method === 'GET') {
      return ok(getActiveUsers());
    }

    // SIGNAL GONDER
    if (parts[0] === 'signal' && method === 'POST') {
      const body = JSON.parse(event.body);
      const { from, to, type, data } = body;

      const sender = users.get(from);
      if (!sender) return err(404, 'Sender not found');

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

      // Kuyruğu limitli tut (son 100 mesaj)
      if (q.length > 100) q.splice(0, q.length - 100);
      messageQueues.set(to, q);

      return ok({ ok: true });
    }

    // AYRIL
    if (parts[0] === 'leave' && parts[1] && method === 'POST') {
      users.delete(parts[1]);
      messageQueues.delete(parts[1]);
      return ok({ ok: true });
    }

    return err(404, 'Not found');
  } catch (e) {
    return err(500, e.message);
  }
};

function ok(body) {
  return { statusCode: 200, headers, body: JSON.stringify(body) };
}

function err(code, msg) {
  return { statusCode: code, headers, body: JSON.stringify({ error: msg }) };
}
