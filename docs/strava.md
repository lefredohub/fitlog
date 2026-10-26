# Strava pour tout le monde : installation (≈ 15 min, une seule fois, par toi)

Résultat : tes amis touchent **« Se connecter avec Strava »** dans l'onglet Course, autorisent, et c'est fini. Aucune clé, aucune adresse à saisir de leur côté.

## Comment ça marche
- Tu crées **une seule** application Strava (la tienne) et **un seul** Worker Cloudflare (gratuit).
- Chaque ami se connecte avec **son propre** compte Strava : ses données ne sont visibles que de lui.
- Le Worker garde les jetons Strava de chacun. L'app, elle, ne connaît qu'une clé secrète aléatoire fabriquée sur le téléphone.
- Le compte Menhir (e-mail + mot de passe, voir `compte-cloud.md`) est **indépendant** : Strava est facultatif et ne remplace pas le compte.

## 1. Créer l'application Strava
1. **strava.com/settings/api** → crée une application (nom `Menhir`, site web = l'adresse de ton app, catégorie au choix, icône libre).
2. **Authorization Callback Domain** : le domaine du Worker **sans** `https://` ni chemin, ex. `fitlog-strava.ton-pseudo.workers.dev` (à remplir après l'étape 2 : tu peux revenir le modifier).
3. Note le **Client ID** et le **Client Secret**.
4. **Capacité** : Strava limite chaque application à **10 athlètes** (toi compris) tant qu'elle n'est pas validée. Pour dépasser, il faut déposer une demande d'augmentation depuis la même page.

## 2. Déployer le Worker (Cloudflare, gratuit)
1. **dash.cloudflare.com** → *Workers & Pages* → *Create* → *Worker* → nom `fitlog-strava` → *Deploy*.
2. **Edit code** → remplace tout par le contenu de `worker.js` → *Deploy*.
3. *Storage & Databases → KV* → *Create* un espace nommé `fitlog-tokens`.
4. Dans le Worker : *Settings → Bindings → Add → KV namespace* : variable **`TOKENS`** → l'espace `fitlog-tokens`.
5. *Settings → Variables and Secrets* : ajoute
   - `STRAVA_CLIENT_ID` : ton Client ID (texte)
   - `STRAVA_CLIENT_SECRET` : ton Client Secret (**secret**)
   - `ALLOWED_ORIGIN` : l'adresse de ton app **sans chemin**, ex. `https://ton-pseudo.github.io` (plusieurs possibles, séparées par des virgules)
6. Si tu avais l'ancienne version : supprime `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OWNER_EMAIL`, `APP_KEY` (plus utilisées).
7. Reviens sur strava.com/settings/api et colle le domaine du Worker dans *Authorization Callback Domain*.

## 3. Brancher l'app
Dans `config.js` sur GitHub, **ajoute la ligne `api`** (garde tes valeurs `url` et `key` Supabase) :
```js
window.FITLOG = {
  url: 'https://abcd1234.supabase.co',
  key: 'ta-clé-publique',
  api: 'https://fitlog-strava.ton-pseudo.workers.dev',
};
```
→ **Commit**. Attends 1 minute.

## 4. Boutons officiels Strava
Strava impose ses propres visuels. Télécharge-les sur **developers.strava.com/guidelines** et dépose à la racine du dépôt GitHub (à côté de `index.html`) :
- `strava-connect.svg` (bouton « Connect with Strava »)
- `strava-powered.svg` (« Powered by Strava »)

Sans ces fichiers, l'app affiche un bouton orange « Se connecter avec Strava » et le texte « Propulsé par Strava » : ça marche, mais ce n'est pas le visuel officiel.

## 5. Toi : te reconnecter une fois
Le nouveau système identifie les appareils autrement. Dans l'app : Course → **Se connecter avec Strava** → autorise. Tes données reviennent.

## Mise à jour v4.3 (carte, courbes et chaussures des sorties Strava)
Recolle le nouveau `worker.js` dans Cloudflare (Workers > fitlog > Edit code > Deploy). Il ajoute la route `/streams` (trace GPS, FC, altitude d'une sortie, chargée à l'ouverture du détail), la paire de chaussures de chaque sortie et la route `/gear` (nom et kilométrage de tes chaussures Strava). Rien d'autre à changer : mêmes variables, mêmes autorisations Strava.

## Bon à savoir
- **Déconnexion** (Course → Strava → Se déconnecter) : les jetons sont révoqués et supprimés côté Strava et côté Worker, les sorties importées de Strava sont retirées de l'app, les sorties saisies à la main restent.
- **Limites Strava** : 100 requêtes / 15 min pour **toute** l'application. L'app est conçue pour ça, mais si tous tes amis synchronisent en même temps la première fois, certains verront la synchro se terminer quelques minutes plus tard.
- **Coach IA et conditions Strava** : le coach IA tourne sur ce même Worker (voir « Coach IA gratuit » ci-dessous). Les sorties importées de Strava ne lui sont jamais envoyées (conditions de l'API Strava). Si Strava t'autorise un jour par écrit, mets `const AISV=1` dans `index.html`.
- Aucune donnée Strava n'est stockée par le Worker : seulement les jetons de connexion.

## 6. Coach IA gratuit (facultatif)
Le coach utilise **Cloudflare Workers AI** : gratuit (10 000 « neurones » par jour, sans carte bancaire), aucune clé à créer, aucun compte pour tes utilisateurs. Cloudflare indique ne pas utiliser le contenu traité pour entraîner ses modèles et ne pas le conserver après la réponse.

1. Cloudflare → **Workers & Pages** → ton Worker → **Settings → Bindings → Add → Workers AI**. Nom de la variable : `AI`. **Deploy**.
2. C'est tout. Sans ce binding, le coach affiche seulement son bilan local.

Limites (modifiables en variables du Worker) : `AI_DAILY` = messages par jour et par téléphone (10), `AI_GLOBAL` = messages par jour au total (60, pour rester dans l'offre gratuite), `AI_MODEL` = autre modèle. Au-delà de l'offre gratuite, les appels échouent simplement, rien n'est facturé sur le plan gratuit. Si l'app grandit, le plan Workers Paid (5 $/mois) permet de monter `AI_GLOBAL`.

### Option : Claude (Anthropic), meilleure qualité, payant mais moins cher que Gemini
Ajoute dans le Worker (Settings → Variables and Secrets) un **secret** `ANTHROPIC_API_KEY` (console.anthropic.com → API keys, avec quelques euros de crédit). Il passe alors en premier ; Cloudflare reste en secours.
- Modèle par défaut : `claude-haiku-5-5` (0,10 $ / million de tokens en entrée, 0,50 $ en sortie) : environ 0,05 centime par message, soit 0,5 € pour 1 000 messages. Variable `ANTHROPIC_MODEL` pour en changer. Pose une limite de dépense dans la console.
- Anthropic autorise les mineurs sur son API si l'app met des garde-fous : Menhir indique que c'est une IA, ajoute une consigne de prudence aux réponses (pas de régime restrictif, pas d'avis médical, prudence pour un mineur) et le dit dans la page Confidentialité. Garde-les.
- Monte `AI_GLOBAL` (messages par jour au total) selon ton budget.
- Ton abonnement Claude personnel ne peut pas servir de moteur pour l'app : il faut une clé API de la console.
