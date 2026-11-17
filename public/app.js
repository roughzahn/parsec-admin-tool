const $=id=>document.getElementById(id),n=v=>Number(v||0).toLocaleString('de-DE'),date=v=>v?new Date(v).toLocaleString('de-DE'):'—',esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(d){const j=d.jobs||{},total=Object.values(j).reduce((a,b)=>a+Number(b||0),0),done=+j.completed||0,active=+j.leased||0,queued=+j.queued||0,dead=+j.dead||0,pct=total?Math.round(done/total*100):0;
$('tracks').textContent=n(d.inventory?.totalTracks);$('leased').textContent=n(active);$('queued').textContent=n(queued);$('completed').textContent=n(done);$('progress').textContent='von '+n(total)+' Jobs';$('dead').textContent=n(dead);$('progressPct').textContent=pct+'%';$('progressBar').style.width=pct+'%';
$('workerCount').textContent=n(d.workers?.length)+' Worker';$('workers').innerHTML=(d.workers||[]).map(w=>{const status=w.status||(w.online?'READY':'OFFLINE'),isCpu=w.workerType==='CPU',cooldown=isCpu&&status==='PAUSED',label={STARTING:'Startet',READY:'Bereit',IDLE:'Leerlauf - Modell entladen',OFFLINE:'Offline',PAUSED:'Cooldown'}[status]||status,activity=cooldown?(w.pauseStartedAt&&w.cooldownUntil?'<div class="worker-cooldown"><span>Pausiert seit '+date(w.pauseStartedAt)+'</span><b class="cooldown-countdown" data-started-at="'+esc(w.pauseStartedAt)+'" data-until="'+esc(w.cooldownUntil)+'"></b></div>':'<div class="worker-cooldown">Cooldown aktiv - Zeitangaben nicht verf\u00fcgbar</div>'):isCpu&&status==='READY'?'<div class="worker-activity">'+(Number(w.activeJobs)>0?'Arbeitet gerade':'Wartet auf Auftr\u00e4ge')+'</div>':'';return '<article class="worker"><div class="worker-top"><b>'+esc(w.workerId)+'</b><span class="type '+(w.workerType==='GPU'?'gpu':'')+'">'+esc(w.workerType)+'</span></div><div class="worker-meta"><span class="worker-status '+String(status).toLowerCase()+'">\u25cf '+esc(label)+'</span> - '+n(w.activeJobs)+' / '+n(w.maxConcurrentJobs)+' Jobs<br>Modell: '+esc(w.modelId)+'<br>Heartbeat: '+date(w.lastSeenAt)+'<br>Capabilities: '+esc((w.capabilities||[]).join(', ')||'-')+'</div>'+activity+(w.workerType==='GPU'?'<div class="worker-actions"><button class="reject" data-worker-action="revoke" data-worker-id="'+esc(w.workerId)+'">Session entziehen</button></div>':'')+'</article>';}).join('')||'Noch keine Worker registriert.';updateCooldownCountdowns();
const i=d.ingestionOutbox||{},x=d.deletionOutbox||{};$('ingestionPending').textContent=n(i.pending)+' offen';$('ingestionMeta').textContent=n(i.delivered)+' zugestellt · '+n(i.dead)+' endgültige Fehler';$('deletionPending').textContent=n(x.pending)+' offen';$('deletionMeta').textContent=n(x.delivered)+' zugestellt · '+n(x.dead)+' endgültige Fehler';
const jobs=d.recentJobs||[];$('jobCount').textContent=jobs.length+' zuletzt';$('jobs').innerHTML=jobs.map(x=>'<tr><td title="'+esc(x.path)+'">'+esc(x.path)+'</td><td><span class="state '+String(x.status).toLowerCase()+'">'+esc(x.status)+'</span></td><td>'+esc(x.workerId||'—')+'</td><td>'+n(x.attempt)+' / '+n(x.maxAttempts)+'</td><td>'+date(x.updatedAt)+'</td><td class="error-cell" title="'+esc(x.lastError||'')+'">'+esc(x.lastError||'—')+'</td></tr>').join('')||'<tr><td colspan="6">Noch keine Jobs vorhanden.</td></tr>';
$('updated').textContent='Aktualisiert '+date(d.generatedAt);const s=d.latestScan;$('scanInfo').textContent=s?'Letzter Scan: '+s.status+' · '+n(s.filesSeen)+' Dateien · '+date(s.completedAt||s.startedAt):'Noch kein Bibliotheks-Scan';}
function formatDuration(seconds){const value=Math.max(0,Math.floor(seconds)),minutes=Math.floor(value/60),rest=value%60;return minutes+'m '+String(rest).padStart(2,'0')+'s';}

function updateCooldownCountdowns(){const now=Date.now();document.querySelectorAll('.cooldown-countdown').forEach(el=>{const started=Date.parse(el.dataset.startedAt),until=Date.parse(el.dataset.until);if(!Number.isFinite(started)||!Number.isFinite(until)){el.textContent='Cooldown-Zeit nicht verf\u00fcgbar';return;}const elapsed=Math.max(0,Math.floor((now-started)/1000)),remaining=Math.max(0,Math.ceil((until-now)/1000));el.textContent=remaining>0?'Pausiert seit '+formatDuration(elapsed)+' \u00b7 N\u00e4chster Batch in '+formatDuration(remaining):'Pausiert seit '+formatDuration(elapsed)+' \u00b7 Cooldown abgelaufen, Statusupdate ausstehend';});}
setInterval(updateCooldownCountdowns,1000);

function renderActiveStreams(items){$('activeStreamCount').textContent=items.length+' Streams';$('activeStreams').innerHTML=items.map(s=>'<tr><td>'+esc(s.host||'unbekannt')+'</td><td>'+esc(s.title||'Unbekannter Titel')+'</td><td>'+date(s.startedAt)+'</td><td class="stream-duration" data-started-at="'+esc(s.startedAt)+'">—</td></tr>').join('')||'<tr><td colspan="4" class="empty">Aktuell werden keine Audiodaten übertragen.</td></tr>';updateActiveStreamDurations();}
function updateActiveStreamDurations(){const now=Date.now();document.querySelectorAll('.stream-duration').forEach(el=>{const started=Date.parse(el.dataset.startedAt);el.textContent=Number.isFinite(started)?formatDuration((now-started)/1000):'—';});}
setInterval(updateActiveStreamDurations,1000);

function renderPairing(items){
 const host=$('gpuPairing');
 if(!items.length){host.innerHTML='<div class="empty">Keine offenen GPU-Anfragen.</div>';return;}
 host.innerHTML=items.map(w=>'<article class="pairing-request"><div class="pairing-info"><b>'+esc(w.workerId)+'</b><span class="type gpu">GPU · wartet auf Freigabe</span><small>Hostname (vom Worker gemeldet): '+esc(w.hostname)+'</small><small>Version: '+esc(w.workerVersion||'—')+' · Modell: '+esc(w.modelId)+'</small><small>Capabilities: '+esc((w.capabilities||[]).join(', ')||'—')+'</small><small>Angefragt: '+date(w.createdAt)+' · Ablauf: '+date(w.expiresAt)+'</small></div><div class="pairing-actions"><button data-pairing-action="approve" data-registration="'+esc(w.registrationId)+'">Freigeben</button><button class="reject" data-pairing-action="reject" data-registration="'+esc(w.registrationId)+'">Ablehnen</button></div></article>').join('');
}
let refreshInFlight=false;
async function refresh(){
 if(refreshInFlight)return;
 refreshInFlight=true;
 try{
  const [o,h,p,a]=await Promise.all([
   fetch('api/overview').then(r=>{if(r.status===401){showLogin();throw Error('Anmeldung erforderlich');}if(!r.ok)throw Error('Gateway '+r.status);return r.json()}),
   fetch('api/health').then(r=>r.json()),
   fetch('api/gpu-worker-registrations').then(r=>r.ok?r.json():[]),
   fetch('api/active-streams').then(r=>{if(!r.ok)throw Error('Aktive Streams '+r.status);return r.json()})
  ]);
  render(o);renderPairing(Array.isArray(p)?p:[]);renderActiveStreams(Array.isArray(a)?a:[]);
  const ok=h.gateway?.reachable&&h.search?.reachable;
  $('systemDot').style.background=ok?'var(--green)':'var(--red)';
  $('systemStatus').textContent=ok?'Gateway & Search bereit':'Service pr\u00fcfen';
 }catch(e){
  $('systemDot').style.background='var(--red)';
  $('systemStatus').textContent='Verbindung gest\u00f6rt';
  $('updated').textContent=e.message; } finally{refreshInFlight=false;}
}
$('gpuPairing').addEventListener('click',async e=>{
 const b=e.target.closest('button[data-pairing-action]');if(!b)return;
 b.disabled=true;
 try{
  const r=await fetch('api/gpu-worker-registrations/'+encodeURIComponent(b.dataset.registration)+'/'+b.dataset.pairingAction,{method:'POST'});
  if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(d.error||'HTTP '+r.status);}
  await refresh();
 }catch(err){b.disabled=false;alert('GPU-Freigabe fehlgeschlagen: '+err.message);}
});
$('workers').addEventListener('click',async e=>{
 const b=e.target.closest('button[data-worker-action="revoke"]');if(!b)return;
 const workerId=b.dataset.workerId;
 if(!confirm('GPU-Session von '+workerId+' sofort entziehen?'))return;
 b.disabled=true;
 try{
  const r=await fetch('api/gpu-workers/'+encodeURIComponent(workerId)+'/session',{method:'DELETE'});
  if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(d.error||'HTTP '+r.status);}
  await refresh();
 }catch(err){b.disabled=false;alert('GPU-Session konnte nicht entzogen werden: '+err.message);}
});
$('searchForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;$('results').textContent='Suche läuft …';try{const r=await fetch('api/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:$('query').value})}),d=await r.json();if(!r.ok)throw Error(d.message||d.error||'HTTP '+r.status);$('results').className='results';$('results').innerHTML=(d.results||[]).map(x=>'<div class="result"><div><b>'+esc(x.title||x.trackId)+'</b><small>Rang '+n(x.rank)+' · Score '+Number(x.score||0).toFixed(3)+' · '+esc(x.trackId)+'</small></div><button data-track="'+esc(x.trackId)+'">▶ Abspielen</button></div>').join('')||'Keine Treffer.';}catch(err){$('results').textContent='Suche fehlgeschlagen: '+err.message;}finally{b.disabled=false;}});
$('results').addEventListener('click',async e=>{const b=e.target.closest('button[data-track]');if(!b)return;b.disabled=true;try{const r=await fetch('api/tracks/'+encodeURIComponent(b.dataset.track)+'/stream-ticket',{method:'POST'}),t=await r.json();if(!r.ok)throw Error('HTTP '+r.status);let p=$('player');if(!p){p=document.createElement('audio');p.id='player';p.controls=true;p.style.width='100%';$('results').prepend(p);}p.src='api/stream/'+encodeURIComponent(t.ticketId);await p.play();}catch(err){b.textContent='Fehler: '+err.message;}finally{b.disabled=false;}});
let refreshTimer;
function startDashboard(){refresh();if(!refreshTimer)refreshTimer=setInterval(refresh,4000);}
function showLogin(message=''){$('loginOverlay').hidden=false;$('logoutButton').hidden=true;$('loginError').textContent=message;$('adminPassword').focus();}
async function initAuth(){try{const r=await fetch('api/auth/status',{cache:'no-store'}),s=await r.json();if(s.passwordRequired&&!s.authenticated){showLogin();return;}$('loginOverlay').hidden=true;$('logoutButton').hidden=!s.passwordRequired;startDashboard();}catch(e){showLogin('Anmeldung konnte nicht geprueft werden. Bitte erneut versuchen.');}}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;$('loginError').textContent='';try{const r=await fetch('api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:$('adminPassword').value})}),d=await r.json();if(!r.ok)throw Error(d.error||'Anmeldung fehlgeschlagen');$('adminPassword').value='';$('loginOverlay').hidden=true;$('logoutButton').hidden=false;startDashboard();}catch(err){$('loginError').textContent=err.message;$('adminPassword').select();}finally{b.disabled=false;}});
$('logoutButton').addEventListener('click',async()=>{await fetch('api/auth/logout',{method:'POST'});showLogin('Du wurdest abgemeldet.');});
initAuth();