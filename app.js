import {
  getSpotifyConfig, saveSpotifyConfig, getSpotifyTokens, clearSpotifySession,
  connectSpotify, handleSpotifyCallback, spotifyMe, spotifyPlayback, spotifyPlayTrack,
  spotifySearchAdmin
} from './spotify.js';
import {
  getFirebaseConfig, saveFirebaseConfig, clearFirebaseConfig, initFirebase, isCloudReady,
  ensureGuestAuth, adminLogin, adminLogout, currentUser, onAuth, subscribeCloud,
  writeMeta, createRequest, updateRequest, deleteRequest, addQueue, removeQueue, addHistory
} from './firebase-adapter.js';

const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const app=$('#app');
const channel=('BroadcastChannel' in window)?new BroadcastChannel('somusic-v1'):null;
const STORAGE='somusic_local_state_v1';
const DEVICE='somusic_device_id_v1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const fmtDuration=ms=>{const s=Math.max(0,Math.round(Number(ms||0)/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`};
const fmtTime=ts=>new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit'}).format(new Date(Number(ts||Date.now())));
const deviceId=localStorage.getItem(DEVICE)||uid(); localStorage.setItem(DEVICE,deviceId);
const tableId=new URLSearchParams(location.search).get('table')||'07';

const demoTracks=[
  {id:'demo-niki',uri:'spotify:track:demo-niki',title:'Every Summertime',artist:'NIKI',durationMs:215000,duration:'3:35',image:''},
  {id:'demo-laufey',uri:'spotify:track:demo-laufey',title:'From The Start',artist:'Laufey',durationMs:229000,duration:'3:49',image:''},
  {id:'demo-joji',uri:'spotify:track:demo-joji',title:'Glimpse of Us',artist:'Joji',durationMs:233000,duration:'3:53',image:''},
  {id:'demo-wave',uri:'spotify:track:demo-wave',title:'seasons',artist:'wave to earth',durationMs:256000,duration:'4:16',image:''},
  {id:'demo-lauv',uri:'spotify:track:demo-lauv',title:'I Like Me Better',artist:'Lauv',durationMs:197000,duration:'3:17',image:''},
  {id:'demo-bruno',uri:'spotify:track:demo-bruno',title:'Die With A Smile',artist:'Lady Gaga, Bruno Mars',durationMs:251000,duration:'4:11',image:''},
  {id:'demo-keshi',uri:'spotify:track:demo-keshi',title:'LIMBO',artist:'keshi',durationMs:212000,duration:'3:32',image:''},
  {id:'demo-beabadoobee',uri:'spotify:track:demo-bea',title:'the perfect pair',artist:'beabadoobee',durationMs:178000,duration:'2:58',image:''}
];
const defaultMeta={
  brandName:'Tianlala Gunung Sabeulah', brandSub:'Music Request Experience',
  logoDataUrl:'./assets/logo.svg',
  theme:{primary:'#b72542',primary2:'#ff8b68',accent:'#ffd98d',bg:'#120b0d',bg2:'#220d13',glow:46,mode:'ambient',card:'glass'},
  wifi:{ssid:'Tianlala Guest',password:'',security:'WPA'},
  policy:{manualApproval:true,maxActive:1,cooldownMin:5,maxDurationMin:7,blockDuplicate:true,explicitAllowed:false},
  tables:Array.from({length:10},(_,i)=>String(i+1).padStart(2,'0')),
  spotifySearchProxy:'',
  player:{autoPlay:true},
  nowPlaying:{title:'From The Start',artist:'Laufey',durationMs:229000,startedAt:Date.now()-92000,image:'',requestId:'demo-now'}
};
const localDefault=()=>({meta:structuredClone(defaultMeta),requests:[],queue:[],history:[]});
let state={mode:'local',adminPage:'dashboard',authUser:null,...loadLocal()};
let customerTracks=demoTracks.slice();
let unsubCloud=null,authUnsub=null,spotifyTimer=null,progressTimer=null;

function loadLocal(){try{return {...localDefault(),...JSON.parse(localStorage.getItem(STORAGE)||'{}')}}catch{return localDefault()}}
function persistLocal(){if(state.mode!=='local')return;const s={meta:state.meta,requests:state.requests,queue:state.queue,history:state.history};localStorage.setItem(STORAGE,JSON.stringify(s));channel?.postMessage({type:'sync'})}
channel?.addEventListener('message',e=>{if(e.data?.type==='sync'&&state.mode==='local'){Object.assign(state,loadLocal());render()}});

function applyTheme(){
  const t={...defaultMeta.theme,...state.meta?.theme}; const r=document.documentElement.style;
  r.setProperty('--primary',t.primary);r.setProperty('--primary-2',t.primary2);r.setProperty('--accent',t.accent);r.setProperty('--bg',t.bg);r.setProperty('--bg-2',t.bg2);r.setProperty('--glow',String((Number(t.glow)||0)/100));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',t.bg);
}
function toast(title,msg=''){const el=document.createElement('div');el.className='toast';el.innerHTML=`<strong>${esc(title)}</strong>${msg?`<span>${esc(msg)}</span>`:''}`;$('#toastHost').append(el);setTimeout(()=>el.remove(),3600)}
function routeIsAdmin(){return location.hash.startsWith('#admin')}
function setAdminPage(page){state.adminPage=page;location.hash=`admin/${page}`;render()}
function parseAdminPage(){const p=location.hash.split('/')[1];return p||state.adminPage||'dashboard'}
window.addEventListener('hashchange',()=>{state.adminPage=parseAdminPage();render()});

async function boot(){
  try{if(await handleSpotifyCallback()) toast('Spotify terhubung','Sesi OAuth berhasil disimpan di perangkat kasir.')}catch(e){toast('Spotify gagal',e.message)}
  try{
    if(getFirebaseConfig()?.apiKey){
      await initFirebase(); state.mode='cloud';
      await ensureGuestAuth();
      authUnsub=onAuth(u=>{state.authUser=u; if(routeIsAdmin()) render()});
      unsubCloud=subscribeCloud({
        onMeta:m=>{state.meta={...structuredClone(defaultMeta),...m,theme:{...defaultMeta.theme,...m.theme},policy:{...defaultMeta.policy,...m.policy},wifi:{...defaultMeta.wifi,...m.wifi},player:{...defaultMeta.player,...m.player}};applyTheme();render()},
        onRequests:r=>{state.requests=r;render()}, onQueue:q=>{state.queue=q;render()}, onError:e=>console.warn('Cloud sync',e)
      });
    }
  }catch(e){state.mode='local';toast('Cloud tidak aktif',`${e.message} — kembali ke Demo Mode.`)}
  applyTheme();render();
  if('serviceWorker' in navigator && location.protocol!=='file:') navigator.serviceWorker.register('./sw.js').catch(()=>{});
  startProgressTicker(); startSpotifyAutomation();
}

function shell(content,{admin=false}={}){
  const m=state.meta||defaultMeta;
  if(admin) return `<div class="app-shell">${content}<div class="footer-note">SoMusic v0.1.0 • ${state.mode==='cloud'?'Cloud Sync':'Demo Mode / Local'} • Spotify opsional</div></div>`;
  return `<div class="app-shell"><header class="topbar"><div class="brand-lockup"><img class="brand-logo" src="${esc(m.logoDataUrl||'./assets/logo.svg')}" alt="Logo ${esc(m.brandName)}"><div class="brand-copy"><div class="brand-name">${esc(m.brandName)}</div><div class="brand-sub">${esc(m.brandSub||'Music Request')}</div></div></div><div class="live-badge"><i class="live-dot"></i>${state.mode==='cloud'?'Live':'Demo'}</div></header>${content}<div class="footer-note">Scan • Request • Enjoy the vibe · Meja ${esc(tableId)}</div></div>`;
}

function render(){applyTheme(); if(routeIsAdmin())renderAdmin();else renderCustomer()}

function nowProgress(){const n=state.meta?.nowPlaying;if(!n?.durationMs)return {pct:0,elapsed:0};const elapsed=clamp(Date.now()-Number(n.startedAt||Date.now()),0,n.durationMs);return {pct:clamp(elapsed/n.durationMs*100,0,100),elapsed}}
function currentOwnRequest(){return state.requests.filter(r=>r.deviceId===deviceId&&r.tableId===tableId&&!['rejected','played','cancelled'].includes(r.status)).sort((a,b)=>(b.createdAtMs||0)-(a.createdAtMs||0))[0]||null}
function queuePosition(requestId){const idx=state.queue.findIndex(x=>x.requestId===requestId);return idx<0?null:idx+1}
function estimatedWait(requestId){const idx=state.queue.findIndex(x=>x.requestId===requestId);if(idx<0)return 0;const p=nowProgress();let ms=Math.max(0,(state.meta?.nowPlaying?.durationMs||0)-p.elapsed);for(let i=0;i<idx;i++)ms+=Number(state.queue[i].durationMs||0);return ms}

function renderCustomer(){
  const n=state.meta?.nowPlaying||defaultMeta.nowPlaying,p=nowProgress(),own=currentOwnRequest();
  const meong=own?.status==='pending'?'Request kamu lagi nunggu kasir. Santai, Meong jagain antreannya. 😺':own?.status==='approved'?'Sip! Lagumu sudah disetujui. Tinggal tunggu giliran. ✨':'Cari lagu yang bikin minumanmu punya soundtrack. Surprise Me tetap ada. 😺';
  app.innerHTML=shell(`<main class="customer-grid">
    <div class="stack">
      <section class="glass hero-card">
        <div class="hero-head"><div><div class="eyebrow">NOW PLAYING</div><div class="tiny muted">Musik pilihan customer & kasir</div></div><div class="live-badge"><i class="live-dot"></i>${state.mode==='cloud'?'LIVE':'DEMO'}</div></div>
        <div class="cassette-stage"><div class="orbit"></div><span class="note note-a">♪</span><span class="note note-b">♫</span><span class="note note-c">♪</span><div class="cassette"><span class="cassette-tag">Chill</span><div class="cassette-window"><span class="tape-line"></span><i class="reel"></i><i class="reel"></i></div><span class="cassette-smile"></span></div></div>
        <div class="now-copy"><div class="now-title">${esc(n.title||'Belum ada lagu')}</div><div class="now-artist">${esc(n.artist||'—')}</div><div class="progress-track"><div id="nowProgress" class="progress-fill" style="width:${p.pct}%"></div></div><div class="time-row"><span id="nowElapsed">${fmtDuration(p.elapsed)}</span><span>${fmtDuration(n.durationMs)}</span></div></div>
      </section>
      <section class="glass meong-card"><div class="meong-avatar">😺</div><div class="meong-bubble"><strong>MEONG DJ</strong><span>${esc(meong)}</span></div></section>
      <section class="glass queue-preview"><div class="panel-head"><div><div class="eyebrow">NEXT UP</div><div class="section-title">Antrean malam ini</div></div><div class="tiny muted">${state.queue.length} lagu</div></div><div>${renderQueuePreview()}</div></section>
    </div>
    <div class="stack">
      ${renderOwnStatus(own)}
      <section class="glass search-panel"><div class="panel-head"><div><div class="eyebrow">MEJA ${esc(tableId)}</div><div class="section-title">Mau denger apa?</div></div><span class="status-pill ${state.meta?.policy?.manualApproval?'status-pending':'status-approved'}">${state.meta?.policy?.manualApproval?'Approval kasir':'Auto approve'}</span></div><div class="search-wrap"><input id="songSearch" autocomplete="off" placeholder="Cari judul atau artist..." aria-label="Cari lagu"><button id="surpriseBtn" class="icon-btn" title="Surprise Me">✨</button></div><div id="searchResults" class="search-results">${renderTrackCards(demoTracks.slice(0,5))}</div></section>
      ${renderWifiMini()}
    </div>
  </main>`);
  bindCustomer();
}
function renderOwnStatus(r){
  if(!r)return `<section class="glass request-status"><div class="eyebrow">YOUR REQUEST</div><div class="status-card" style="margin-top:10px"><div class="muted small">Belum ada request aktif. Pilih satu lagu dan biarkan kasir yang atur flow-nya.</div></div></section>`;
  const pos=queuePosition(r.id),wait=estimatedWait(r.id);let label='Menunggu kasir',cls='status-pending';if(r.status==='approved'){label=pos?`Antrean #${pos}`:'Disetujui';cls='status-approved'}if(r.status==='playing'){label='Sedang diputar';cls='status-approved'}
  return `<section class="glass request-status"><div class="eyebrow">YOUR REQUEST</div><div class="status-card" style="margin-top:10px"><div class="status-row"><div style="min-width:0"><div class="track-title">${esc(r.title)}</div><div class="track-artist">${esc(r.artist)}</div></div><span class="status-pill ${cls}">${esc(label)}</span></div>${r.status==='approved'&&pos?`<div class="small muted" style="margin-top:10px">Estimasi ± ${Math.max(1,Math.ceil(wait/60000))} menit lagi.</div>`:''}</div></section>`
}
function renderQueuePreview(){if(!state.queue.length)return `<div class="empty-state"><div class="empty-icon">♫</div>Belum ada antrean. Kamu bisa jadi yang pertama.</div>`;return state.queue.slice(0,5).map((q,i)=>`<div class="queue-item"><div class="queue-no">${i+1}</div><div style="min-width:0"><div class="track-title">${esc(q.title)}</div><div class="queue-meta">Meja ${esc(q.tableId||'—')} · ${esc(q.artist)}</div></div><div class="tiny muted">${fmtDuration(q.durationMs)}</div></div>`).join('')}
function renderWifiMini(){const w=state.meta?.wifi||{};if(!w.ssid)return'';return `<section class="glass section"><div class="panel-head"><div><div class="eyebrow">GUEST WI-FI</div><div class="section-title">${esc(w.ssid)}</div></div><button id="wifiShowBtn" class="pill-btn">📶 Lihat</button></div><div class="tiny muted">Tap untuk lihat password / QR Wi‑Fi.</div></section>`}
function renderTrackCards(tracks){if(!tracks.length)return `<div class="empty-state">Lagu nggak ketemu.</div>`;return tracks.map(t=>`<div class="track-card"><div class="track-art">${t.image?`<img src="${esc(t.image)}" alt="">`:'♪'}</div><div style="min-width:0"><div class="track-title">${esc(t.title)}</div><div class="track-artist">${esc(t.artist)} · ${esc(t.duration||fmtDuration(t.durationMs))}</div></div><button class="request-btn" data-request-track="${esc(t.id)}" aria-label="Request ${esc(t.title)}">+</button></div>`).join('')}

function bindCustomer(){
  let timer; const input=$('#songSearch');
  input?.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>customerSearch(input.value),350)});
  $$('#searchResults [data-request-track]').forEach(b=>b.addEventListener('click',()=>requestTrackById(b.dataset.requestTrack)));
  $('#surpriseBtn')?.addEventListener('click',()=>requestTrack(demoTracks[Math.floor(Math.random()*demoTracks.length)]));
  $('#wifiShowBtn')?.addEventListener('click',showWifiModal);
}
async function customerSearch(q){
  q=q.trim();if(!q){customerTracks=demoTracks.slice(0,5);$('#searchResults').innerHTML=renderTrackCards(customerTracks);bindTrackButtons();return}
  let tracks=[];
  if(state.meta?.spotifySearchProxy){
    try{const url=new URL(state.meta.spotifySearchProxy);url.searchParams.set('q',q);url.searchParams.set('limit','8');const res=await fetch(url);if(!res.ok)throw new Error('Search gagal');const d=await res.json();tracks=Array.isArray(d)?d:(d.tracks||[])}catch(e){console.warn(e)}
  }
  if(!tracks.length)tracks=demoTracks.filter(t=>`${t.title} ${t.artist}`.toLowerCase().includes(q.toLowerCase()));
  customerTracks=tracks;
  $('#searchResults').innerHTML=renderTrackCards(tracks);bindTrackButtons();
}
function bindTrackButtons(){ $$('#searchResults [data-request-track]').forEach(b=>b.addEventListener('click',()=>requestTrackById(b.dataset.requestTrack))) }
async function requestTrackById(id){let t=customerTracks.find(x=>x.id===id)||demoTracks.find(x=>x.id===id);if(t)await requestTrack(t)}
async function requestTrack(t){
  const p=state.meta?.policy||defaultMeta.policy;const active=state.requests.filter(r=>r.deviceId===deviceId&&r.tableId===tableId&&!['rejected','played','cancelled'].includes(r.status));
  if(active.length>=Number(p.maxActive||1)){toast('Masih ada request aktif','Tunggu request sebelumnya selesai dulu.');return}
  if(Number(t.durationMs||0)>Number(p.maxDurationMin||7)*60000){toast('Lagunya terlalu panjang',`Maksimal ${p.maxDurationMin} menit.`);return}
  if(p.blockDuplicate&&(state.queue.some(q=>q.title===t.title&&q.artist===t.artist)||state.meta?.nowPlaying?.title===t.title)){toast('Lagu sedang/akan diputar','Pilih lagu lain dulu ya.');return}
  const last=state.requests.filter(r=>r.deviceId===deviceId).sort((a,b)=>(b.createdAtMs||0)-(a.createdAtMs||0))[0];
  const cooldown=Number(p.cooldownMin||0)*60000;if(last&&Date.now()-Number(last.createdAtMs||0)<cooldown&&['played','rejected','cancelled'].includes(last.status)){toast('Cooldown aktif',`Coba lagi sekitar ${p.cooldownMin} menit.`);return}
  const req={id:uid(),deviceId,tableId,title:t.title,artist:t.artist,trackId:t.id,uri:t.uri||'',durationMs:Number(t.durationMs||0),image:t.image||'',status:p.manualApproval?'pending':'approved',createdAtMs:Date.now()};
  try{
    if(state.mode==='cloud'){const id=await createRequest(req);req.id=id}else{state.requests.push(req);persistLocal()}
    if(!p.manualApproval){
      const item={id:uid(),requestId:req.id,tableId:req.tableId,title:req.title,artist:req.artist,trackId:req.trackId,uri:req.uri,durationMs:req.durationMs,image:req.image||'',position:Date.now(),createdAtMs:Date.now()};
      if(state.mode==='cloud') await addQueue(item); else {state.queue.push(item);persistLocal()}
    }
    toast('Request masuk! ',p.manualApproval?'Kasir akan approve dulu.':'Langsung masuk antrean.');
    render();
  }catch(e){toast('Request gagal',e.message)}
}
function showWifiModal(){const w=state.meta?.wifi||{};const wifi=`WIFI:T:${w.security||'WPA'};S:${w.ssid||''};P:${w.password||''};;`;showModal(`<div class="modal-head"><div><div class="eyebrow">GUEST WI-FI</div><h2>${esc(w.ssid||'Wi-Fi')}</h2></div><button class="icon-btn" data-close-modal>×</button></div><div class="qr-box" id="wifiQr"><div class="qr-fallback">${esc(wifi)}</div></div><div class="field"><span class="field-label">Password</span><div class="code-chip">${esc(w.password||'(tanpa password)')}</div></div>`,()=>drawQr('wifiQr',wifi))}

function renderAdmin(){
  if(state.mode==='cloud' && !state.authUser?.email){
    app.innerHTML=shell(`<div style="max-width:520px;margin:70px auto"><section class="glass panel"><div class="eyebrow">SOMUSIC ADMIN</div><h1 style="margin:7px 0 6px">Login kasir / admin</h1><p class="muted small">Cloud Mode aktif. Masuk dengan akun Firebase Email/Password yang diizinkan oleh Firestore Rules.</p><div class="form-grid" style="margin-top:16px"><div class="field full"><label>Email</label><input id="gateEmail" type="email" autocomplete="username"></div><div class="field full"><label>Password</label><input id="gatePassword" type="password" autocomplete="current-password"></div></div><button id="gateLogin" class="primary-btn" style="width:100%;margin-top:15px">Masuk Admin</button><a class="ghost-btn" href="${location.pathname}?table=07" style="width:100%;margin-top:8px">Kembali ke Customer</a></section></div>`,{admin:true});
    $('#gateLogin')?.addEventListener('click',async()=>{try{await adminLogin($('#gateEmail').value,$('#gatePassword').value);toast('Login berhasil');render()}catch(e){toast('Login gagal',e.message)}});
    return;
  }
  state.adminPage=parseAdminPage();const nav=[['dashboard','⌂','Dashboard'],['requests','♫','Requests'],['queue','≡','Queue'],['tables','▦','Tables & QR'],['appearance','✦','Appearance'],['spotify','●','Spotify'],['wifi','⌁','Wi‑Fi'],['settings','⚙','Settings']];
  const title=nav.find(x=>x[0]===state.adminPage)?.[2]||'Dashboard';
  app.innerHTML=shell(`<div class="admin-layout"><aside class="glass admin-sidebar"><div class="admin-brand"><div class="eyebrow">SOMUSIC ADMIN</div><div style="font-weight:850;margin-top:5px">${esc(state.meta?.brandName)}</div></div><nav class="admin-nav">${nav.map(([id,ic,n])=>`<button class="nav-btn ${state.adminPage===id?'active':''}" data-admin-page="${id}"><span>${ic}</span>${n}</button>`).join('')}</nav></aside><main class="admin-content"><header class="admin-header"><div><div class="eyebrow">${state.mode==='cloud'?'CLOUD SYNC':'DEMO MODE'}</div><h1>${esc(title)}</h1></div><div class="admin-actions"><a class="ghost-btn" href="${location.pathname}?table=07">Customer View</a>${state.mode==='cloud'?`<span class="pill-btn">${state.authUser?.email?esc(state.authUser.email):'Guest/Anonymous'}</span>`:''}</div></header>${renderAdminPage()}</main></div>`,{admin:true});bindAdmin();
}
function renderAdminPage(){switch(state.adminPage){case'requests':return pageRequests();case'queue':return pageQueue();case'tables':return pageTables();case'appearance':return pageAppearance();case'spotify':return pageSpotify();case'wifi':return pageWifi();case'settings':return pageSettings();default:return pageDashboard()}}
function pending(){return state.requests.filter(r=>r.status==='pending')}
function pageDashboard(){return `<div class="stat-grid"><div class="glass stat-card"><div class="eyebrow">WAITING</div><div class="stat-value">${pending().length}</div><div class="stat-label">request butuh approval</div></div><div class="glass stat-card"><div class="eyebrow">QUEUE</div><div class="stat-value">${state.queue.length}</div><div class="stat-label">lagu berikutnya</div></div><div class="glass stat-card"><div class="eyebrow">TABLES</div><div class="stat-value">${state.meta?.tables?.length||0}</div><div class="stat-label">QR siap dipakai</div></div><div class="glass stat-card"><div class="eyebrow">PLAYER</div><div class="stat-value" style="font-size:20px">${getSpotifyTokens()?'Ready':'Demo'}</div><div class="stat-label">${getSpotifyTokens()?'Spotify connected':'belum ada Spotify'}</div></div></div><div class="content-grid"><section class="glass panel"><div class="panel-head"><div><div class="eyebrow">INCOMING</div><h2>Request terbaru</h2></div><button class="pill-btn" data-admin-page="requests">Lihat semua</button></div>${renderRequestsList(pending().slice(0,6))}</section><section class="glass panel"><div class="panel-head"><div><div class="eyebrow">NOW PLAYING</div><h2>${esc(state.meta?.nowPlaying?.title||'—')}</h2></div></div><div class="small muted">${esc(state.meta?.nowPlaying?.artist||'—')}</div><div class="progress-track"><div id="nowProgress" class="progress-fill" style="width:${nowProgress().pct}%"></div></div><div class="time-row"><span id="nowElapsed">${fmtDuration(nowProgress().elapsed)}</span><span>${fmtDuration(state.meta?.nowPlaying?.durationMs)}</span></div><div style="height:12px"></div><div class="panel-head"><div><div class="eyebrow">NEXT</div><h2>Queue</h2></div><button id="playNextBtn" class="primary-btn" ${!state.queue.length?'disabled':''}>▶ Play next</button></div>${renderAdminQueue(state.queue.slice(0,4))}</section></div>`}
function renderRequestsList(list){if(!list.length)return `<div class="empty-state"><div class="empty-icon">😺</div>Belum ada request yang menunggu.</div>`;return `<div class="list">${list.map(r=>`<div class="request-row"><div style="min-width:0"><div class="tiny muted">Meja ${esc(r.tableId)} · ${fmtTime(r.createdAtMs)}</div><div class="track-title">${esc(r.title)}</div><div class="track-artist">${esc(r.artist)} · ${fmtDuration(r.durationMs)}</div></div><div class="row-actions"><button class="mini-btn approve" data-approve="${esc(r.id)}">✓ Approve</button><button class="mini-btn reject" data-reject="${esc(r.id)}">× Reject</button></div></div>`).join('')}</div>`}
function pageRequests(){const p=pending(),other=state.requests.filter(r=>r.status!=='pending').slice().sort((a,b)=>(b.createdAtMs||0)-(a.createdAtMs||0)).slice(0,15);return `<section class="glass panel"><div class="panel-head"><div><div class="eyebrow">WAITING APPROVAL</div><h2>${p.length} request masuk</h2></div><span class="status-pill status-pending">Manual approval</span></div>${renderRequestsList(p)}</section><section class="glass panel" style="margin-top:14px"><div class="panel-head"><div><div class="eyebrow">RECENT</div><h2>Riwayat request</h2></div></div>${other.length?`<div class="list">${other.map(r=>`<div class="queue-item"><div class="queue-no">${r.status==='approved'?'✓':r.status==='rejected'?'×':'♪'}</div><div><div class="track-title">${esc(r.title)}</div><div class="queue-meta">Meja ${esc(r.tableId)} · ${esc(r.artist)}</div></div><span class="status-pill ${r.status==='rejected'?'status-rejected':'status-approved'}">${esc(r.status)}</span></div>`).join('')}</div>`:`<div class="empty-state">Belum ada riwayat.</div>`}</section>`}
function renderAdminQueue(list){if(!list.length)return `<div class="empty-state">Queue masih kosong.</div>`;return `<div class="list">${list.map((q,i)=>`<div class="request-row"><div style="display:flex;gap:10px;align-items:center;min-width:0"><div class="queue-no">${i+1}</div><div style="min-width:0"><div class="track-title">${esc(q.title)}</div><div class="track-artist">Meja ${esc(q.tableId)} · ${esc(q.artist)}</div></div></div><div class="row-actions"><button class="mini-btn play" data-play-queue="${esc(q.id)}">▶ Play</button><button class="mini-btn" data-remove-queue="${esc(q.id)}">×</button></div></div>`).join('')}</div>`}
function pageQueue(){return `<section class="glass panel"><div class="panel-head"><div><div class="eyebrow">APPROVED QUEUE</div><h2>${state.queue.length} lagu menunggu</h2></div><button id="playNextBtn" class="primary-btn" ${!state.queue.length?'disabled':''}>▶ Play next</button></div>${renderAdminQueue(state.queue)}</section>`}
function pageTables(){const base=`${location.origin}${location.pathname}`;return `<section class="glass panel"><div class="panel-head"><div><div class="eyebrow">QR PER MEJA</div><h2>Customer entry point</h2></div><button id="printQrBtn" class="pill-btn">Print page</button></div><div class="notice">Setiap QR membawa nomor meja otomatis. Customer tidak perlu login.</div><div class="qr-grid" style="margin-top:14px">${(state.meta?.tables||[]).map(t=>{const url=`${base}?table=${encodeURIComponent(t)}`;return`<div class="glass qr-card"><div class="eyebrow">MEJA</div><div class="stat-value">${esc(t)}</div><div class="qr-box" id="qr-${esc(t)}"><div class="qr-fallback">${esc(url)}</div></div><div class="code-chip">${esc(url)}</div></div>`}).join('')}</div></section>`}
function pageAppearance(){const m=state.meta,t=m.theme||defaultMeta.theme;return `<div class="appearance-grid"><section class="glass panel"><div class="panel-head"><div><div class="eyebrow">BRAND THEME</div><h2>Logo jadi sumber warna</h2></div></div><div class="upload-box"><img id="appearanceLogo" class="logo-preview" src="${esc(m.logoDataUrl)}" alt="Logo preview"><input id="logoUpload" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp"><button id="logoUploadBtn" class="primary-btn">Upload Logo</button><div class="tiny muted" style="margin-top:9px">Logo otomatis di-resize & dikompres di browser.</div></div><div class="form-grid" style="margin-top:14px"><div class="field full"><label>Nama brand</label><input id="brandNameInput" value="${esc(m.brandName)}"></div><div class="field full"><label>Subtitle</label><input id="brandSubInput" value="${esc(m.brandSub||'')}"></div></div><div style="margin-top:15px"><div class="field-label">Auto palette dari logo</div><div id="paletteBox" class="palette" style="margin-top:8px"><button class="swatch" style="background:${esc(t.primary)}" title="Primary"></button><button class="swatch" style="background:${esc(t.primary2)}" title="Secondary"></button><button class="swatch" style="background:${esc(t.accent)}" title="Accent"></button><button class="swatch" style="background:${esc(t.bg)}" title="Background"></button></div></div><div class="form-grid" style="margin-top:14px"><div class="field"><label>Primary</label><input id="primaryColor" type="color" value="${esc(t.primary)}"></div><div class="field"><label>Accent</label><input id="accentColor" type="color" value="${esc(t.accent)}"></div><div class="field full"><label>Glow intensity</label><div class="range-row"><input id="glowRange" type="range" min="0" max="100" value="${Number(t.glow||46)}"><span id="glowValue" class="tiny">${Number(t.glow||46)}%</span></div></div></div><div class="row-actions" style="margin-top:16px;justify-content:flex-start"><button id="autoThemeBtn" class="ghost-btn">✦ Generate ulang</button><button id="publishThemeBtn" class="primary-btn">Publish Theme</button></div></section><section class="glass panel"><div class="eyebrow">LIVE PREVIEW</div><div class="theme-preview" style="margin-top:10px"><i class="preview-orb"></i><div class="preview-phone"><div class="brand-lockup"><img class="brand-logo" id="previewLogo" src="${esc(m.logoDataUrl)}" alt=""><div><div id="previewBrand" class="brand-name">${esc(m.brandName)}</div><div class="brand-sub">MUSIC EXPERIENCE</div></div></div><div class="preview-hero"><div class="preview-disc"></div><div class="eyebrow">NOW PLAYING</div><div class="now-title" style="font-size:30px">Minumanmu punya <strong>soundtrack.</strong></div><div class="small muted">Theme mengikuti identitas logo outlet.</div><button class="primary-btn" style="margin-top:18px;width:100%">Mulai request lagu →</button></div></div></div></section></div>`}
function pageSpotify(){const c=getSpotifyConfig()||{},tok=getSpotifyTokens();return `<div class="stack"><section class="glass panel"><div class="panel-head"><div><div class="eyebrow">SPOTIFY PROVIDER</div><h2>${tok?'Connected':'Belum terhubung'}</h2></div><div class="spotify-status"><span><i class="status-dot2 ${tok?'online':'offline'}"></i>${tok?'Session ready':'Demo only'}</span></div></div><div class="notice">App tetap jalan tanpa Spotify. Untuk Spotify asli nanti import konfigurasi lalu Connect. Client Secret tidak disimpan di GitHub Pages; login browser menggunakan PKCE.</div><div class="form-grid" style="margin-top:14px"><div class="field full"><label>Client ID</label><input id="spotifyClientId" value="${esc(c.clientId||'')}" placeholder="Spotify Developer Client ID"></div><div class="field full"><label>Redirect URI</label><input id="spotifyRedirect" value="${esc(c.redirectUri||defaultRedirect())}" placeholder="https://username.github.io/repo/"><div class="field-help">Harus sama persis dengan Redirect URI di Spotify Developer Dashboard.</div></div><div class="field full"><label>Customer Search Proxy URL (opsional)</label><input id="spotifyProxy" value="${esc(c.searchProxyUrl||state.meta?.spotifySearchProxy||'')}" placeholder="https://your-worker.workers.dev/search"><div class="field-help">Dipakai customer untuk search Spotify tanpa membocorkan Client Secret.</div></div></div><div class="row-actions" style="justify-content:flex-start;margin-top:15px"><input id="spotifyConfigFile" type="file" accept="application/json,.json" class="sr-only"><button id="spotifyImportBtn" class="ghost-btn">Import Config JSON</button><button id="spotifySaveBtn" class="ghost-btn">Save Config</button>${tok?`<button id="spotifyTestBtn" class="primary-btn">Test Spotify</button><button id="spotifyDisconnectBtn" class="danger-btn">Disconnect</button>`:`<button id="spotifyConnectBtn" class="primary-btn">Connect Spotify</button>`}</div><div id="spotifyTestResult" class="tiny muted" style="margin-top:10px"></div></section><section class="glass panel"><div class="eyebrow">AUTO PLAYER</div><div class="switch-row"><div><div style="font-weight:750">Mainkan request otomatis</div><div class="tiny muted">Jika player Spotify sedang idle, request approved pertama diputar. Admin page harus tetap terbuka.</div></div><input id="autoPlaySwitch" class="switch" type="checkbox" ${state.meta?.player?.autoPlay?'checked':''}></div></section></div>`}
function pageWifi(){const w=state.meta?.wifi||defaultMeta.wifi;return `<div class="content-grid"><section class="glass panel"><div class="panel-head"><div><div class="eyebrow">GUEST WI-FI</div><h2>Sharing dari web customer</h2></div></div><div class="form-grid"><div class="field full"><label>SSID</label><input id="wifiSsid" value="${esc(w.ssid||'')}"></div><div class="field"><label>Security</label><select id="wifiSecurity"><option ${w.security==='WPA'?'selected':''}>WPA</option><option ${w.security==='WEP'?'selected':''}>WEP</option><option value="nopass" ${w.security==='nopass'?'selected':''}>Open / nopass</option></select></div><div class="field"><label>Password</label><input id="wifiPassword" value="${esc(w.password||'')}" autocomplete="off"></div></div><button id="saveWifiBtn" class="primary-btn" style="margin-top:15px">Save Wi‑Fi</button></section><section class="glass panel"><div class="eyebrow">QR PREVIEW</div><div class="qr-box" id="wifiAdminQr"><div class="qr-fallback">Wi-Fi QR</div></div><div class="tiny muted" style="text-align:center">Customer dapat membuka QR ini dari tombol Wi‑Fi.</div></section></div>`}
function pageSettings(){const f=getFirebaseConfig()||{};return `<div class="stack"><section class="glass panel"><div class="panel-head"><div><div class="eyebrow">SYNC ENGINE</div><h2>${state.mode==='cloud'?'Firebase Cloud aktif':'Demo Mode / Local'}</h2></div><span class="status-pill ${state.mode==='cloud'?'status-approved':'status-pending'}">${state.mode==='cloud'?'REALTIME':'LOCAL'}</span></div><div class="notice ${state.mode==='cloud'?'ok-notice':''}">${state.mode==='cloud'?'Customer dan kasir dapat sinkron lintas perangkat lewat Firestore.':'Tanpa Firebase, data hanya sinkron antar tab/browser di perangkat yang sama. Import Firebase config untuk lintas HP.'}</div><div class="form-grid" style="margin-top:14px"><div class="field full"><label>Venue ID</label><input id="venueId" value="${esc(f.venueId||'default')}"></div><div class="field full"><label>Firebase config JSON</label><textarea id="firebaseJson" rows="7" placeholder='{"apiKey":"...","authDomain":"...","projectId":"..."}'>${f.apiKey?esc(JSON.stringify(f,null,2)):''}</textarea></div></div><div class="row-actions" style="justify-content:flex-start;margin-top:14px"><input id="firebaseConfigFile" class="sr-only" type="file" accept="application/json,.json"><button id="firebaseImportBtn" class="ghost-btn">Import Firebase JSON</button><button id="firebaseSaveBtn" class="primary-btn">Save & Reload</button>${f.apiKey?`<button id="firebaseClearBtn" class="danger-btn">Disable Cloud</button>`:''}</div></section>${state.mode==='cloud'?`<section class="glass panel"><div class="eyebrow">ADMIN LOGIN</div><div class="form-grid" style="margin-top:12px"><div class="field"><label>Email</label><input id="adminEmail" type="email" value="${esc(state.authUser?.email||'')}"></div><div class="field"><label>Password</label><input id="adminPassword" type="password"></div></div><div class="row-actions" style="justify-content:flex-start;margin-top:14px">${state.authUser?.email?`<button id="adminLogoutBtn" class="danger-btn">Logout Admin</button>`:`<button id="adminLoginBtn" class="primary-btn">Login Admin</button>`}</div></section>`:''}<section class="glass panel"><div class="eyebrow">REQUEST RULES</div><div class="form-grid" style="margin-top:12px"><div class="field"><label>Max request aktif / device</label><input id="maxActive" type="number" min="1" max="5" value="${Number(state.meta?.policy?.maxActive||1)}"></div><div class="field"><label>Cooldown (menit)</label><input id="cooldownMin" type="number" min="0" max="120" value="${Number(state.meta?.policy?.cooldownMin||5)}"></div><div class="field"><label>Max durasi lagu (menit)</label><input id="maxDurationMin" type="number" min="1" max="20" value="${Number(state.meta?.policy?.maxDurationMin||7)}"></div><div class="field"><label>Jumlah meja</label><input id="tableCount" type="number" min="1" max="50" value="${state.meta?.tables?.length||10}"></div><div class="field full"><div class="switch-row"><div><div style="font-weight:750">Manual approval kasir</div><div class="tiny muted">Request tidak langsung masuk queue.</div></div><input id="manualApproval" class="switch" type="checkbox" ${state.meta?.policy?.manualApproval?'checked':''}></div></div></div><button id="saveRulesBtn" class="primary-btn" style="margin-top:14px">Save Rules</button></section></div>`}
function defaultRedirect(){return `${location.origin}${location.pathname}`}

function bindAdmin(){
  $$('[data-admin-page]').forEach(b=>b.addEventListener('click',()=>setAdminPage(b.dataset.adminPage)));
  $$('[data-approve]').forEach(b=>b.addEventListener('click',()=>approveRequest(b.dataset.approve)));
  $$('[data-reject]').forEach(b=>b.addEventListener('click',()=>rejectRequest(b.dataset.reject)));
  $$('[data-play-queue]').forEach(b=>b.addEventListener('click',()=>playQueueById(b.dataset.playQueue)));
  $$('[data-remove-queue]').forEach(b=>b.addEventListener('click',()=>removeQueueById(b.dataset.removeQueue)));
  $('#playNextBtn')?.addEventListener('click',playNext);
  if(state.adminPage==='tables'){setTimeout(renderTableQrs,50);$('#printQrBtn')?.addEventListener('click',()=>window.print())}
  if(state.adminPage==='appearance')bindAppearance();
  if(state.adminPage==='spotify')bindSpotifyPage();
  if(state.adminPage==='wifi')bindWifiPage();
  if(state.adminPage==='settings')bindSettingsPage();
}
async function approveRequest(id,silent=false){const r=state.requests.find(x=>x.id===id);if(!r)return;try{const item={id:uid(),requestId:r.id,tableId:r.tableId,title:r.title,artist:r.artist,trackId:r.trackId,uri:r.uri,durationMs:r.durationMs,image:r.image||'',position:Date.now(),createdAtMs:Date.now()};if(state.mode==='cloud'){await updateRequest(id,{status:'approved',approvedAtMs:Date.now()});await addQueue(item)}else{r.status='approved';state.queue.push(item);persistLocal()}if(!silent)toast('Request approved',`${r.title} masuk antrean.`);render();if(state.meta?.player?.autoPlay)getSpotifyTokens()&&setTimeout(()=>ensureAutoPlay(),250)}catch(e){toast('Approve gagal',e.message)}}
async function rejectRequest(id){const r=state.requests.find(x=>x.id===id);if(!r)return;try{if(state.mode==='cloud')await updateRequest(id,{status:'rejected',rejectedAtMs:Date.now()});else{r.status='rejected';persistLocal()}toast('Request ditolak',r.title);render()}catch(e){toast('Reject gagal',e.message)}}
async function removeQueueById(id){try{if(state.mode==='cloud')await removeQueue(id);else{state.queue=state.queue.filter(q=>q.id!==id);persistLocal()}render()}catch(e){toast('Gagal hapus queue',e.message)}}
async function playNext(){if(state.queue[0])await playQueueById(state.queue[0].id)}
async function playQueueById(id){const q=state.queue.find(x=>x.id===id);if(!q)return;try{
  await finalizeCurrentRequest();
  if(q.uri?.startsWith('spotify:')&&!q.uri.startsWith('spotify:track:demo-')){if(!getSpotifyTokens())throw new Error('Connect Spotify dulu.');await spotifyPlayTrack(q.uri)}
  const now={title:q.title,artist:q.artist,durationMs:q.durationMs,startedAt:Date.now(),image:q.image||'',requestId:q.requestId||''};
  if(state.mode==='cloud'){await writeMeta({nowPlaying:now});await removeQueue(q.id);if(q.requestId)await updateRequest(q.requestId,{status:'playing',playingAtMs:Date.now()});await addHistory(q)}else{state.meta.nowPlaying=now;state.queue=state.queue.filter(x=>x.id!==q.id);const r=state.requests.find(x=>x.id===q.requestId);if(r)r.status='playing';state.history.push({...q,playedAtMs:Date.now()});persistLocal()}
  toast(q.uri?.includes('demo-')?'Demo player':'Spotify play',q.title);render();
}catch(e){toast('Tidak bisa memutar',e.message)}}

function bindAppearance(){
  $('#logoUploadBtn')?.addEventListener('click',()=>$('#logoUpload').click());
  $('#logoUpload')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const data=await compressImage(f,320,.82);$('#appearanceLogo').src=data;$('#previewLogo').src=data;$('#appearanceLogo').dataset.newLogo=data;const pal=await extractPalette(data);applyPaletteToForm(pal);toast('Palette dibuat','Warna logo sudah dianalisis di browser.')}catch(err){toast('Logo gagal',err.message)}});
  ['primaryColor','accentColor','glowRange','brandNameInput'].forEach(id=>$('#'+id)?.addEventListener('input',previewTheme));
  $('#autoThemeBtn')?.addEventListener('click',async()=>{const src=$('#appearanceLogo').src;try{applyPaletteToForm(await extractPalette(src));previewTheme()}catch(e){toast('Palette gagal',e.message)}});
  $('#publishThemeBtn')?.addEventListener('click',publishTheme);
  previewTheme();
}
function applyPaletteToForm(p){$('#primaryColor').value=p.primary;$('#accentColor').value=p.accent;$('#appearanceLogo').dataset.primary2=p.primary2;$('#appearanceLogo').dataset.bg=p.bg;$('#appearanceLogo').dataset.bg2=p.bg2;const box=$('#paletteBox');if(box)box.innerHTML=[p.primary,p.primary2,p.accent,p.bg].map((c,i)=>`<span class="swatch" style="background:${c}" title="${['Primary','Secondary','Accent','Background'][i]}"></span>`).join('');previewTheme()}
function previewTheme(){const primary=$('#primaryColor')?.value||state.meta.theme.primary,accent=$('#accentColor')?.value||state.meta.theme.accent,glow=$('#glowRange')?.value||46;$('#glowValue')&&( $('#glowValue').textContent=`${glow}%`);$('#previewBrand')&&( $('#previewBrand').textContent=$('#brandNameInput')?.value||state.meta.brandName);const root=document.documentElement.style;root.setProperty('--primary',primary);root.setProperty('--primary-2',lighten(primary,.22));root.setProperty('--accent',accent);root.setProperty('--bg',darken(primary,.86));root.setProperty('--bg-2',darken(primary,.74));root.setProperty('--glow',String(glow/100))}
async function publishTheme(){const logo=$('#appearanceLogo').dataset.newLogo||state.meta.logoDataUrl;const primary=$('#primaryColor').value,accent=$('#accentColor').value;const palette={primary,primary2:lighten(primary,.22),accent,bg:darken(primary,.86),bg2:darken(primary,.74),glow:Number($('#glowRange').value),mode:'ambient',card:'glass'};const patch={brandName:$('#brandNameInput').value.trim()||'SoMusic',brandSub:$('#brandSubInput').value.trim(),logoDataUrl:logo,theme:palette};try{await updateMeta(patch);toast('Theme published','Customer view langsung ikut berubah.');render()}catch(e){toast('Publish gagal',e.message)}}

function bindSpotifyPage(){
  $('#spotifyImportBtn')?.addEventListener('click',()=>$('#spotifyConfigFile').click());
  $('#spotifyConfigFile')?.addEventListener('change',async e=>{try{const j=JSON.parse(await e.target.files[0].text());$('#spotifyClientId').value=j.clientId||j.client_id||'';$('#spotifyRedirect').value=j.redirectUri||j.redirect_uri||defaultRedirect();$('#spotifyProxy').value=j.searchProxyUrl||j.search_proxy_url||'';toast('Config dibaca','Cek lalu Save Config.')}catch(err){toast('JSON tidak valid',err.message)}});
  $('#spotifySaveBtn')?.addEventListener('click',saveSpotifyForm);
  $('#spotifyConnectBtn')?.addEventListener('click',async()=>{try{await saveSpotifyForm();await connectSpotify()}catch(e){toast('Connect gagal',e.message)}});
  $('#spotifyDisconnectBtn')?.addEventListener('click',()=>{clearSpotifySession();toast('Spotify disconnected');render()});
  $('#spotifyTestBtn')?.addEventListener('click',async()=>{try{const me=await spotifyMe();$('#spotifyTestResult').textContent=`Connected sebagai ${me.display_name||me.id}. Product: ${me.product||'unknown'}.`;toast('Spotify OK',me.display_name||me.id)}catch(e){$('#spotifyTestResult').textContent=e.message;toast('Spotify test gagal',e.message)}});
  $('#autoPlaySwitch')?.addEventListener('change',async e=>{await updateMeta({player:{...state.meta.player,autoPlay:e.target.checked}});toast('Auto Player',e.target.checked?'Aktif':'Nonaktif')});
}
async function saveSpotifyForm(){const cfg=saveSpotifyConfig({clientId:$('#spotifyClientId').value,redirectUri:$('#spotifyRedirect').value,searchProxyUrl:$('#spotifyProxy').value});await updateMeta({spotifySearchProxy:cfg.searchProxyUrl||''});toast('Spotify config tersimpan','Credential lokal tetap di perangkat kasir.');return cfg}

function bindWifiPage(){const draw=()=>{const w={ssid:$('#wifiSsid').value,password:$('#wifiPassword').value,security:$('#wifiSecurity').value};drawQr('wifiAdminQr',`WIFI:T:${w.security};S:${w.ssid};P:${w.password};;`)};['wifiSsid','wifiPassword','wifiSecurity'].forEach(id=>$('#'+id)?.addEventListener('input',draw));setTimeout(draw,70);$('#saveWifiBtn')?.addEventListener('click',async()=>{await updateMeta({wifi:{ssid:$('#wifiSsid').value.trim(),password:$('#wifiPassword').value,security:$('#wifiSecurity').value}});toast('Wi‑Fi disimpan','Customer view sudah diperbarui.');render()})}
function bindSettingsPage(){
  $('#firebaseImportBtn')?.addEventListener('click',()=>$('#firebaseConfigFile').click());
  $('#firebaseConfigFile')?.addEventListener('change',async e=>{try{const j=JSON.parse(await e.target.files[0].text());$('#firebaseJson').value=JSON.stringify(j,null,2);toast('Firebase config dibaca')}catch(err){toast('JSON tidak valid',err.message)}});
  $('#firebaseSaveBtn')?.addEventListener('click',()=>{try{const j=JSON.parse($('#firebaseJson').value||'{}');j.venueId=$('#venueId').value.trim()||'default';saveFirebaseConfig(j);location.reload()}catch(e){toast('Config salah',e.message)}});
  $('#firebaseClearBtn')?.addEventListener('click',()=>{clearFirebaseConfig();location.reload()});
  $('#adminLoginBtn')?.addEventListener('click',async()=>{try{await adminLogin($('#adminEmail').value,$('#adminPassword').value);toast('Admin login berhasil');render()}catch(e){toast('Login gagal',e.message)}});
  $('#adminLogoutBtn')?.addEventListener('click',async()=>{await adminLogout();toast('Logout admin');render()});
  $('#saveRulesBtn')?.addEventListener('click',async()=>{const count=clamp(Number($('#tableCount').value||10),1,50);const policy={...state.meta.policy,maxActive:clamp(Number($('#maxActive').value||1),1,5),cooldownMin:clamp(Number($('#cooldownMin').value||0),0,120),maxDurationMin:clamp(Number($('#maxDurationMin').value||7),1,20),manualApproval:$('#manualApproval').checked};await updateMeta({policy,tables:Array.from({length:count},(_,i)=>String(i+1).padStart(2,'0'))});toast('Rules disimpan');render()})
}
async function updateMeta(patch){if(state.mode==='cloud'){await writeMeta(patch)}else{state.meta={...state.meta,...patch,theme:{...state.meta.theme,...(patch.theme||{})},policy:{...state.meta.policy,...(patch.policy||{})},wifi:{...state.meta.wifi,...(patch.wifi||{})},player:{...state.meta.player,...(patch.player||{})}};persistLocal();applyTheme()}}

function renderTableQrs(){const base=`${location.origin}${location.pathname}`;(state.meta?.tables||[]).forEach(t=>drawQr(`qr-${t}`,`${base}?table=${encodeURIComponent(t)}`))}
function drawQr(id,text){const box=document.getElementById(id);if(!box)return;box.innerHTML='';if(typeof window.QRCode==='function'){try{new window.QRCode(box,{text,width:134,height:134,colorDark:'#111111',colorLight:'#ffffff',correctLevel:window.QRCode.CorrectLevel?.M});}catch(e){box.innerHTML=`<div class="qr-fallback">${esc(text)}</div>`}}else box.innerHTML=`<div class="qr-fallback">${esc(text)}</div>`}
function showModal(html,onOpen){const wrap=document.createElement('div');wrap.className='modal-backdrop';wrap.innerHTML=`<div class="glass modal">${html}</div>`;document.body.append(wrap);wrap.addEventListener('click',e=>{if(e.target===wrap||e.target.closest('[data-close-modal]'))wrap.remove()});onOpen?.(wrap)}

async function compressImage(file,max=320,quality=.82){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{const scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale)),c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0,w,h);URL.revokeObjectURL(url);resolve(c.toDataURL('image/webp',quality))};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Gambar tidak bisa dibaca.'))};img.src=url})}
async function extractPalette(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=80;c.height=80;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,80,80);const d=ctx.getImageData(0,0,80,80).data,bins=new Map();for(let i=0;i<d.length;i+=16){const a=d[i+3];if(a<150)continue;let r=d[i],g=d[i+1],b=d[i+2];const lum=.2126*r+.7152*g+.0722*b;if(lum>242||lum<15)continue;r=Math.round(r/32)*32;g=Math.round(g/32)*32;b=Math.round(b/32)*32;const k=`${r},${g},${b}`;bins.set(k,(bins.get(k)||0)+1)}const arr=[...bins.entries()].sort((a,b)=>b[1]-a[1]).map(([k])=>k.split(',').map(Number));const p=arr[0]||[183,37,66],p2=arr.find(x=>colorDistance(x,p)>90)||[255,139,104],acc=arr.find(x=>colorDistance(x,p)>145&&colorDistance(x,p2)>80)||mixRgb(p,[255,230,150],.55);resolve({primary:rgbHex(p),primary2:rgbHex(p2),accent:rgbHex(acc),bg:rgbHex(mixRgb(p,[7,7,10],.86)),bg2:rgbHex(mixRgb(p,[10,8,12],.72))})};img.onerror=()=>reject(new Error('Logo tidak bisa dianalisis.'));img.crossOrigin='anonymous';img.src=src})}
function colorDistance(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])}function mixRgb(a,b,t){return a.map((v,i)=>Math.round(v*(1-t)+b[i]*t))}function rgbHex(a){return'#'+a.map(v=>clamp(v,0,255).toString(16).padStart(2,'0')).join('')}function hexRgb(h){h=h.replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]}function darken(h,t){return rgbHex(mixRgb(hexRgb(h),[4,5,8],t))}function lighten(h,t){return rgbHex(mixRgb(hexRgb(h),[255,220,185],t))}

function startProgressTicker(){clearInterval(progressTimer);progressTimer=setInterval(()=>{const p=nowProgress();const bar=$('#nowProgress');if(bar)bar.style.width=`${p.pct}%`;const el=$('#nowElapsed');if(el)el.textContent=fmtDuration(p.elapsed);if(p.pct>=100&&routeIsAdmin())finalizeCurrentRequest()},1000)}

let lastFinalizedRequestId='';
async function finalizeCurrentRequest(){
  const rid=state.meta?.nowPlaying?.requestId;
  if(!rid||rid==='demo-now'||rid===lastFinalizedRequestId)return;
  const r=state.requests.find(x=>x.id===rid);
  if(!r||r.status==='played'){lastFinalizedRequestId=rid;return}
  try{
    if(state.mode==='cloud') await updateRequest(rid,{status:'played',playedAtMs:Date.now()});
    else {r.status='played';persistLocal()}
    lastFinalizedRequestId=rid;
  }catch(e){console.warn('Finalize request',e)}
}

function startSpotifyAutomation(){clearInterval(spotifyTimer);spotifyTimer=setInterval(()=>{if(routeIsAdmin()&&state.meta?.player?.autoPlay&&getSpotifyTokens())ensureAutoPlay().catch(()=>{})},8000)}
let autoBusy=false;async function ensureAutoPlay(){if(autoBusy||!state.queue.length)return;autoBusy=true;try{const p=await spotifyPlayback();if(!p?.is_playing){await playNext();return}const remain=Number(p.item?.duration_ms||0)-Number(p.progress_ms||0);if(remain>0&&remain<2500){setTimeout(()=>playNext(),Math.max(300,remain+300))}if(p?.item){const remote={title:p.item.name,artist:(p.item.artists||[]).map(a=>a.name).join(', '),durationMs:p.item.duration_ms,startedAt:Date.now()-Number(p.progress_ms||0),image:p.item.album?.images?.[1]?.url||''};if(remote.title!==state.meta?.nowPlaying?.title&&state.mode==='cloud')await writeMeta({nowPlaying:remote})}}finally{autoBusy=false}}

boot();
