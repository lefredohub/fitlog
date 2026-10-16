# Strava pour tout le monde : installation (≈ 15 min, une seule fois, par toi)

Résultat : tes amis touchent **« Se connecter avec Strava »** dans l'onglet Course, autorisent, et c'est fini. Aucune clé, aucune adresse à saisir de leur côté.

## Comment ça marche
- Tu crées **une seule** application Strava (la tienne) et **un seul** Worker Cloudflare (gratuit).
- Chaque ami se connecte avec **son propre** compte Strava : ses données ne sont visibles que de lui.
- Le Worker garde les jetons Strava de chacun. L'app, elle, ne connaît qu'une clé secrète aléatoire fabriquée sur le téléphone.
- Le compte FitLog (e-mail + mot de passe, voir `cloud-setup.md`) est **indépendant** : Strava est facultatif et ne remplace pas le compte.

## 1. Créer l'application Strava
1. **strava.com/settings/api** → crée une application (nom `FitLog`, site web = l'adresse de ton app, catégorie au choix, icône libre).
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
   - `GEMINI_API_KEY` : facultatif, pour le coach IA (clé gratuite sur aistudio.google.com/apikey)
   - `COACH_DAILY` : facultatif, messages coach par jour et par personne (40 par défaut)
6. Si tu avais l'ancienne version : supprime `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OWNER_EMAIL`, `APP_KEY` (plus utilisées).
7. Reviens sur strava.com/settings/api et colle le domaine du Worker dans *Authorization Callback Domain*.

## 3. Brancher l'app
Dans `config.js` sur GitHub, **ajoute la ligne `api`** (garde tes valeurs `url` et `key` Supabase) :
```js
window.FITLOG = {
  url: 'https://abcd1234.supabase.co',
  key: 'ta-clé-publique',
  api: 'https://fitlog-strava.ton-pseudo.workers.dev',
  coach: true
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

## Bon à savoir
- **Déconnexion** (Course → Strava → Se déconnecter) : les jetons sont révoqués et supprimés côté Strava et côté Worker, les sorties importées de Strava sont retirées de l'app, les sorties saisies à la main restent.
- **Limites Strava** : 100 requêtes / 15 min pour **toute** l'application. L'app est conçue pour ça, mais si tous tes amis synchronisent en même temps la première fois, certains verront la synchro se terminer quelques minutes plus tard.
- **Coach IA et conditions Strava** : depuis fin 2024, l'accord API de Strava restreint l'usage des données Strava par une IA et leur affichage à d'autres personnes. Le coach envoie des données de course à un modèle IA. Pour rester prudent, mets `coach: false` dans `config.js` : le coach disparaît, le reste fonctionne.
- Aucune donnée Strava n'est stockée par le Worker : seulement les jetons de connexion et un compteur du coach.
