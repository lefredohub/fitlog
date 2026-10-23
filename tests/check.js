// Vérification de FitLog avant chaque fusion : node tests/check.js [--shots dossier]
// Contrôle la syntaxe JS, la version (VER = cache du service worker), puis ouvre l'app dans un iPhone simulé
// (390 × 844, mode clair ET sombre) avec des données de test : erreurs JS, débordement horizontal,
// accueil sans défilement, parcours d'une séance de muscu et barre du haut sous l'encoche.
// Nécessite Node et Playwright (Chromium). Aucune donnée réelle n'est utilisée.
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SHOTS = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : null })();
let pw; for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(p); break } catch (e) { } }
if (!pw) { console.error('Playwright introuvable : installe-le (npm i -g playwright) ou lance depuis une session Claude Code.'); process.exit(2) }

const fails = [], ok = [];
const check = (name, cond, detail) => { (cond ? ok : fails).push(name + (cond || !detail ? '' : ' → ' + detail)) };

// 1. syntaxe et version
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((m, i) => { try { new vm.Script(m[1]); check('Syntaxe du script ' + (i + 1), true) } catch (e) { check('Syntaxe du script ' + (i + 1), false, e.message) } });
try { new vm.Script(sw); check('Syntaxe de sw.js', true) } catch (e) { check('Syntaxe de sw.js', false, e.message) }
const ver = (html.match(/const VER='([^']+)'/) || [])[1], cache = (sw.match(/fitlog-v([\d.]+)/) || [])[1];
check(`Version ${ver} identique dans index.html et sw.js`, ver && ver === cache, `VER=${ver}, cache=${cache}`);

// 2. petit serveur local
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.bin': 'application/octet-stream' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end() } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r) });

// données de test : séances Push/Pull/Legs, historique, sorties, objectif semi avec plan
const SEED = () => {
  const P = PROG.find(p => p.n.startsWith('Push')), D = 864e5;
  S.t = P.s.map(([n, L]) => ({ id: uid(), name: n, ex: L.map(x => libEx(LIBM.get(nrm0(x)))) }));
  S.t.forEach(t => t.ex.forEach(e => { if (!e.t) e.w = e.eq === 'b' ? 60 : e.eq === 'h' ? 16 : 40 }));
  S.h = []; let d = Date.now() - 40 * D;
  for (let k = 0; k < 14; k++) { const t = S.t[k % 3]; S.h.push({ id: uid(), name: t.name, date: new Date(d).toISOString(), dur: 55 + k % 10, ex: t.ex.map(x => ({ name: x.name, eq: x.eq, m: x.m, rest: '', sets: Array.from({ length: x.sets }, (_, j) => ({ w: (+x.w || 20) + 2.5 * Math.floor(k / 3), r: +x.min + (j % 2), done: true })) })) }); d += 2.8 * D }
  S.runs = []; for (let k = 0; k < 26; k++) { const km = [6.2, 8.4, 5.1, 12.3, 10, 7.5, 15.8][k % 7], p = 320 + (k % 5) * 9; S.runs.push({ id: 'm' + k, man: 1, n: ['Footing', 'Sortie longue', 'Fractionné', 'Récup'][k % 4], d: new Date(Date.now() - k * 2.3 * D).toISOString(), km, s: Math.round(km * p), hr: 140 + k % 20, up: 20 + k * 3 }) }
  S.goal = { k: 'run', name: 'Semi test', date: iso(new Date(Date.now() + 60 * D)), dist: 21.1, time: 5940, timeS: '1:39:00', days: [1, 3, 5, 6], long: 6, base: 28, races: [] };
  S.plan = { weeks: genPlan(S.goal) }; save(); render()
};
const VIEWS = {
  'Accueil': "view='home'", 'Course > Plan': "view='run';runTab='p'", 'Course > Sorties': "view='run';runTab='r'", 'Course > Records': "view='run';runTab='rec'", 'Course > HYROX': "view='run';runTab='hx'",
  'Muscu > Séances': "view='train';histTab='t'", 'Muscu > Muscles': "view='train';histTab='m'", 'Muscu > Historique': "view='train';histTab='s';hOpen=S.h.length-1", 'Muscu > Records': "view='train';histTab='r'",
  'Réglages': "view='set'", 'Aide': "view='help'", 'Outils': "view='tools'", 'Succès': "view='ach'", 'Score': "view='score'", 'Programmes types': "view='prog'", 'Forme du jour': "view='forme'", 'Coach': "view='coach'",
  'Détail sortie': "RDI=S.runs[0].id;view='rdet'", 'Nouvelle sortie': "view='rform';RX={id:'',date:iso(new Date()),km:'',h:'',m:'',s:'',n:'',hr:'',up:''}", 'Objectif': "RX=null;ge={...S.goal,days:[...S.goal.days],races:[]};view='goal'",
  'Éditeur de séance': "ge=null;view='train';ed=JSON.parse(JSON.stringify(S.t[0]));ed.open=0", 'Bibliothèque': "LB={q:'',eq:'',g:'',sel:[]}", 'Séance en cours': "LB=null;ed=null;view='train';start(S.t[0].id)"
};
const FLAGS = ['fitlog-onb', 'fitlog-nolog', 'fitlog-inst', 'fitlog-sb', 'fitlog-bk', 'fitlog-wel'];

(async () => {
  await new Promise(r => server.listen(0, r)); const URL = `http://localhost:${server.address().port}/index.html`;
  const b = await pw.chromium.launch(); if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  for (const scheme of ['dark', 'light']) {
    const M = scheme === 'dark' ? 'sombre' : 'clair';
    const page = async (flags) => { const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, isMobile: true, hasTouch: true }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.errs.push(m.text()) }); await p.addInitScript(f => f.forEach(k => localStorage.setItem(k, '1')), flags); await p.goto(URL); await p.waitForTimeout(700); return p };
    const over = p => p.evaluate(() => { const m = document.querySelector('main'); return { w: document.documentElement.scrollWidth, y: m.scrollHeight - m.clientHeight } });

    // nouvel utilisateur (présentation passée)
    let p = await page(['fitlog-onb', 'fitlog-nolog', 'fitlog-inst', 'fitlog-sb']); let o = await over(p);
    check(`[${M}] Accueil nouvel utilisateur sans défilement`, o.y <= 0, `dépasse de ${o.y} px`);
    check(`[${M}] Accueil nouvel utilisateur sans erreur JS`, !p.errs.length, p.errs.join(' | ')); await p.close();

    // tous les écrans avec des données
    p = await page(FLAGS); await p.evaluate(SEED); await p.waitForTimeout(300);
    for (const [n, c] of Object.entries(VIEWS)) {
      await p.evaluate(c + ';render()'); await p.waitForTimeout(450); o = await over(p);
      check(`[${M}] ${n} : pas de débordement horizontal`, o.w <= 390, `largeur ${o.w} px`);
      if (n === 'Accueil') check(`[${M}] Accueil sans défilement`, o.y <= 0, `dépasse de ${o.y} px`);
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${M}-${n.replace(/[^\wÀ-ÿ]+/g, '_')}.png`) });
    }
    check(`[${M}] Écrans sans erreur JS`, !p.errs.length, p.errs.join(' | '));

    // parcours d'une séance : coche → repos, réglage du repos, remplacement, fin
    const st = await p.evaluate(async () => {
      const w = t => new Promise(r => setTimeout(r, t)), q = s => document.querySelector(s), r = {};
      q('[data-a=sok][data-i="0"][data-j="0"]').click(); await w(300); r.timer = !!q('#rtb'); r.ok = !!S.a.ex[0].sets[0].ok;
      const t0 = RT && RT.tot; q('#rtb [data-v="15"]').click(); await w(100); r.plus = RT && RT.tot === t0 + 15;
      q('[data-a=restset][data-i="0"]').click(); await w(200); q('.sheet [data-a=restv][data-v="180"]').click(); await w(200); r.rest = restOf(S.a.ex[0]) === 180 && (S.rs || {})[nrm(S.a.ex[0].name)] === 180;
      const n0 = S.a.ex[0].name; q('[data-a=swap][data-i="0"]').click(); await w(200); const alt = q('.sheet [data-a=swapdo]'); r.alts = !!alt; if (alt) alt.click(); await w(200); r.swap = S.a.ex[0].name !== n0 && S.a.ex[0].was === n0;
      q('[data-a=swap][data-i="0"]').click(); await w(200); const bk = q('.sheet [data-a=swapback]'); if (bk) bk.click(); await w(200); r.back = S.a.ex[0].name === n0;
      delete S.rs; const nh = S.h.length; q('[data-a=finish]').click(); await w(300); r.fin = S.h.length === nh + 1 && !S.a && !JSON.stringify(S.h[S.h.length - 1]).includes('"ok"'); return r
    });
    check(`[${M}] Séance : cocher une série lance le repos`, st.timer && st.ok);
    check(`[${M}] Séance : +15 s sur le minuteur`, st.plus);
    check(`[${M}] Séance : temps de repos réglé et retenu`, st.rest);
    check(`[${M}] Séance : remplacer un exercice`, st.alts && st.swap);
    check(`[${M}] Séance : revenir à l'exercice prévu`, st.back);
    check(`[${M}] Séance : enregistrement sans le champ d'affichage « ok »`, st.fin);

    // encoche simulée (59 px) : la barre du haut ne cache pas le premier exercice
    await p.addStyleTag({ content: '#app.ses{margin-top:59px!important}' }); await p.evaluate("view='train';start(S.t[0].id);render()"); await p.waitForTimeout(400);
    const nb = await p.evaluate(() => { const s = document.querySelector('.sbar').getBoundingClientRect(), h = document.querySelector('.exc h2').getBoundingClientRect(); return { s: s.bottom, h: h.top, t: s.top } });
    check(`[${M}] Séance : barre du haut sous l'encoche, premier exercice visible`, nb.t >= 59 && nb.h >= nb.s, JSON.stringify(nb));
    check(`[${M}] Parcours sans erreur JS`, !p.errs.length, p.errs.join(' | ')); await p.close();
  }
  await b.close(); server.close();
  console.log(`\n${ok.length} vérifications réussies, ${fails.length} échec${fails.length > 1 ? 's' : ''}.`);
  fails.forEach(f => console.log('ÉCHEC  ' + f));
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('Erreur du script de test :', e); process.exit(2) });
