# Activer le coach IA de qualité (Claude), pas à pas

Les utilisateurs n'ont rien à faire : la clé est la tienne, cachée dans ton Worker.

1. **Compte** : va sur console.anthropic.com, crée un compte.
2. **Crédit** : Billing → ajoute 5 € de crédit. Active la **recharge automatique désactivée** (pour ne jamais dépasser) et, dans Limits, pose une **limite de dépense mensuelle** (par exemple 5 €).
3. **Clé** : API keys → Create key → copie-la (elle ne s'affiche qu'une fois).
4. **Worker** : Cloudflare → Workers & Pages → ton Worker → Settings → Variables and Secrets → Add :
   - `ANTHROPIC_API_KEY` = ta clé, type **Secret**
   - (conseillé) `AI_PAID_CAP` = `300` (messages Claude maximum par jour, soit environ 0,15 € par jour au pire)
5. **Deploy**.
6. **Vérifier** : ouvre `https://TON-WORKER.workers.dev/ai` dans le navigateur : tu dois voir `"claude":true`.
7. **Tester** dans l'app : Course → Coach → écris un message.

Si ça ne marche pas, l'app affiche la raison entre parenthèses (par exemple « 502 · claude 401 » = clé refusée). Envoie-la moi.

Sans clé, le coach continue de fonctionner gratuitement avec Cloudflare (moins bon, limité à 80 messages par jour au total).
