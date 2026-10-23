# FitLog : consignes pour Claude Code

## Le projet
PWA perso de suivi course à pied + muscu (FitLog), hébergée sur GitHub Pages.
- `index.html` : toute l'app (HTML, CSS, JS purs, aucun framework, aucun build).
- `sw.js` : service worker (hors ligne). `manifest.json`, `privacy.html`, `anat.bin` (modèle 3D), `archivo.woff2` (police), icônes et `splash/`.
- `config.js` : clés Supabase et adresse du Worker. NE JAMAIS le modifier ni l'écraser.
- `worker.js` : copie de référence du Worker Cloudflare (Strava + coach IA). Il n'est pas déployé depuis GitHub : il est collé à la main dans Cloudflare, et ses secrets sont des variables Cloudflare (jamais dans le fichier).

## Qui je suis
Je ne code pas : je teste sur iPhone. Réponses claires, concises, en français. Contredis-moi si tu vois mieux.
Va au bout sans me demander confirmation, sauf pour une action irréversible.

## Règles à chaque modification
1. Incrémenter `VER` dans `index.html` ET le nom du cache `C='fitlog-vX.Y.Z'` dans `sw.js` (même numéro).
2. Vérifier la syntaxe JS (par ex. `node -e` sur le contenu des balises `<script>`).
3. Tester en 390 × 844 (iPhone), en mode clair ET sombre : pas de débordement horizontal, aucune erreur JS.
4. L'écran d'accueil doit tenir sans défiler.
5. Ne jamais mettre de secret (clé API, client secret Strava…) dans l'app ou sur GitHub.
6. Ne jamais envoyer de données Strava à une IA (règles Strava 2026) : le coach n'utilise que les données de l'utilisateur (comptes rendus, fichiers de montre, archive Strava importée, saisies).
7. HYROX : usage descriptif seulement, avec la mention de non-affiliation. Pas de marque déposée dans le design.
8. Les données utilisateur (objet `S` dans localStorage `fitlog`) doivent rester compatibles : ne jamais casser un ancien format sans migration.

## Design « Lande »
Fond ardoise / granit, accent bruyère (#f2609f sombre, #c2236a clair), or pour les records.
Titres et chiffres en Archivo élargie, texte en police système. Couleurs uniquement via les variables CSS de `:root`.
Mode Automatique / Clair / Sombre (Réglages > Apparence).

## Livraison
Fais les changements sur une branche et ouvre une pull request avec un résumé court en français de ce qui change et de ce que je dois tester sur l'iPhone. Si le Worker Cloudflare doit changer, dis-le clairement dans la PR.
