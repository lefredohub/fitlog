# Menhir

Carnet d'entraînement course à pied + musculation (anciennement FitLog) : séances et charges, plan de course, records, forme du jour,
coach IA, import Apple Santé (iPhone), Health Connect (Android) ou fichiers de montre. Application web (PWA) sans framework ni étape de build, hébergée sur Cloudflare (https://menhir.rk8h5294kt.workers.dev), publiée à chaque fusion sur `main`.

## Le dépôt
| Fichier / dossier | Rôle |
|---|---|
| `index.html` | Toute l'application (HTML, CSS, JS) |
| `sw.js` | Service worker (hors ligne) |
| `config.js` | Clés publiques Supabase et adresse du Worker (ne pas modifier) |
| `manifest.json`, `icon-*.png`, `splash/`, `archivo.woff2`, `anat.bin` | Installation, icônes, écrans de démarrage, police, modèle 3D |
| `privacy.html` | Infos légales : confidentialité, suppression des données, conditions, mentions (affichée aussi dans l'app) |
| `worker.js` | Copie de référence du Worker Cloudflare (coach IA), collé à la main dans Cloudflare |
| `runlab/`, `rl/` | Page Parcours (ex-RunLab) : code React/Vite et sa version publiée (`cd runlab && npm run build`) |
| `tests/check.js` | Vérification avant chaque fusion : `node tests/check.js` |
| `.github/workflows/` | App iPhone (`iphone.yml` : test ou TestFlight) et app Android (`android.yml` : APK de test ou fichier Play Store) |
| `docs/` | Guides : iPhone, Android, fiches des stores, compte cloud, coach IA, licences, commercialisation, brouillons juridiques |

Les clés internes (`localStorage` « fitlog… », table `fitlog_data`, identifiant d'app `app.fitlog.perso`) gardent l'ancien nom pour ne pas perdre les données.
Le guide cité dans `config.js` (`cloud-setup.md`) est désormais `docs/compte-cloud.md` ; le champ `api` de `config.js` est l'adresse du Worker du coach IA (Strava a été retiré en v5.0).
