# Commercialisation de Menhir : feuille de route

État au 26 octobre 2026. Ce document n'est pas un avis juridique : les textes de `docs/juridique/` sont des brouillons à faire relire.

## 1. Ce qui bloque (à régler avant d'encaisser)

| Point | État | Qui |
|---|---|---|
| **Nom** : « FitLog » était déjà utilisé par au moins 5 apps. | Renommé **Menhir** (v4.9). Reste : recherche de marque gratuite sur data.inpi.fr avant toute publication ; dépôt plus tard. | Toi |
| **Strava** : règles 2026 (pas d'app concurrente, pas de revente, données gardées 7 jours, pas d'IA). | Retiré de ton compte. La version web le garde pour tes amis (10 comptes maximum en accès « Standard »). À couper avant le lancement payant. | Moi, au lancement |
| **Apple Santé** à la place de Strava. | Fait (v4.7) et testé sur ton iPhone. | — |
| **Accord exprès pour les données de santé** (RGPD art. 9). | Fait (v4.8) : demandé avant Apple Santé et le ressenti du jour, retirable avec effacement. | — |
| **Statut** : micro-entreprise. | À créer (gratuit, en ligne sur formalites.entreprises.gouv.fr). | Toi |
| **Textes légaux** : mentions légales, CGU/CGV, confidentialité, analyse d'impact. | Brouillons dans `docs/juridique/`, à compléter (nom, SIRET, prix) et à faire relire. | Toi + juriste |
| **Compte Apple Developer** (99 $/an) : TestFlight, App Store. | À prendre au moment de la bêta. | Toi |
| **Cartes** : les serveurs gratuits d'OpenStreetMap ne sont pas faits pour une app commerciale. | À remplacer par un fournisseur payant (quelques €/mois). | Moi |
| **Supabase** (compte et sauvegarde) : vérifier la région (Europe) et accepter l'accord de traitement des données (DPA). | À vérifier dans le tableau de bord Supabase (Project Settings > General : région ; Legal : DPA). | Toi |

## 2. Le nom : Menhir

Le dépôt d'une marque **n'est pas obligatoire** pour vendre une app. Il protège : sans dépôt, quelqu'un peut déposer « Menhir » après toi et t'obliger à
renommer. L'inverse compte davantage : **ne pas utiliser un nom déjà déposé par un autre** dans le même domaine (risque de contrefaçon). La recherche,
elle, est gratuite : [data.inpi.fr](https://data.inpi.fr) et [euipo.europa.eu/eSearch](https://euipo.europa.eu/eSearch), classes 9 (logiciels) et 41 (sport, coaching).
À faire avant de publier sous ce nom ; le dépôt (environ 190 € pour une classe à l'INPI) attendra que l'app rapporte.

## 3. Ordre conseillé

1. Vérifier gratuitement que « Menhir » n'est pas déjà une marque déposée (INPI, EUIPO) ; le déposer plus tard.
2. Créer la micro-entreprise. Un abonnement relève des prestations de services : plafond 83 600 €/an, pas de TVA à facturer sous ~37 500 €/an (à vérifier sur impots.gouv.fr).
3. Compléter les textes de `docs/juridique/` (nom, SIRET, adresse, prix) et les faire relire (quelques centaines d'euros).
4. Technique (moi) : fournisseur de cartes, Strava coupé, version iPhone qui embarque l'app (exigé par Apple pour l'App Store), écran d'abonnement.
5. Compte Apple Developer, TestFlight, bêta gratuite avec 20 à 50 personnes pendant 1 à 2 mois.
6. Lancement payant : abonnement via l'App Store (Apple prend 15 % la première année avec le programme petites entreprises), puis Google Play.

## 4. Modèle proposé

Gratuit : carnet muscu et course, import Apple Santé et fichiers de montre. Payant (4 à 6 €/mois ou 30 à 40 €/an) : plans de course et HYROX, coach IA, statistiques avancées.
Le coût du coach IA (API Claude) est payé par l'éditeur : garder un plafond de messages par abonné.
