// FitLog × Strava : relais (Cloudflare Worker) v4
// « Se connecter avec Strava » : l'identité de l'utilisateur, c'est son compte Strava. Aucune clé à saisir côté app, aucun compte FitLog requis.
// Variables : STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, ALLOWED_ORIGIN (adresse de l'app, ex. https://toi.github.io ; plusieurs possibles, séparées par des virgules).
//
// KV : TOKENS
// Coach IA (facultatif, gratuit) : ajoute le binding « Workers AI » nommé AI. Variables facultatives : AI_DAILY (messages/jour/appareil, 10), AI_GLOBAL (messages/jour au total, 60), AI_MODEL.
//
// Principe : chaque appareil fabrique une clé secrète aléatoire (jamais envoyée dans une adresse). Le Worker ne reçoit que son empreinte SHA-256 pour /connect,
// la relie au compte Strava une fois l'autorisation donnée, puis reconnaît l'appareil grâce à l'en-tête Authorization.
const J = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...h } });
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha = async t => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
const mac = async (env, t) => hex(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', new TextEncoder().encode(env.STRAVA_CLIENT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), new TextEncoder().encode(t)));
const tok = async (env, body) => (await fetch('https://www.strava.com/oauth/token', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, ...body })
})).json();
const bearer = req => (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const page = (body, s = 200) => new Response('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>FitLog</title><body style="font:20px -apple-system,system-ui,sans-serif;padding:48px 28px;background:#000;color:#fff;text-align:center;line-height:1.4">' + body, { status: s, headers: { 'Content-Type': 'text/html;charset=utf-8' } });


// Appareil -> athlète Strava (empreinte de la clé de l'appareil)
async function who(env, req) {
  const k = bearer(req);
  if (!/^[0-9a-f]{32,128}$/.test(k)) return null;
  const d = JSON.parse(await env.TOKENS.get('d:' + await sha(k)) || 'null');
  return d && d.a ? String(d.a) : null;
}

// Jetons Strava de l'athlète (rafraîchis au besoin)
async function stravaToken(env, aid) {
  let t = JSON.parse(await env.TOKENS.get('t:' + aid) || 'null');
  if (!t) return { err: 409 };
  if (t.exp < Date.now() / 1000 + 60) {
    const r = await tok(env, { grant_type: 'refresh_token', refresh_token: t.rt });
    if (!r.access_token) return { err: 502 };
    t = { ...t, rt: r.refresh_token, at: r.access_token, exp: r.expires_at };
    await env.TOKENS.put('t:' + aid, JSON.stringify(t));
  }
  return { at: t.at, n: t.n || '' };
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url), origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
    const cors = { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] || ''), 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    // 1) « Se connecter avec Strava » : /connect?h=<empreinte de la clé de l'appareil>
    if (u.pathname === '/connect') {
      const h = u.searchParams.get('h') || '';
      if (!/^[0-9a-f]{64}$/.test(h)) return page('Lien invalide.<br>Rouvre FitLog et réessaie.', 400);
      const ts = Date.now(), a = new URL('https://www.strava.com/oauth/authorize');
      a.search = new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, response_type: 'code', redirect_uri: u.origin + '/callback', approval_prompt: 'auto', scope: 'read,activity:read_all', state: `${h}.${ts}.${await mac(env, h + '.' + ts)}` }).toString();
      return Response.redirect(a.toString(), 302);
    }

    // 2) Retour de Strava : échange du code, puis liaison appareil ⇄ athlète
    if (u.pathname === '/callback') {
      if (u.searchParams.get('error')) return page('Connexion annulée.<br><br><span style="color:#aaa;font-size:17px">Reviens dans FitLog si tu veux réessayer.</span>');
      const [h, ts, m] = (u.searchParams.get('state') || '').split('.');
      if (!h || !ts || m !== await mac(env, h + '.' + ts) || Date.now() - +ts > 9e5) return page('Lien expiré.<br>Reviens dans FitLog et réessaie.', 400);
      const r = await tok(env, { grant_type: 'authorization_code', code: u.searchParams.get('code') });
      if (!r.refresh_token || !r.athlete) return page('Strava a refusé la connexion.<br><span style="color:#aaa;font-size:16px">Si tu es le 11e utilisateur, l\'accès est limité : demande au propriétaire de l\'app.</span>', 400);
      const aid = String(r.athlete.id);
      await env.TOKENS.put('t:' + aid, JSON.stringify({ rt: r.refresh_token, at: r.access_token, exp: r.expires_at, n: r.athlete.firstname || '' }));
      await env.TOKENS.put('d:' + h, JSON.stringify({ a: aid, ts: Date.now() }));
      const ua = req.headers.get('User-Agent') || '';
      return page(`<div style="font-size:54px">✅</div><b style="color:#ffd60a">Strava est connecté</b>${r.athlete.firstname ? '<br>' + esc(r.athlete.firstname) : ''}<br><br><span style="color:#aaa;font-size:17px">Reviens dans l'application FitLog : tes sorties arrivent toutes seules.</span>` + (/android/i.test(ua) ? '<br><br><a href="fitlog://strava" style="display:inline-block;background:#ffd60a;color:#000;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:14px">Ouvrir FitLog</a>' : ''));
    }

    // 2 bis) Coach IA gratuit (Cloudflare Workers AI) : aucun compte requis, quota par appareil + plafond global pour rester dans l'offre gratuite
    if (u.pathname === '/ai' && req.method === 'POST') {
      if (!env.AI) return J({ error: 'no_ai' }, 501, cors);
      const k = bearer(req);
      if (!/^[0-9a-f]{32,128}$/.test(k)) return J({ error: 'auth' }, 401, cors);
      const raw = await req.text();
      if (raw.length > 24000) return J({ error: 'too_big' }, 413, cors);
      let b; try { b = JSON.parse(raw); } catch (e) { return J({ error: 'bad' }, 400, cors); }
      if (typeof b.system !== 'string' || !Array.isArray(b.messages) || !b.messages.length || b.messages.length > 8) return J({ error: 'bad' }, 400, cors);
      const day = new Date().toISOString().slice(0, 10), dk = `q:${await sha(k)}:${day}`, gk = `g:${day}`;
      const [dn, gn] = (await Promise.all([env.TOKENS.get(dk), env.TOKENS.get(gk)])).map(x => +x || 0);
      if (dn >= (+env.AI_DAILY || 10)) return J({ error: 'device' }, 429, cors);
      if (gn >= (+env.AI_GLOBAL || 60)) return J({ error: 'global' }, 429, cors);
      await Promise.all([env.TOKENS.put(dk, String(dn + 1), { expirationTtl: 172800 }), env.TOKENS.put(gk, String(gn + 1), { expirationTtl: 172800 })]);
      const msgs = [{ role: 'system', content: b.system.slice(0, 6000) }, ...b.messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 12000) }))];
      for (const m of [env.AI_MODEL || '@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct-fp8-fast']) {
        try {
          const r = await env.AI.run(m, { messages: msgs, max_tokens: 900, temperature: 0.4 });
          const t = typeof r === 'string' ? r : r.response || (r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content) || '';
          if (t) return J({ text: String(t) }, 200, cors);
        } catch (e) { }
      }
      return J({ error: 'ai_fail' }, 502, cors);
    }

    // Routes protégées : appareil relié à un compte Strava
    if (!['/me', '/activities', '/efforts', '/disconnect'].includes(u.pathname)) return new Response('FitLog × Strava : OK', { headers: cors });
    const aid = await who(env, req);
    if (!aid) return J({ error: 'not_connected' }, 409, cors);

    // 3) Qui suis-je ? (prénom Strava)
    if (u.pathname === '/me') {
      const t = await stravaToken(env, aid);
      if (t.err) return J({ error: t.err === 409 ? 'not_connected' : 'refresh_failed' }, t.err, cors);
      return J({ n: t.n }, 200, cors);
    }

    // 4) Déconnexion : révoque l'accès chez Strava et efface tout ce qui est stocké ici
    if (u.pathname === '/disconnect' && req.method === 'POST') {
      const t = await stravaToken(env, aid);
      if (t.at) await fetch('https://www.strava.com/oauth/deauthorize', { method: 'POST', headers: { Authorization: 'Bearer ' + t.at } }).catch(() => { });
      await env.TOKENS.delete('t:' + aid);
      await env.TOKENS.delete('d:' + await sha(bearer(req)));
      return J({ ok: 1 }, 200, cors);
    }

    // 5) Sorties de course
    if (u.pathname === '/activities') {
      const t = await stravaToken(env, aid);
      if (t.err) return J({ error: t.err === 409 ? 'not_connected' : 'refresh_failed' }, t.err, cors);
      const after = u.searchParams.get('after') || 0;
      const all = [];
      const p0 = +u.searchParams.get('p') || 1;
      for (let p = p0; p < p0 + 5; p++) {
        const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=100&page=${p}&after=${after}`, { headers: { Authorization: 'Bearer ' + t.at } });
        if (r.status === 401) { await env.TOKENS.delete('t:' + aid); return J({ error: 'not_connected' }, 409, cors); }
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

    // 6) Meilleurs efforts (5K, 10K, semi, marathon) : /efforts?ids=1,2,3 (8 max)
    if (u.pathname === '/efforts') {
      const t = await stravaToken(env, aid);
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

    return J({ error: 'not_found' }, 404, cors);
  }
};
