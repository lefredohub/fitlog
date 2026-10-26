# Coach IA : réglage et coûts

Le coach discute de ton plan à partir de tes données (sorties Apple Santé ou montre avec allure, fréquence cardiaque et allure par km, plan,
ressenti, renfo) et peut **modifier le plan** : il propose, tu touches « Appliquer », et « Annuler » revient en arrière.
L'IA est appelée par le Worker Cloudflare : la clé reste chez toi, jamais dans l'app.

## Le choix du modèle (octobre 2026)

| | Coût | Qualité en français | Usage commercial et données de santé |
|---|---|---|---|
| **Claude Haiku 5.5** (Anthropic, recommandé) | 0,10 $ / 0,50 $ par million de jetons : **environ 0,1 centime par message** (≈ 1 €/mois pour 30 messages par jour) | Très bonne, suit bien les consignes | Oui : les données envoyées par l'API ne servent pas à entraîner les modèles |
| Claude Sonnet 5.5 (variable `ANTHROPIC_MODEL`) | 20 × plus cher (≈ 2 centimes par message) | Meilleure sur les analyses longues | Oui |
| Cloudflare Workers AI (Mistral Small) | Gratuit jusqu'à un quota quotidien | Moyenne : réponses moins précises | Oui, mais qualité insuffisante pour un produit payant |
| Gemini gratuit (Google) | Gratuit | Bonne | **Non** : l'offre gratuite peut réutiliser les données ; à éviter pour des données de santé et un produit commercial |

Totalement gratuit et de bonne qualité, ça n'existe pas pour un usage commercial. Claude Haiku 5.5 est le meilleur compromis : quasi gratuit pour toi,
et pour une version payante de Menhir, le coût du coach reste négligeable par abonné (plafonds ci-dessous). Cloudflare reste en **secours** si Claude
ne répond pas ; l'app l'indique sous la réponse.

## Mise en place (une fois, 10 minutes)

1. **Compte Anthropic** : console.anthropic.com → crée un compte.
2. **Crédit et plafond** : Billing → ajoute 5 € de crédit, **recharge automatique désactivée** ; Limits → limite de dépense mensuelle (par ex. 5 €).
3. **Clé** : API keys → Create key → copie-la (elle ne s'affiche qu'une fois).
4. **Worker** : dash.cloudflare.com → Workers & Pages → ton Worker :
   - **Edit code** → remplace tout par le contenu de `worker.js` (version du dépôt) → **Deploy** ;
   - **Settings → Variables and Secrets** → `ANTHROPIC_API_KEY` = ta clé, type **Secret** (si elle n'y est pas déjà) ;
   - facultatif : `AI_PAID_CAP` = `300` (messages Claude par jour au total), `AI_DAILY` = `40` (par téléphone), `AI_EFFORT` = `low` (réponses plus rapides et un peu moins réfléchies ; défaut `medium`).
5. **Vérifier** : ouvre `https://TON-WORKER.workers.dev/ai` dans le navigateur : tu dois voir `"claude":true` et `"modele_claude":"claude-haiku-5-5"`.
6. **Tester** : Course → Coach → « Analyse ma dernière sortie et dis-moi si je dois adapter la semaine ».

## Si ça ne marche pas
- L'app affiche la raison entre parenthèses (par ex. « 502 · claude 401 » = clé refusée) : envoie-la moi.
- La réponse porte la mention « modèle de secours » : Claude n'a pas répondu (clé absente, crédit épuisé, plafond du jour atteint). Ouvre `/ai` pour vérifier.

## Bon à savoir
- Avant le 26 octobre 2026, le Worker envoyait un réglage (`temperature`) que Claude Haiku 5.5 refuse : toutes les réponses venaient en fait de Cloudflare.
  C'est corrigé dans `worker.js` : il faut le recoller dans Cloudflare (étape 4).
- Le coach ne reçoit jamais de sortie Strava (règles de Strava) ; sans Strava, il voit toutes tes sorties.
- Commercialisation : garder un plafond de messages par abonné (variables ci-dessus) et réserver le coach à l'offre payante.
