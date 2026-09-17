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
  const clean={clientId:String(config?.clientId||'').trim(),redirectUri:String(config?.redirectUri||'').trim(),searchProxyUrl:String(config?.searchProxyUrl||'').trim()};
  localStorage.setItem(CONFIG_KEY,JSON.stringify(clean));
  return clean;
}
export function clearSpotifyConfig(){localStorage.removeItem(CONFIG_KEY)}
export function getSpotifyTokens(){
  try{return JSON.parse(localStorage.getItem(TOKEN_KEY)||'null')}catch{return null}
}
export function clearSpotifySession(){localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(VERIFIER_KEY);localStorage.removeItem(STATE_KEY)}

export async function connectSpotify(){
  const cfg=getSpotifyConfig();
  if(!cfg?.clientId||!cfg?.redirectUri) throw new Error('Isi Client ID dan Redirect URI dulu.');
  const verifier=randomString(80), challenge=b64url(await sha256(verifier)), state=randomString(32);
  sessionStorage.setItem(VERIFIER_KEY,verifier); sessionStorage.setItem(STATE_KEY,state);
  const scopes=['user-read-private','user-read-playback-state','user-read-currently-playing','user-modify-playback-state'];
  const url=new URL('https://accounts.spotify.com/authorize');
  url.search=new URLSearchParams({response_type:'code',client_id:cfg.clientId,scope:scopes.join(' '),redirect_uri:cfg.redirectUri,state,code_challenge_method:'S256',code_challenge:challenge}).toString();
  location.href=url.toString();
}

export async function handleSpotifyCallback(){
  const params=new URLSearchParams(location.search); const code=params.get('code');
  if(!code) return false;
  const cfg=getSpotifyConfig(), verifier=sessionStorage.getItem(VERIFIER_KEY), expected=sessionStorage.getItem(STATE_KEY), got=params.get('state');
  if(!cfg?.clientId||!cfg?.redirectUri||!verifier) throw new Error('Data PKCE tidak lengkap. Ulangi Connect Spotify.');
  if(expected&&got!==expected) throw new Error('State Spotify tidak cocok. Login dibatalkan demi keamanan.');
  const body=new URLSearchParams({client_id:cfg.clientId,grant_type:'authorization_code',code,redirect_uri:cfg.redirectUri,code_verifier:verifier});
  const res=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!res.ok) throw new Error(`Spotify token gagal (${res.status}).`);
  const t=await res.json();
  const stored={accessToken:t.access_token,refreshToken:t.refresh_token,expiresAt:Date.now()+((t.expires_in||3600)-60)*1000,scope:t.scope||''};
  localStorage.setItem(TOKEN_KEY,JSON.stringify(stored));
  sessionStorage.removeItem(VERIFIER_KEY);sessionStorage.removeItem(STATE_KEY);
  const u=new URL(location.href);u.searchParams.delete('code');u.searchParams.delete('state');u.searchParams.delete('error');history.replaceState({},'',u.pathname+u.search+'#admin');
  return true;
}

async function token(){
  const cfg=getSpotifyConfig(); let t=getSpotifyTokens();
  if(!t?.accessToken) throw new Error('Spotify belum terhubung.');
  if(Date.now()<Number(t.expiresAt||0)) return t.accessToken;
  if(!t.refreshToken) throw new Error('Sesi Spotify habis. Hubungkan ulang.');
  const body=new URLSearchParams({client_id:cfg.clientId,grant_type:'refresh_token',refresh_token:t.refreshToken});
  const res=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!res.ok){clearSpotifySession();throw new Error('Refresh Spotify gagal. Hubungkan ulang.');}
  const fresh=await res.json();
  t={...t,accessToken:fresh.access_token,refreshToken:fresh.refresh_token||t.refreshToken,expiresAt:Date.now()+((fresh.expires_in||3600)-60)*1000};
  localStorage.setItem(TOKEN_KEY,JSON.stringify(t));return t.accessToken;
}
async function api(path,options={}){
  const access=await token();
  const res=await fetch(`https://api.spotify.com/v1${path}`,{...options,headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json',...(options.headers||{})}});
  if(res.status===204) return null;
  if(!res.ok){let msg='';try{msg=(await res.json())?.error?.message||''}catch{}throw new Error(msg||`Spotify API ${res.status}`)}
  return res.json();
}
export async function spotifyMe(){return api('/me')}
export async function spotifyPlayback(){return api('/me/player')}
export async function spotifyPlayTrack(uri,deviceId=''){
  const q=deviceId?`?device_id=${encodeURIComponent(deviceId)}`:'';
  return api(`/me/player/play${q}`,{method:'PUT',body:JSON.stringify({uris:[uri]})});
}
export async function spotifyNext(){return api('/me/player/next',{method:'POST'})}
export async function spotifyPause(){return api('/me/player/pause',{method:'PUT'})}
export async function spotifySearchAdmin(q,limit=8){
  const data=await api(`/search?type=track&limit=${Math.max(1,Math.min(20,limit))}&q=${encodeURIComponent(q)}`);
  return normalizeTracks(data?.tracks?.items||[]);
}
export async function spotifySearchGuest(q,limit=8){
  const cfg=getSpotifyConfig();
  if(!cfg?.searchProxyUrl) throw new Error('Spotify Search Proxy belum diatur.');
  const url=new URL(cfg.searchProxyUrl); url.searchParams.set('q',q);url.searchParams.set('limit',String(limit));
  const res=await fetch(url.toString()); if(!res.ok) throw new Error(`Search proxy ${res.status}`);
  const data=await res.json(); return Array.isArray(data)?data:(data.tracks||[]);
}
function normalizeTracks(items){return items.map(t=>({id:t.id,uri:t.uri,title:t.name,artist:(t.artists||[]).map(a=>a.name).join(', '),durationMs:t.duration_ms||0,duration:fmt(t.duration_ms),image:t.album?.images?.[1]?.url||t.album?.images?.[0]?.url||''}))}
function fmt(ms=0){const s=Math.round(ms/1000);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
