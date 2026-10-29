// Menhir : relais du coach IA (Cloudflare Worker) v5. Strava est retiré depuis la v5.0 de l'app.
// Variables : ALLOWED_ORIGIN (adresse de l'app, ex. https://menhir.rk8h5294kt.workers.dev ; plusieurs possibles, séparées par des virgules).
//
// KV : TOKENS (compteurs de messages du coach)
// Coach IA : binding « Workers AI » nommé AI (secours gratuit). Variables facultatives : AI_DAILY (messages/jour/appareil, 40), AI_GLOBAL (messages/jour au total sur Cloudflare gratuit, 80), AI_PAID_CAP (messages/jour sur Claude, 300), AI_MODEL, et ANTHROPIC_API_KEY (+ ANTHROPIC_MODEL, défaut claude-haiku-5-5 ; AI_EFFORT low|medium|high, défaut medium) pour utiliser Claude (payant, environ 0,1 centime par message), prioritaire sur Cloudflare.
//
// Chaque appareil envoie une clé aléatoire dans l'en-tête Authorization : elle ne sert qu'à compter ses messages du jour.
const SAFE = "Tu es une IA (pas un humain) et pas un médecin. Aucune consigne médicale, aucun régime restrictif ni perte de poids rapide. Si l'utilisateur semble mineur, reste très prudent sur les charges, le poids et la nourriture. Douleur persistante ou malaise : conseille un professionnel de santé.\n\n";
const J = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...h } });
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha = async t => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
const EFF = env => ['low', 'medium', 'high'].includes(env.AI_EFFORT) ? env.AI_EFFORT : 'medium';
const bearer = req => (req.headers.get('Authorization') || '').replace(/^Bearer /, '');

export default {
  async fetch(req, env) {
    const u = new URL(req.url), origin = req.headers.get('Origin') || '';
    // + les apps des stores (fichiers embarqués) : capacitor://localhost sur iPhone, https://localhost sur Android
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean).concat(['capacitor://localhost', 'https://localhost']);
    const cors = { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] || ''), 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    // Vérification de la configuration du coach (ne révèle aucun secret) : ouvre /ai dans un navigateur
    if (u.pathname === '/ai' && req.method === 'GET') return J({ derniere_erreur: (await env.TOKENS.get('ai:last')) || null, claude: !!env.ANTHROPIC_API_KEY, cloudflare_gratuit: !!env.AI, modele_claude: env.ANTHROPIC_MODEL || 'claude-haiku-5-5', effort: EFF(env), plafond_claude_par_jour: +env.AI_PAID_CAP || 300, plafond_gratuit_par_jour: +env.AI_GLOBAL || 80, par_telephone: +env.AI_DAILY || 40 }, 200, cors);
    // 2 bis) Coach IA : aucun compte requis. Quota par appareil ; plafonds globaux séparés (gratuit Cloudflare / payant Claude).
    // Seuls les messages RÉUSSIS sont comptés.
    if (u.pathname === '/ai' && req.method === 'POST') {
      if (!env.AI && !env.ANTHROPIC_API_KEY) return J({ error: 'no_ai' }, 501, cors);
      const k = bearer(req);
      if (!/^[0-9a-f]{32,128}$/.test(k)) return J({ error: 'auth' }, 401, cors);
      const raw = await req.text();
      if (raw.length > 64000) return J({ error: 'too_big' }, 413, cors);
      let b; try { b = JSON.parse(raw); } catch (e) { return J({ error: 'bad' }, 400, cors); }
      if (typeof b.system !== 'string' || !Array.isArray(b.messages) || !b.messages.length || b.messages.length > 14) return J({ error: 'bad' }, 400, cors);
      const day = new Date().toISOString().slice(0, 10), dk = `q:${await sha(k)}:${day}`, gf = `g:${day}`, gp = `p:${day}`;
      const [dn, nf, np] = (await Promise.all([env.TOKENS.get(dk), env.TOKENS.get(gf), env.TOKENS.get(gp)])).map(x => +x || 0);
      if (dn >= (+env.AI_DAILY || 40)) return J({ error: 'device' }, 429, cors);
      const canPaid = !!env.ANTHROPIC_API_KEY && np < (+env.AI_PAID_CAP || 300), canFree = !!env.AI && nf < (+env.AI_GLOBAL || 80);
      if (!canPaid && !canFree) return J({ error: 'global' }, 429, cors);
      const sys = SAFE + b.system.slice(0, 30000), msgs = [{ role: 'system', content: sys }, ...b.messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 12000) }))];
      const txt = x => (x == null ? '' : typeof x === 'string' ? x : JSON.stringify(x));
      let out = '', used = '', why = '', paid = false;
      // a) Claude (Anthropic) : prioritaire si ANTHROPIC_API_KEY est définie. Modèle par défaut Claude Haiku 5.5 (le moins cher, 0,10 $ / 0,50 $ par
      //    million de jetons). Version d'API 2026-10-21 : plus de « temperature » (Haiku 5.5 refusait déjà toute valeur autre que celle par défaut).
      //    Les consignes (fixes) sont mises en cache : les messages suivants de la conversation les relisent ~10 fois moins cher.
      if (canPaid) {
        try {
          const cut = sys.indexOf('\n\nDONNÉES :'), head = cut > 0 ? sys.slice(0, cut) : sys, data = cut > 0 ? sys.slice(cut + 2) : '';
          const system = [{ type: 'text', text: head, cache_control: { type: 'ephemeral' } }, ...(data ? [{ type: 'text', text: data }] : [])];
          const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2026-10-21', 'content-type': 'application/json' },
            body: JSON.stringify({ model: env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 4000, output_config: { effort: EFF(env) }, system, messages: msgs.slice(1).filter(m => m.content.trim()) })
          });
          if (r.ok) {
            const d = await r.json();
            // refus du filtre de sécurité, ou réponse coupée sans texte : on passe au secours
            paid = true; // appel facturé : compté dans les quotas, même sans texte (pas d'appels payants sans limite)
            // refus du filtre de sécurité : réponse fixe, jamais de repli sur un modèle moins encadré
            if (d.stop_reason === 'refusal') { out = "Je ne peux pas répondre à cette question. Pour tout ce qui touche à ta santé, parles-en à un professionnel (médecin, kiné, diététicien)."; used = 'p'; }
            else { out = (d.content || []).filter(x => x.type === 'text').map(x => x.text).join('').trim(); if (out) used = 'p'; else why = 'claude vide (' + d.stop_reason + ')'; }
          } else why = 'claude ' + r.status + ' ' + (await r.text()).slice(0, 160);
        } catch (e) { why = 'claude ' + String(e).slice(0, 100); }
      }
      // b) Cloudflare Workers AI (gratuit) : par défaut, ou en secours
      if (!out && canFree) {
        for (const m of [env.AI_MODEL || '@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct-fp8-fast']) {
          try {
            const r = await env.AI.run(m, { messages: msgs, max_tokens: 1400, temperature: 0.7 });
            out = txt(typeof r === 'string' ? r : r.response != null ? r.response : (r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content));
            if (out) { used = 'f'; break; }
          } catch (e) { why += ' | cf ' + String(e).slice(0, 160); }
        }
      }
      if (why) await env.TOKENS.put('ai:last', why.trim().slice(0, 300), { expirationTtl: 604800 });
      if (paid || out) await Promise.all([env.TOKENS.put(dk, String(dn + 1), { expirationTtl: 172800 }), paid ? env.TOKENS.put(gp, String(np + 1), { expirationTtl: 172800 }) : null, used === 'f' ? env.TOKENS.put(gf, String(nf + 1), { expirationTtl: 172800 }) : null]);
      if (!out) return J({ error: 'ai_fail', detail: why.trim().slice(0, 300) }, 502, cors);
      return J({ text: out, src: used === 'p' ? 'claude' : 'cloudflare' }, 200, cors);
    }

    return J({ error: 'not_found' }, 404, cors);
  }
};
