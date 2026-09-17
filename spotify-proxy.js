// Cloudflare Worker — Spotify customer-search proxy.
// Secrets: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
// Vars: ALLOWED_ORIGIN, SPOTIFY_MARKET (default ID)

let cachedToken=null;
let tokenExpiresAt=0;

export default {
  async fetch(request,env){
    const origin=request.headers.get('Origin')||'';
    const allowed=env.ALLOWED_ORIGIN||'*';
    const cors={
      'Access-Control-Allow-Origin': allowed==='*' ? '*' : allowed,
      'Access-Control-Allow-Methods':'GET,OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type',
      'Vary':'Origin'
    };

    if(allowed!=='*' && origin && origin!==allowed){
      return json({error:'Origin not allowed.'},403,cors);
    }
    if(request.method==='OPTIONS') return new Response(null,{headers:cors});
    if(request.method!=='GET') return json({error:'Method not allowed.'},405,cors);

    const url=new URL(request.url);
    if(url.pathname!=='/search') return json({error:'Not found'},404,cors);

    const q=(url.searchParams.get('q')||'').trim();
    const limit=Math.max(1,Math.min(10,Number(url.searchParams.get('limit')||8)));
    const market=String(env.SPOTIFY_MARKET||'ID').trim().toUpperCase().slice(0,2);
    if(!q) return json({tracks:[]},200,cors);
    if(!env.SPOTIFY_CLIENT_ID||!env.SPOTIFY_CLIENT_SECRET){
      return json({error:'Spotify secrets are not configured.'},503,cors);
    }

    try{
      const access=await getToken(env);
      const endpoint=new URL('https://api.spotify.com/v1/search');
      endpoint.searchParams.set('type','track');
      endpoint.searchParams.set('limit',String(limit));
      endpoint.searchParams.set('market',market);
      endpoint.searchParams.set('q',q);

      const res=await fetch(endpoint.toString(),{
        headers:{Authorization:`Bearer ${access}`}
      });
      if(!res.ok){
        let detail='';
        try{detail=(await res.json())?.error?.message||''}catch{}
        return json({error:detail||`Spotify search failed (${res.status})`},res.status,cors);
      }

      const data=await res.json();
      const tracks=(data.tracks?.items||[]).map(t=>({
        id:t.id,
        uri:t.uri,
        title:t.name,
        artist:(t.artists||[]).map(a=>a.name).join(', '),
        durationMs:t.duration_ms||0,
        duration:formatDuration(t.duration_ms),
        image:t.album?.images?.[1]?.url||t.album?.images?.[0]?.url||''
      }));
      return json({tracks},200,{...cors,'Cache-Control':'public, max-age=30'});
    }catch(err){
      return json({error:err?.message||'Spotify proxy error.'},502,cors);
    }
  }
};

async function getToken(env){
  if(cachedToken&&Date.now()<tokenExpiresAt) return cachedToken;
  const credentials=btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);
  const res=await fetch('https://accounts.spotify.com/api/token',{
    method:'POST',
    headers:{
      Authorization:`Basic ${credentials}`,
      'Content-Type':'application/x-www-form-urlencoded'
    },
    body:'grant_type=client_credentials'
  });
  if(!res.ok) throw new Error(`Spotify token request failed (${res.status}).`);
  const data=await res.json();
  cachedToken=data.access_token;
  tokenExpiresAt=Date.now()+Math.max(60,(Number(data.expires_in)||3600)-120)*1000;
  return cachedToken;
}
function formatDuration(ms=0){
  const s=Math.round(ms/1000);
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
}
function json(data,status,headers){
  return new Response(JSON.stringify(data),{
    status,
    headers:{'Content-Type':'application/json; charset=utf-8',...headers}
  });
}
