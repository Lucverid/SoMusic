// Cloudflare Worker — Spotify customer-search proxy.
// Set secrets/vars in Cloudflare Worker settings:
// SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, ALLOWED_ORIGIN
// No billing is required on the Workers Free plan for small usage.

let cachedToken = null;
let tokenExpiresAt = 0;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': allowed === '*' ? '*' : (origin === allowed ? origin : allowed),
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'public, max-age=30'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    if (url.pathname !== '/search') return json({ error: 'Not found' }, 404, cors);
    const q = (url.searchParams.get('q') || '').trim();
    const limit = Math.max(1, Math.min(10, Number(url.searchParams.get('limit') || 8)));
    if (!q) return json({ tracks: [] }, 200, cors);
    if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) return json({ error: 'Spotify secrets are not configured.' }, 503, cors);

    const access = await getToken(env);
    const res = await fetch(`https://api.spotify.com/v1/search?type=track&limit=${limit}&q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${access}` }
    });
    if (!res.ok) return json({ error: `Spotify search failed (${res.status})` }, res.status, cors);
    const data = await res.json();
    const tracks = (data.tracks?.items || []).map(t => ({
      id: t.id,
      uri: t.uri,
      title: t.name,
      artist: (t.artists || []).map(a => a.name).join(', '),
      durationMs: t.duration_ms || 0,
      duration: formatDuration(t.duration_ms),
      image: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || ''
    }));
    return json({ tracks }, 200, cors);
  }
};

async function getToken(env) {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const credentials = btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status})`);
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + Math.max(60, (data.expires_in || 3600) - 120) * 1000;
  return cachedToken;
}
function formatDuration(ms = 0) { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function json(data, status, headers) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } }); }
