// FitLog × Strava : petit relais perso (Cloudflare Worker)
// Variables : STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, APP_KEY, ALLOWED_ORIGIN, GEMINI_API_KEY (coach IA gratuit), COACH_MODEL (facultatif) | KV : TOKENS
const J = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...h } });
const sig = async (env) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.APP_KEY + ':state')))].map(b => b.toString(16).padStart(2, '0')).join('');
const tok = async (env, body) => (await fetch('https://www.strava.com/oauth/token', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, ...body })
})).json();

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const cors = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    // 1) Connexion : redirige vers Strava
    if (u.pathname === '/connect') {
      if (u.searchParams.get('key') !== env.APP_KEY) return new Response('Clé invalide', { status: 401 });
      const a = new URL('https://www.strava.com/oauth/authorize');
      a.search = new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, response_type: 'code', redirect_uri: u.origin + '/callback', approval_prompt: 'auto', scope: 'read,activity:read_all', state: await sig(env) }).toString();
      return Response.redirect(a.toString(), 302);
    }

    // 2) Retour de Strava : échange du code contre les jetons
    if (u.pathname === '/callback') {
      if (u.searchParams.get('state') !== await sig(env)) return new Response('État invalide', { status: 400 });
      const r = await tok(env, { grant_type: 'authorization_code', code: u.searchParams.get('code') });
      if (!r.refresh_token) return new Response('Échec : ' + JSON.stringify(r), { status: 400 });
      await env.TOKENS.put('t', JSON.stringify({ rt: r.refresh_token, at: r.access_token, exp: r.expires_at }));
      return new Response('<meta name=viewport content="width=device-width,initial-scale=1"><body style="font:22px -apple-system,sans-serif;padding:40px;background:#000;color:#ffd60a">Strava connecté ✅<br><br><span style="color:#fff">Retourne dans FitLog.</span>', { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
    }

    // 3) Sorties de course (protégé par la clé de l'app)
    if (u.pathname === '/activities') {
      if (req.headers.get('Authorization') !== 'Bearer ' + env.APP_KEY) return J({ error: 'unauthorized' }, 401, cors);
      let t = JSON.parse(await env.TOKENS.get('t') || 'null');
      if (!t) return J({ error: 'not_connected' }, 409, cors);
      if (t.exp < Date.now() / 1000 + 60) {
        const r = await tok(env, { grant_type: 'refresh_token', refresh_token: t.rt });
        if (!r.access_token) return J({ error: 'refresh_failed' }, 502, cors);
        t = { rt: r.refresh_token, at: r.access_token, exp: r.expires_at };
        await env.TOKENS.put('t', JSON.stringify(t));
      }
      const after = u.searchParams.get('after') || 0;
      const all = [];
      for (let p = 1; p <= 5; p++) {
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
    // 4) Coach IA : relais vers Google Gemini (palier gratuit ; la clé reste ici)
    if (u.pathname === '/coach' && req.method === 'POST') {
      if (req.headers.get('Authorization') !== 'Bearer ' + env.APP_KEY) return J({ error: 'unauthorized' }, 401, cors);
      if (!env.GEMINI_API_KEY) return J({ error: 'no_ai' }, 501, cors);
      const b = await req.json().catch(() => null);
      if (!b || !Array.isArray(b.messages) || typeof b.system !== 'string' || b.system.length > 6000 || JSON.stringify(b.messages).length > 40000) return J({ error: 'bad_request' }, 400, cors);
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: b.system }] },
        contents: b.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] })),
        generationConfig: { maxOutputTokens: 4000, temperature: 0.4, responseMimeType: 'application/json' }
      });
      let st = 502;
      for (const m of [env.COACH_MODEL || 'gemini-3.7-flash', 'gemini-3.5-flash']) {
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
    return new Response('FitLog × Strava : OK');
  }
};
