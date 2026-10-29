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
| `strava-*.svg` | Boutons officiels Strava (version web) |
| `worker.js` | Copie de référence du Worker Cloudflare (Strava + coach IA), collé à la main dans Cloudflare |
| `tests/check.js` | Vérification avant chaque fusion : `node tests/check.js` |
| `.github/workflows/` | App iPhone (`iphone.yml` : test ou TestFlight) et app Android (`android.yml` : APK de test ou fichier Play Store) |
| `docs/` | Guides : iPhone, Android, fiches des stores, compte cloud, Strava, coach IA, licences, commercialisation, brouillons juridiques |

Les clés internes (`localStorage` « fitlog… », table `fitlog_data`, identifiant d'app `app.fitlog.perso`) gardent l'ancien nom pour ne pas perdre les données.
Les guides cités dans `config.js` (`cloud-setup.md`, `strava-setup.md`) sont désormais `docs/compte-cloud.md` et `docs/strava.md`.
