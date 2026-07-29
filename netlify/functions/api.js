const db = { users: {}, queues: {} };
const H = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type', 'Access-Control-Allow-Methods':'GET,POST,OPTIONS', 'Content-Type':'application/json' };
const ok = b => ({ statusCode:200, headers:H, body:JSON.stringify(b) });
const er = (c,m) => ({ statusCode:c, headers:H, body:JSON.stringify({error:m}) });
const id = () => Math.random().toString(36).slice(2)+Date.now().toString(36);
const av = n => { const c=['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F']; return {i:n[0].toUpperCase(),c:c[n.charCodeAt(0)%c.length]}; };

exports.handler = async e => {
  if (e.httpMethod==='OPTIONS') return {statusCode:204,headers:H,body:''};
  const p = e.path.replace(/^\/api\/?/,'').split('/').filter(Boolean);
  const m = e.httpMethod;

  try {
    if (p[0]==='join' && m==='POST') {
      const {username} = JSON.parse(e.body);
      if(!username) return er(400,'required');
      for(const [k,v] of Object.entries(db.users)) if(v.username===username) { delete db.users[k]; delete db.queues[k]; }
      const u = {id:id(),username,avatar:av(username),ts:Date.now()};
      db.users[u.id]=u; db.queues[u.id]=[];
      return ok(u);
    }

    if (p[0]==='poll' && p[1] && m==='GET') {
      const u = db.users[p[1]];
      if(!u) return er(404,'not found');
      u.ts=Date.now();
      const msgs = db.queues[p[1]]||[];
      db.queues[p[1]]=[];
      const active = Object.values(db.users).filter(x=>Date.now()-x.ts<12000);
      return ok({messages:msgs,users:active});
    }

    if (p[0]==='signal' && m==='POST') {
      const {from,to,type,data} = JSON.parse(e.body);
      const s = db.users[from];
      if(!s) return er(404,'sender?');
      const t = db.users[to];
      if(!t) return er(404,'offline');
      const q = db.queues[to]||[];
      q.push({id:id(),from,name:s.username,avatar:s.avatar,type,data,ts:Date.now()});
      if(q.length>50) q.splice(0,q.length-50);
      db.queues[to]=q;
      return ok({ok:true});
    }

    if (p[0]==='leave' && p[1] && m==='POST') {
      delete db.users[p[1]]; delete db.queues[p[1]];
      return ok({ok:true});
    }

    return er(404,'nope');
  } catch(e) { return er(500,e.message); }
};
