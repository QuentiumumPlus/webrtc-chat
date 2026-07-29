const users = new Map();
const messages = new Map();
const groups = new Map();

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

function generateId() {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function generateAvatar(username) {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
  const initial = username.charAt(0).toUpperCase();
  const colorIndex = username.charCodeAt(0) % colors.length;
  return { initial, color: colors[colorIndex] };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const path = event.path.replace('/api/', '');
  const segments = path.split('/');

  try {
    switch (segments[0]) {
      case 'users':
        return handleUsers(event, segments);
      case 'signal':
        return handleSignal(event, segments);
      case 'groups':
        return handleGroups(event, segments);
      case 'poll':
        return handlePoll(event, segments);
      default:
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
    }
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};

function handleUsers(event, segments) {
  if (event.httpMethod === 'GET') {
    const usersList = Array.from(users.values());
    return { statusCode: 200, headers, body: JSON.stringify(usersList) };
  }

  if (event.httpMethod === 'POST') {
    const data = JSON.parse(event.body);
    const user = {
      id: generateId(),
      username: data.username,
      avatar: generateAvatar(data.username),
      joinedAt: Date.now(),
      lastSeen: Date.now()
    };
    users.set(user.id, user);
    messages.set(user.id, []);
    return { statusCode: 200, headers, body: JSON.stringify(user) };
  }

  if (event.httpMethod === 'DELETE') {
    const userId = segments[1];
    if (userId) {
      users.delete(userId);
      messages.delete(userId);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
}

function handleSignal(event, segments) {
  if (event.httpMethod === 'POST') {
    const data = JSON.parse(event.body);
    const { senderId, targetId, type, signal } = data;

    const sender = users.get(senderId);
    if (!sender) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Sender not found' }) };
    }

    const signalMessage = {
      id: generateId(),
      senderId,
      senderName: sender.username,
      senderAvatar: sender.avatar,
      targetId,
      type,
      signal,
      timestamp: Date.now()
    };

    const targetMessages = messages.get(targetId) || [];
    targetMessages.push(signalMessage);
    messages.set(targetId, targetMessages);

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
}

function handleGroups(event, segments) {
  if (event.httpMethod === 'POST') {
    const data = JSON.parse(event.body);
    const group = {
      id: generateId(),
      name: data.name,
      members: data.members || [],
      creator: data.creatorId,
      createdAt: Date.now()
    };
    groups.set(group.id, group);
    return { statusCode: 200, headers, body: JSON.stringify(group) };
  }

  if (event.httpMethod === 'GET') {
    const groupId = segments[1];
    if (groupId) {
      const group = groups.get(groupId);
      if (group) {
        return { statusCode: 200, headers, body: JSON.stringify(group) };
      }
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Group not found' }) };
    }
    const groupsList = Array.from(groups.values());
    return { statusCode: 200, headers, body: JSON.stringify(groupsList) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
}

function handlePoll(event, segments) {
  if (event.httpMethod === 'GET') {
    const userId = segments[1];
    if (!userId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'User ID required' }) };
    }

    const user = users.get(userId);
    if (!user) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'User not found' }) };
    }

    user.lastSeen = Date.now();
    users.set(userId, user);

    const pendingMessages = messages.get(userId) || [];
    messages.set(userId, []);

    const usersList = Array.from(users.values());

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        messages: pendingMessages,
        users: usersList
      })
    };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
}
