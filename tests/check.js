// Vérification de Menhir avant chaque fusion : node tests/check.js [--shots dossier]
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
    const ck = await p.evaluate(async () => { const w = t => new Promise(r => setTimeout(r, t)); view = 'forme'; render(); await w(100); document.querySelector('[data-a=ck]').click(); await w(150);
      const asked = !!document.querySelector('.sheet [data-a=csok]') && !S.ck; document.querySelector('.sheet [data-a=csok]').click(); await w(150); const r = asked && !!S.ck && Object.keys(S.ck).length === 1; delete S.cs; delete S.ck; save(); view = 'train'; render(); return r });
    check(`[${M}] Forme du jour : accord santé demandé avant d'enregistrer le ressenti`, ck);

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

    // plan : chaque sortie va à la séance la plus proche (cas réel : sorties lundi 6,3 km et samedi 7 km, séances mardi et dimanche)
    const mw = await p.evaluate(() => { const keep = S.runs, w = wk(Date.now()) - 7 * 864e5, at = d => { const x = new Date(w); x.setDate(x.getDate() + d); return iso(x) + 'T08:00:00Z' };
      S.runs = [{ id: 'a', d: at(0), km: 6.3, s: 2100 }, { id: 'b', d: at(5), km: 7, s: 2400 }];
      const W = { w, s: [{ d: 1, t: 'Endurance', km: 6 }, { d: 6, t: 'Sortie longue', km: 8 }] }, r = matchWeek(W);
      const W2 = { w, s: [{ d: 0, t: 'Endurance', km: 6 }, { d: 5, t: 'Endurance', km: 7 }] }, r2 = matchWeek(W2);
      S.runs = keep; return [r.map(x => x && x.id).join(), r2.map(x => x && x.id).join()] });
    check(`[${M}] Plan : sortie du lundi → séance du mardi, sortie du samedi → séance du dimanche`, mw[0] === 'a,b', mw[0]);
    check(`[${M}] Plan : sorties faites le jour prévu`, mw[1] === 'a,b', mw[1]);

    // encoche simulée (59 px) : la barre du haut ne cache pas le premier exercice
    await p.addStyleTag({ content: '#app.ses{margin-top:59px!important}' }); await p.evaluate("view='train';start(S.t[0].id);render()"); await p.waitForTimeout(400);
    const nb = await p.evaluate(() => { const s = document.querySelector('.sbar').getBoundingClientRect(), h = document.querySelector('.exc h2').getBoundingClientRect(); return { s: s.bottom, h: h.top, t: s.top } });
    check(`[${M}] Séance : barre du haut sous l'encoche, premier exercice visible`, nb.t >= 59 && nb.h >= nb.s, JSON.stringify(nb));
    check(`[${M}] Parcours sans erreur JS`, !p.errs.length, p.errs.join(' | ')); await p.close();
  }
  // Apple Santé simulé (app iPhone) : import, remplacement d'une sortie Strava, tracé, retrait de Strava
  {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true }); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(f => {
      f.forEach(k => localStorage.setItem(k, '1')); window.confirm = () => true; const D = 864e5, now = Date.now(), at = j => new Date(now - j * D);
      const W = [{ id: 'A1', workoutType: 'running', startDate: at(2).toISOString(), endDate: new Date(at(2).getTime() + 2100e3).toISOString(), duration: 2100, distance: 6300, sourceName: 'Apple Watch' },
        { id: 'B2', workoutType: 'running', startDate: at(5).toISOString(), endDate: new Date(at(5).getTime() + 2500e3).toISOString(), duration: 2500, distance: 7000, sourceName: 'Garmin Connect' },
        { id: 'C3', workoutType: 'walking', startDate: at(1).toISOString(), duration: 1800, distance: 2000 },
        { id: 'D4', workoutType: 'running', startDate: new Date(at(3).setHours(7, 30, 0, 0)).toISOString(), duration: 1900, distance: 6000, sourceName: 'Garmin' },
        { id: 'E5', workoutType: 'running', startDate: new Date(at(3).setHours(18, 10, 0, 0)).toISOString(), duration: 1950, distance: 6000, sourceName: 'Garmin' },
        { id: 'F6', workoutType: 'running', startDate: at(4).toISOString(), duration: 3000, distance: 9000, sourceName: 'Strava', sourceBundleId: 'com.strava.stravaride' }];
      window.__perm = 0;
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { HealthPlugin: {
        requestHealthPermissions: async () => { window.__perm++; return { permissions: [] } },
        queryWorkouts: async q => { const a = Date.parse(q.startDate), z = Date.parse(q.endDate);
          return { workouts: W.filter(w => { const t = Date.parse(w.startDate); return t >= a && t < z }).map(w => ({ ...w,
            heartRate: q.includeHeartRate ? Array.from({ length: 20 }, (_, i) => ({ timestamp: new Date(Date.parse(w.startDate) + i * 100e3).toISOString(), bpm: 140 + i })) : [],
            route: q.includeRoute ? Array.from({ length: 60 }, (_, i) => ({ timestamp: new Date(Date.parse(w.startDate) + i * 35e3).toISOString(), lat: 47.65 + i * .0009, lng: -2.76, alt: 20 + (i % 10) })) : [] })) } } } } };
      localStorage.setItem('fitlog', JSON.stringify({ t: [], h: [], a: null, runs: [
        { id: 9001, n: 'Sortie Strava', d: lociso0(at(5)), km: 7.02, s: 2490 }, { id: 9002, n: 'Vieille sortie Strava', d: lociso0(at(400)), km: 10, s: 3000 },
        { id: 'm1', man: 1, n: 'Saisie', d: lociso0(at(9)), km: 5, s: 1600 },
        { id: 9003, n: 'Aller', d: lociso0(new Date(at(3).setHours(7, 31, 0, 0))), km: 6.01, s: 1900 }, { id: 9004, n: 'Retour', d: lociso0(new Date(at(3).setHours(18, 11, 0, 0))), km: 5.98, s: 1950 }] }));
      function lociso0(d) { const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':00Z' }
    }, FLAGS);
    await p.goto(URL); await p.waitForTimeout(800);
    const r = await p.evaluate(async () => { const w = t => new Promise(r => setTimeout(r, t)); view = 'run'; runTab = 'r'; render(); await w(100);
      const btn = document.querySelector('[data-a=hksync]'); const o = { card: !!btn }; btn.click(); await w(200);
      o.ask = !!document.querySelector('.sheet [data-a=csok]') && !S.runs.some(x => x.hk); document.querySelector('.sheet [data-a=csok]').click(); await w(600); o.cs = !!(S.cs && S.cs.sante);
      const R = S.runs; o.added = R.some(x => x.id === 'hkA1' && x.hr > 0); o.replaced = R.some(x => x.id === 'hkB2') && !R.some(x => x.id === 9001); o.walk = !R.some(x => x.id === 'hkC3');
      o.manual = R.some(x => x.id === 'm1'); o.left = stLeft() === 1; o.own = ownRuns().some(x => x.id === 'hkA1');
      o.twice = R.some(x => x.id === 'hkD4') && R.some(x => x.id === 'hkE5') && !R.some(x => x.id === 9003 || x.id === 9004);
      o.nostrava = !R.some(x => x.id === 'hkF6'); o.local = !('hk' in S) && !!JSON.parse(localStorage.getItem('fitlog-hk')).last;
      const m0 = S._mod; await hkSync(true); o.nosave = S._mod === m0; const p0 = window.__perm; document.querySelector('[data-a=hksync]').click(); await w(300); o.perm = window.__perm === p0 + 1;
      RDI = 'hkA1'; view = 'rdet'; render(); await rdetLoad(); await w(200); o.track = !!trGet('hkA1');
      view = 'run'; runTab = 'r'; render(); await w(100); const st = document.querySelector('[data-a=stoff]'); o.stbtn = !!st; if (st) st.click(); await w(300);
      o.off = S.stravaOff === 1 && stLeft() === 0 && S.runs.length === 5 && !document.querySelector('[data-a=stoff]') && !document.querySelector('.sbtn');
      document.querySelector('[data-a=nav][data-v=home]'); view = 'set'; accOpen.dt = true; render(); await w(100); const cn = document.querySelector('[data-a=csno]'); o.csbtn = !!cn; if (cn) cn.click(); await w(200);
      o.wd = !S.cs && !S.ck && !S.runs.some(x => x.hr) && !localStorage.getItem('fitlog-hk'); const t = trGet('hkA1'); o.wdtr = !t || t.hr.every(x => !x);
      return o });
    check("[Apple Santé] retrait de l'accord : fréquence cardiaque et ressenti effacés", r.csbtn && r.wd && r.wdtr, JSON.stringify(r));
    check('[Apple Santé] carte « Connecter Apple Santé » dans Course > Sorties', r.card);
    check("[Apple Santé] accord santé demandé avant toute lecture, puis enregistré", r.ask && r.cs);
    check('[Apple Santé] course importée avec la fréquence cardiaque (marche ignorée)', r.added && r.walk);
    check('[Apple Santé] sortie Strava remplacée par sa version Apple Santé', r.replaced);
    check('[Apple Santé] sortie saisie à la main conservée', r.manual);
    check('[Apple Santé] deux courses le même jour : aucune perdue', r.twice, JSON.stringify(r));
    check("[Apple Santé] séances écrites par l'app Strava ignorées (pas de données Strava au coach)", r.nostrava);
    check("[Apple Santé] état gardé sur l'appareil (pas dans la sauvegarde du compte)", r.local);
    check('[Apple Santé] relecture sans nouveauté : rien n\'est réenregistré (pas d\'écrasement du compte)', r.nosave);
    check("[Apple Santé] autorisation redemandée à chaque lecture manuelle", r.perm);
    check('[Apple Santé] données visibles par le coach (données à toi)', r.own);
    check('[Apple Santé] tracé GPS chargé dans le détail de la sortie', r.track);
    check('[Apple Santé] « Retirer Strava » enlève Strava et ses sorties restantes', r.left && r.stbtn && r.off, JSON.stringify(r));
    const o = await p.evaluate(() => document.documentElement.scrollWidth); check('[Apple Santé] pas de débordement horizontal', o <= 390, o + ' px');
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'sombre-Apple_Santé.png') });
    check('[Apple Santé] sans erreur JS', !errs.length, errs.join(' | ')); await p.close();
  }
  await b.close(); server.close();
  console.log(`\n${ok.length} vérifications réussies, ${fails.length} échec${fails.length > 1 ? 's' : ''}.`);
  fails.forEach(f => console.log('ÉCHEC  ' + f));
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('Erreur du script de test :', e); process.exit(2) });
