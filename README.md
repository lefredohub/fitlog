# Menhir

Carnet d'entraînement course à pied + musculation (anciennement FitLog) : séances et charges, plan de course, records, forme du jour,
coach IA, import Apple Santé (app iPhone) ou fichiers de montre. Application web (PWA) sans framework ni étape de build, hébergée sur GitHub Pages.

## Le dépôt
| Fichier / dossier | Rôle |
|---|---|
| `index.html` | Toute l'application (HTML, CSS, JS) |
| `sw.js` | Service worker (hors ligne) |
| `config.js` | Clés publiques Supabase et adresse du Worker (ne pas modifier) |
| `manifest.json`, `icon-*.png`, `splash/`, `archivo.woff2`, `anat.bin` | Installation, icônes, écrans de démarrage, police, modèle 3D |
| `privacy.html` | Politique de confidentialité |
| `strava-*.svg` | Boutons officiels Strava (version web) |
| `worker.js` | Copie de référence du Worker Cloudflare (Strava + coach IA), collé à la main dans Cloudflare |
| `tests/check.js` | Vérification avant chaque fusion : `node tests/check.js` |
| `.github/workflows/` | App iPhone (`iphone.yml`) et APK Android (`android.yml`) |
| `docs/` | Guides : iPhone, Android, compte cloud, Strava, coach IA, licences, commercialisation, brouillons juridiques |

Les clés internes (`localStorage` « fitlog… », table `fitlog_data`, identifiant d'app `app.fitlog.perso`) gardent l'ancien nom pour ne pas perdre les données.
Les guides cités dans `config.js` (`cloud-setup.md`, `strava-setup.md`) sont désormais `docs/compte-cloud.md` et `docs/strava.md`.
