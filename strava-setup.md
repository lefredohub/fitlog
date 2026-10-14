# Strava : « Se connecter avec Strava » (une seule fois)

Tu t'identifies avec ton compte FitLog : **plus de clé à saisir**.

## 1. Mettre à jour le Worker (Cloudflare)
1. Ouvre ton Worker → **Edit code** → remplace tout par le contenu de `worker.js` → **Deploy**.
2. **Settings → Variables** : ajoute
   - `SUPABASE_URL` : l'adresse de ton projet (la même que dans `config.js`)
   - `SUPABASE_KEY` : la clé **publique** (la même que dans `config.js`)
   - `OWNER_EMAIL` : l'e-mail de ton compte FitLog (seul ce compte pourra utiliser le Worker)
3. Tu peux **supprimer** la variable `APP_KEY` : elle ne sert plus.
4. Les variables `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `ALLOWED_ORIGIN`, `GEMINI_API_KEY` et le KV `TOKENS` restent comme avant.

## 2. Dans l'app
Réglages → **Strava et coach IA** → **Se connecter avec Strava** → autorise → reviens dans l'app : la synchro démarre toute seule.

Si l'adresse du Worker n'est pas déjà enregistrée, l'app la demande une fois. Pour ne plus jamais la saisir (nouvel appareil), ajoute-la dans `config.js` :

```js
window.FITLOG = { url: '…', key: '…', api: 'https://fitlog-strava.xxx.workers.dev' };
```
