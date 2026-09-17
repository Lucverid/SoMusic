const CONFIG_KEY='somusic_spotify_config_v1';
const TOKEN_KEY='somusic_spotify_tokens_v1';
const VERIFIER_KEY='somusic_spotify_verifier_v1';
const STATE_KEY='somusic_spotify_state_v1';

const enc=new TextEncoder();
const b64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const randomString=(len=64)=>{
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const arr=new Uint8Array(len); crypto.getRandomValues(arr);
  return Array.from(arr,x=>chars[x%chars.length]).join('');
};
async function sha256(s){return crypto.subtle.digest('SHA-256',enc.encode(s))}

export function getSpotifyConfig(){
  try{return JSON.parse(localStorage.getItem(CONFIG_KEY)||'null')}catch{return null}
}
export function saveSpotifyConfig(config){
  const clean={
    clientId:String(config?.clientId||'').trim(),
    redirectUri:String(config?.redirectUri||'').trim(),
    searchProxyUrl:String(config?.searchProxyUrl||'').trim()
  };
  localStorage.setItem(CONFIG_KEY,JSON.stringify(clean));
  return clean;
}
export function clearSpotifyConfig(){localStorage.removeItem(CONFIG_KEY)}
export function getSpotifyTokens(){
  try{return JSON.parse(localStorage.getItem(TOKEN_KEY)||'null')}catch{return null}
}
export function clearSpotifySession(){
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
}

function cleanOAuthQuery(){
  const u=new URL(location.href);
  u.searchParams.delete('code');
  u.searchParams.delete('state');
  u.searchParams.delete('error');
  history.replaceState({},'',u.pathname+u.search+'#admin');
}

export async function connectSpotify(){
  const cfg=getSpotifyConfig();
  if(!cfg?.clientId||!cfg?.redirectUri) throw new Error('Isi Client ID dan Redirect URI dulu.');
  if(!/^https:\/\//i.test(cfg.redirectUri) && !/^http:\/\/(?:127\.0\.0\.1|\[::1\])/i.test(cfg.redirectUri)){
    throw new Error('Redirect URI Spotify harus HTTPS (kecuali loopback IP lokal).');
  }
  const verifier=randomString(80), challenge=b64url(await sha256(verifier)), state=randomString(32);
  sessionStorage.setItem(VERIFIER_KEY,verifier);
  sessionStorage.setItem(STATE_KEY,state);
  const scopes=[
    'user-read-private',
    'user-read-playback-state',
    'user-read-currently-playing',
    'user-modify-playback-state'
  ];
  const url=new URL('https://accounts.spotify.com/authorize');
  url.search=new URLSearchParams({
    response_type:'code',
    client_id:cfg.clientId,
    scope:scopes.join(' '),
    redirect_uri:cfg.redirectUri,
    state,
    code_challenge_method:'S256',
    code_challenge:challenge
  }).toString();
  location.href=url.toString();
}

export async function handleSpotifyCallback(){
  const params=new URLSearchParams(location.search);
  const oauthError=params.get('error');
  const code=params.get('code');
  if(!oauthError&&!code) return false;

  const expected=sessionStorage.getItem(STATE_KEY);
  const got=params.get('state');
  if(expected&&got!==expected){
    cleanOAuthQuery();
    throw new Error('State Spotify tidak cocok. Login dibatalkan demi keamanan.');
  }
  if(oauthError){
    clearSpotifySession();
    cleanOAuthQuery();
    throw new Error(oauthError==='access_denied'?'Akses Spotify dibatalkan.':`Spotify OAuth: ${oauthError}`);
  }

  const cfg=getSpotifyConfig();
  const verifier=sessionStorage.getItem(VERIFIER_KEY);
  if(!cfg?.clientId||!cfg?.redirectUri||!verifier){
    cleanOAuthQuery();
    throw new Error('Data PKCE tidak lengkap. Ulangi Connect Spotify.');
  }

  const body=new URLSearchParams({
    client_id:cfg.clientId,
    grant_type:'authorization_code',
    code,
    redirect_uri:cfg.redirectUri,
    code_verifier:verifier
  });
  const res=await fetch('https://accounts.spotify.com/api/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body
  });
  if(!res.ok){
    cleanOAuthQuery();
    throw new Error(`Spotify token gagal (${res.status}).`);
  }
  const t=await res.json();
  const stored={
    accessToken:t.access_token,
    refreshToken:t.refresh_token,
    expiresAt:Date.now()+Math.max(30,(Number(t.expires_in)||3600)-60)*1000,
    scope:t.scope||''
  };
  localStorage.setItem(TOKEN_KEY,JSON.stringify(stored));
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  cleanOAuthQuery();
  return true;
}

async function refreshToken(current){
  const cfg=getSpotifyConfig();
  if(!current?.refreshToken) throw new Error('Sesi Spotify habis. Hubungkan ulang.');
  const body=new URLSearchParams({
    client_id:cfg.clientId,
    grant_type:'refresh_token',
    refresh_token:current.refreshToken
  });
  const res=await fetch('https://accounts.spotify.com/api/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body
  });
  if(!res.ok){
    clearSpotifySession();
    throw new Error('Refresh Spotify gagal. Hubungkan ulang.');
  }
  const fresh=await res.json();
  const next={
    ...current,
    accessToken:fresh.access_token,
    refreshToken:fresh.refresh_token||current.refreshToken,
    expiresAt:Date.now()+Math.max(30,(Number(fresh.expires_in)||3600)-60)*1000,
    scope:fresh.scope||current.scope||''
  };
  localStorage.setItem(TOKEN_KEY,JSON.stringify(next));
  return next;
}

async function token(forceRefresh=false){
  let t=getSpotifyTokens();
  if(!t?.accessToken) throw new Error('Spotify belum terhubung.');
  if(!forceRefresh && Date.now()<Number(t.expiresAt||0)) return t.accessToken;
  t=await refreshToken(t);
  return t.accessToken;
}

function spotifyApiError(path,status,message=''){
  if(status===404 && path.startsWith('/me/player')){
    return new Error('Spotify tidak menemukan perangkat aktif. Buka Spotify di HP kasir, putar lagu sebentar, lalu coba lagi.');
  }
  if(status===403 && path.startsWith('/me/player')){
    return new Error('Playback ditolak Spotify. Pastikan akun kasir Premium dan playback tersedia di perangkat tersebut.');
  }
  if(status===429){
    return new Error('Spotify sedang membatasi request. Tunggu sebentar lalu coba lagi.');
  }
  return new Error(message||`Spotify API ${status}`);
}

async function api(path,options={},retry401=true){
  const access=await token();
  const res=await fetch(`https://api.spotify.com/v1${path}`,{
    ...options,
    headers:{
      Authorization:`Bearer ${access}`,
      ...(options.body?{'Content-Type':'application/json'}:{}),
      ...(options.headers||{})
    }
  });
  if(res.status===204) return null;
  if(res.status===401 && retry401){
    await token(true);
    return api(path,options,false);
  }
  if(!res.ok){
    let msg='';
    try{msg=(await res.json())?.error?.message||''}catch{}
    throw spotifyApiError(path,res.status,msg);
  }
  return res.json();
}

export async function spotifyMe(){return api('/me')}
export async function spotifyPlayback(){return api('/me/player')}
export async function spotifyPlayTrack(uri,deviceId=''){
  if(!uri) throw new Error('URI lagu Spotify kosong.');
  const q=deviceId?`?device_id=${encodeURIComponent(deviceId)}`:'';
  return api(`/me/player/play${q}`,{method:'PUT',body:JSON.stringify({uris:[uri]})});
}
export async function spotifyNext(){return api('/me/player/next',{method:'POST'})}
export async function spotifyPause(){return api('/me/player/pause',{method:'PUT'})}
export async function spotifySearchAdmin(q,limit=8){
  q=String(q||'').trim();
  if(!q) return [];
  const safeLimit=Math.max(1,Math.min(10,Number(limit)||8));
  const data=await api(`/search?type=track&limit=${safeLimit}&q=${encodeURIComponent(q)}`);
  return normalizeTracks((data?.tracks?.items||[]).filter(t=>!t.explicit));
}
export async function spotifySearchGuest(q,limit=8){
  const cfg=getSpotifyConfig();
  if(!cfg?.searchProxyUrl) throw new Error('Spotify Search Proxy belum diatur.');
  const url=new URL(cfg.searchProxyUrl);
  url.searchParams.set('q',String(q||'').trim());
  url.searchParams.set('limit',String(Math.max(1,Math.min(10,Number(limit)||8))));
  const res=await fetch(url.toString());
  if(!res.ok){
    let detail='';
    try{detail=(await res.json())?.error||''}catch{}
    throw new Error(detail||`Search proxy ${res.status}`);
  }
  const data=await res.json();
  return Array.isArray(data)?data:(data.tracks||[]);
}
function normalizeTracks(items){
  return items.map(t=>({
    id:t.id,
    uri:t.uri,
    title:t.name,
    artist:(t.artists||[]).map(a=>a.name).join(', '),
    durationMs:t.duration_ms||0,
    duration:fmt(t.duration_ms),
    image:t.album?.images?.[1]?.url||t.album?.images?.[0]?.url||'',
    explicit:!!t.explicit
  }));
}
function fmt(ms=0){
  const s=Math.round(ms/1000);
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
}
