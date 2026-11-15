import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const port = Number(process.env.PARSEC_ADMIN_PORT || 3000);
const gateway = (process.env.PARSEC_GATEWAY_BASE_URL || 'http://gateway:8080').replace(/\/$/, '');
const search = (process.env.PARSEC_SEARCH_BASE_URL || 'http://search:8000').replace(/\/$/, '');
const token = process.env.PARSEC_ADMIN_INTERNAL_TOKEN || '';
const adminPassword = process.env.PARSEC_ADMIN_PASSWORD ?? '';
const forceSecureCookies = process.env.PARSEC_ADMIN_COOKIE_SECURE === 'true';
const sessionLifetimeMs = 12 * 60 * 60 * 1000;
const sessions = new Map();
const loginFailures = new Map();
const json = (res, status, body, headers={}) => { res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}); res.end(JSON.stringify(body)); };
async function readBody(req) { let raw=''; for await (const c of req) { raw+=c; if(raw.length>32768) throw Error('Request too large'); } return raw?JSON.parse(raw):{}; }
const get = (url, options={}) => fetch(url,{...options,signal:AbortSignal.timeout(15000)});
function cookieValue(req,name) {
 const raw=req.headers.cookie||'';
 for(const part of raw.split(';')) { const i=part.indexOf('='); if(i>0&&part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim()); }
 return '';
}
function currentSession(req) {
 const id=cookieValue(req,'parsec_admin_session');
 const expires=sessions.get(id);
 if(!id||!expires)return false;
 if(expires<=Date.now()){sessions.delete(id);return false;}
 return true;
}
function passwordMatches(candidate) {
 const expected=createHash('sha256').update(adminPassword,'utf8').digest();
 const actual=createHash('sha256').update(String(candidate??''),'utf8').digest();
 return timingSafeEqual(expected,actual);
}
function secureCookie(req) {
 return forceSecureCookies || req.socket.encrypted===true || String(req.headers['x-forwarded-proto']||'').split(',')[0].trim()==='https';
}
function sessionCookie(req,id,maxAge) {
 return 'parsec_admin_session='+encodeURIComponent(id)+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+maxAge+(secureCookie(req)?'; Secure':'');
}
function authStatus(req) {
 return {passwordRequired:adminPassword.length>0,authenticated:adminPassword.length===0||currentSession(req)};
}
async function handle(req,res) {
 const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET'&&url.pathname==='/api/auth/status') return json(res,200,authStatus(req));
 if(req.method==='POST'&&url.pathname==='/api/auth/login') {
  if(!adminPassword)return json(res,200,{ok:true,passwordRequired:false});
  const ip=req.headers['x-real-ip']||req.socket.remoteAddress||'unknown',now=Date.now(),failure=loginFailures.get(ip);
  if(failure&&failure.blockedUntil>now)return json(res,429,{error:'Zu viele Fehlversuche. Bitte spaeter erneut versuchen.'});
  const payload=await readBody(req);
  if(!passwordMatches(payload.password)) {
   const inWindow=failure&&failure.windowStart>now-15*60*1000;
   const next=inWindow?failure.count+1:1;
   loginFailures.set(ip,{count:next,windowStart:inWindow?failure.windowStart:now,blockedUntil:next>=5?now+15*60*1000:0});
   return json(res,401,{error:'Das Passwort ist nicht korrekt.'});
  }
  loginFailures.delete(ip);
  for(const [id,expires] of sessions)if(expires<=now)sessions.delete(id);
  const sessionId=randomBytes(32).toString('base64url');
  sessions.set(sessionId,now+sessionLifetimeMs);
  return json(res,200,{ok:true},{'set-cookie':sessionCookie(req,sessionId,sessionLifetimeMs/1000)});
 }
 if(req.method==='POST'&&url.pathname==='/api/auth/logout') {
  const id=cookieValue(req,'parsec_admin_session');if(id)sessions.delete(id);
  return json(res,200,{ok:true},{'set-cookie':sessionCookie(req,'',0)});
 }
 if(req.method==='GET'&&url.pathname==='/healthz') return json(res,200,{status:'UP'});
 if(adminPassword&&!currentSession(req)&&url.pathname.startsWith('/api/')) return json(res,401,{error:'Anmeldung erforderlich'});
 if(req.method==='GET'&&url.pathname==='/api/health') {
  const checks=await Promise.allSettled([get(`${gateway}/actuator/health/readiness`),get(`${search}/health`)]);
  const parse=async x=>x.status==='fulfilled'?{reachable:x.value.ok,status:x.value.status,details:await x.value.json().catch(()=>({}))}:{reachable:false,error:'unreachable'};
  return json(res,200,{gateway:await parse(checks[0]),search:await parse(checks[1]),checkedAt:new Date().toISOString()});
 }
 if(req.method==='GET'&&url.pathname==='/api/overview') {
  if(!token)return json(res,503,{error:'Admin credential is not configured'});
  const r=await get(`${gateway}/internal/v1/admin/overview`,{headers:{authorization:`Bearer ${token}`}});
  return json(res,r.status,await r.json().catch(()=>({error:'Invalid Gateway response'})));
 }
 if(req.method==='GET'&&url.pathname==='/api/gpu-worker-registrations') {
  if(!token)return json(res,503,{error:'Admin credential is not configured'});
  const r=await get(`${gateway}/internal/v1/admin/gpu-worker-registrations`,{headers:{authorization:`Bearer ${token}`}});
  return json(res,r.status,await r.json().catch(()=>({error:'Invalid Gateway response'})));
 }
 const pairingAction=url.pathname.match(/^\/api\/gpu-worker-registrations\/([A-Za-z0-9_-]+)\/(approve|reject)$/);
 if(req.method==='POST'&&pairingAction) {
  if(!token)return json(res,503,{error:'Admin credential is not configured'});
  const registrationId=encodeURIComponent(pairingAction[1]),action=pairingAction[2];
  const r=await get(`${gateway}/internal/v1/admin/gpu-worker-registrations/${registrationId}/${action}`,{
   method:'POST',headers:{authorization:`Bearer ${token}`}
  });
  return json(res,r.status,await r.json().catch(()=>({ok:r.ok,error:'Invalid Gateway response'})));
 }
 if(req.method==='POST'&&url.pathname==='/api/search') {
  const payload=await readBody(req),r=await get(`${gateway}/api/v1/search`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:String(payload.query||'')})});
  return json(res,r.status,await r.json().catch(()=>({error:'Invalid search response'})));
 }
 const ticket=url.pathname.match(/^\/api\/tracks\/([a-zA-Z0-9-]+)\/stream-ticket$/);
 if(req.method==='POST'&&ticket) { const r=await get(`${gateway}/api/v1/tracks/${encodeURIComponent(ticket[1])}/stream-ticket`,{method:'POST'}); return json(res,r.status,await r.json().catch(()=>({error:'Could not create ticket'}))); }
 const stream=url.pathname.match(/^\/api\/stream\/([a-zA-Z0-9-]+)$/);
 if(req.method==='GET'&&stream) {
  const headers={}; if(req.headers.range)headers.range=req.headers.range;
  // Do not apply the short API timeout to audio: a full song may stream for several minutes.
  const controller=new AbortController();
  const r=await fetch(`${gateway}/api/v1/stream/${encodeURIComponent(stream[1])}`,{headers,signal:controller.signal});
  const out={}; for(const k of ['content-type','content-length','content-range','accept-ranges']){const v=r.headers.get(k);if(v)out[k]=v;}
  res.writeHead(r.status,out);
  if(r.body) {
   const audio=Readable.fromWeb(r.body);
   audio.on('error',e=>{console.error('Audio stream failed:',e.message);if(!res.destroyed)res.destroy();});
   res.on('close',()=>controller.abort());
   audio.pipe(res);
  } else res.end();
  return;
 }
 if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
 const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1)),file=path.resolve(publicDir,name);
 if(!file.startsWith(publicDir+path.sep))return json(res,404,{error:'Not found'});
 try {const data=await readFile(file),type=file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'application/octet-stream';res.writeHead(200,{'content-type':type,'cache-control':file.endsWith('.html')?'no-store':'public, max-age=300','x-content-type-options':'nosniff','referrer-policy':'same-origin','x-frame-options':'DENY'});res.end(req.method==='HEAD'?undefined:data);}
 catch{return json(res,404,{error:'Not found'});}
}
http.createServer((req,res)=>handle(req,res).catch(e=>{console.error('Admin request failed:',e.message);if(!res.headersSent)json(res,502,{error:'Upstream service unavailable'});else res.destroy();})).listen(port,'0.0.0.0',()=>console.log(`Parsec Admin Tool listening on ${port}`));
