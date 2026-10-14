// FitLog × Strava : petit relais perso (Cloudflare Worker)
// Variables : STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, SUPABASE_URL, SUPABASE_KEY (clé publique), ALLOWED_ORIGIN, OWNER_EMAIL (ton e-mail, recommandé), GEMINI_API_KEY (coach IA, facultatif), COACH_MODEL (facultatif) | KV : TOKENS
// L'app s'identifie avec ta session FitLog (compte Supabase) : plus aucune clé à saisir.
const J = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...h } });
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const mac = async (env, t) => hex(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', new TextEncoder().encode(env.STRAVA_CLIENT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), new TextEncoder().encode(t)));
const tok = async (env, body) => (await fetch('https://www.strava.com/oauth/token', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, ...body })
})).json();

// Identifie l'utilisateur à partir de sa session Supabase
async function who(env, jwt) {
  if (!jwt || !env.SUPABASE_URL) return null;
  const r = await fetch(env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/user', { headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + jwt } });
  if (!r.ok) return null;
  const u = await r.json();
  if (env.OWNER_EMAIL && (u.email || '').toLowerCase() !== env.OWNER_EMAIL.toLowerCase()) return null;
  return u.id;
}
const bearer = req => (req.headers.get('Authorization') || '').replace(/^Bearer /, '');

// Jetons Strava de l'utilisateur (rafraîchis au besoin)
async function stravaToken(env, uid) {
  let t = JSON.parse(await env.TOKENS.get('t:' + uid) || 'null');
  if (!t && env.OWNER_EMAIL) t = JSON.parse(await env.TOKENS.get('t') || 'null'); // ancienne installation
  if (!t) return { err: 409 };
  if (t.exp < Date.now() / 1000 + 60) {
    const r = await tok(env, { grant_type: 'refresh_token', refresh_token: t.rt });
    if (!r.access_token) return { err: 502 };
    t = { rt: r.refresh_token, at: r.access_token, exp: r.expires_at };
  }
  await env.TOKENS.put('t:' + uid, JSON.stringify(t));
  return { at: t.at };
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const cors = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    // 1) « Se connecter avec Strava » : redirige vers Strava (session FitLog en paramètre)
    if (u.pathname === '/connect') {
      const uid = await who(env, u.searchParams.get('jwt'));
      if (!uid) return new Response('Session invalide : reconnecte-toi dans FitLog.', { status: 401 });
      const ts = Date.now(), a = new URL('https://www.strava.com/oauth/authorize');
      a.search = new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, response_type: 'code', redirect_uri: u.origin + '/callback', approval_prompt: 'auto', scope: 'read,activity:read_all', state: `${uid}.${ts}.${await mac(env, uid + '.' + ts)}` }).toString();
      return Response.redirect(a.toString(), 302);
    }

    // 2) Retour de Strava : échange du code contre les jetons
    if (u.pathname === '/callback') {
      const [uid, ts, m] = (u.searchParams.get('state') || '').split('.');
      if (!uid || !ts || m !== await mac(env, uid + '.' + ts) || Date.now() - +ts > 9e5) return new Response('État invalide', { status: 400 });
      const r = await tok(env, { grant_type: 'authorization_code', code: u.searchParams.get('code') });
      if (!r.refresh_token) return new Response('Échec : ' + JSON.stringify(r), { status: 400 });
      await env.TOKENS.put('t:' + uid, JSON.stringify({ rt: r.refresh_token, at: r.access_token, exp: r.expires_at }));
      return new Response('<meta name=viewport content="width=device-width,initial-scale=1"><body style="font:22px -apple-system,sans-serif;padding:40px;background:#000;color:#ffd60a;text-align:center">Strava connecté ✅<br><br><span style="color:#aaa;font-size:17px">Ferme cette page et reviens dans FitLog.</span>', { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
    }

    // Routes protégées : session FitLog obligatoire
    const prot = ['/activities', '/efforts', '/coach'].includes(u.pathname);
    if (!prot) return new Response('FitLog × Strava : OK');
    const uid = await who(env, bearer(req));
    if (!uid) return J({ error: 'unauthorized' }, 401, cors);

    // 3) Sorties de course
    if (u.pathname === '/activities') {
      const t = await stravaToken(env, uid);
      if (t.err) return J({ error: t.err === 409 ? 'not_connected' : 'refresh_failed' }, t.err, cors);
      const after = u.searchParams.get('after') || 0;
      const all = [];
      const p0 = +u.searchParams.get('p') || 1;
      for (let p = p0; p < p0 + 5; p++) {
        const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=100&page=${p}&after=${after}`, { headers: { Authorization: 'Bearer ' + t.at } });
        if (!r.ok) return J({ error: 'strava_' + r.status }, 502, cors);
        const a = await r.json(); all.push(...a);
        if (a.length < 100) break;
      }
      return J(all.filter(a => /Run/.test(a.sport_type || a.type)).map(a => ({
        id: a.id, n: a.name, t: a.sport_type || a.type, d: a.start_date_local,
        km: +(a.distance / 1000).toFixed(2), s: a.moving_time, up: Math.round(a.total_elevation_gain || 0),
        hr: a.average_heartrate ? Math.round(a.average_heartrate) : null
      })), 200, cors);
    }

    // 4) Meilleurs efforts (5K, 10K, semi, marathon) : /efforts?ids=1,2,3 (8 max)
    if (u.pathname === '/efforts') {
      const t = await stravaToken(env, uid);
      if (t.err) return J({ error: t.err === 409 ? 'not_connected' : 'refresh_failed' }, t.err, cors);
      const N = ['5k', '10k', 'half-marathon', 'marathon'], out = {};
      for (const id of (u.searchParams.get('ids') || '').split(',').filter(x => /^\d+$/.test(x)).slice(0, 8)) {
        const r = await fetch(`https://www.strava.com/api/v3/activities/${id}`, { headers: { Authorization: 'Bearer ' + t.at } });
        if (r.status === 429) return J({ error: 'rate', done: out }, 429, cors);
        if (!r.ok) { out[id] = [null, null, null, null]; continue; }
        const be = (await r.json()).best_efforts || [];
        out[id] = N.map(n => { const e = be.find(x => (x.name || '').toLowerCase() === n); return e ? e.elapsed_time : null; });
      }
      return J(out, 200, cors);
    }

    // 5) Coach IA : relais vers Google Gemini (palier gratuit ; la clé reste ici)
    if (u.pathname === '/coach' && req.method === 'POST') {
      if (!env.GEMINI_API_KEY) return J({ error: 'no_ai' }, 501, cors);
      const b = await req.json().catch(() => null);
      if (!b || !Array.isArray(b.messages) || typeof b.system !== 'string' || b.system.length > 6000 || JSON.stringify(b.messages).length > 40000) return J({ error: 'bad_request' }, 400, cors);
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: b.system }] },
        contents: b.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] })),
        generationConfig: { maxOutputTokens: 4000, temperature: 0.4, responseMimeType: 'application/json' }
      });
      let st = 502;
      for (const m of [env.COACH_MODEL || 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-flash-latest']) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' }, body });
        if (r.ok) {
          const d = await r.json();
          const t = ((d.candidates || [])[0] || {}).content;
          return J({ text: ((t && t.parts) || []).filter(p => !p.thought).map(p => p.text || '').join('') }, 200, cors);
        }
        st = r.status;
        if (st === 400 || st === 401 || st === 403) break;
      }
      return J({ error: 'ai_' + st }, 502, cors);
    }
    return J({ error: 'not_found' }, 404, cors);
  }
};
