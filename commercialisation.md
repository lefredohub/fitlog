# Commercialisation de FitLog : feuille de route

État au 26 octobre 2026. Ce document n'est pas un avis juridique : les textes de `juridique/` sont des brouillons à faire relire.

## 1. Ce qui bloque (à régler avant d'encaisser)

| Point | État | Qui |
|---|---|---|
| **Nom** : « FitLog » est déjà utilisé par au moins 5 apps (App Store, Google Play) et un logiciel pour salles de sport. | À changer. Pistes ci-dessous. | Toi (choix), puis moi (renommage) |
| **Strava** : règles 2026 (pas d'app concurrente, pas de revente, données gardées 7 jours, pas d'IA). | Retiré de ton compte. La version web le garde pour tes amis (10 comptes maximum en accès « Standard »). À couper avant le lancement payant. | Moi, au lancement |
| **Apple Santé** à la place de Strava. | Fait (v4.7) et testé sur ton iPhone. | — |
| **Accord exprès pour les données de santé** (RGPD art. 9). | Fait (v4.8) : demandé avant Apple Santé et le ressenti du jour, retirable avec effacement. | — |
| **Statut** : micro-entreprise. | À créer (gratuit, en ligne sur formalites.entreprises.gouv.fr). | Toi |
| **Textes légaux** : mentions légales, CGU/CGV, confidentialité, analyse d'impact. | Brouillons dans `juridique/`, à compléter (nom, SIRET, prix) et à faire relire. | Toi + juriste |
| **Compte Apple Developer** (99 $/an) : TestFlight, App Store. | À prendre au moment de la bêta. | Toi |
| **Cartes** : les serveurs gratuits d'OpenStreetMap ne sont pas faits pour une app commerciale. | À remplacer par un fournisseur payant (quelques €/mois). | Moi |
| **Supabase** (compte et sauvegarde) : vérifier la région (Europe) et accepter l'accord de traitement des données (DPA). | À vérifier dans le tableau de bord Supabase (Project Settings > General : région ; Legal : DPA). | Toi |

## 2. Le nom : à choisir

Recherche rapide faite le 26/10/2026 (stores et web) : aucune app de sport trouvée sous ces noms. **Ce n'est pas une recherche de marque** : à vérifier sur
[data.inpi.fr](https://data.inpi.fr) (marques françaises) et [euipo.europa.eu/eSearch](https://euipo.europa.eu/eSearch) (marques européennes),
classes 9 (logiciels) et 41 (sport, coaching), puis le nom de domaine et les stores.

- **Menhir** : solide, durable, breton (cohérent avec le design « Lande »), évoque la force et l'endurance.
- **Lande** : le nom du design actuel ; court, mais plus difficile à protéger (mot courant).
- **Granit** : force, Bretagne ; mot courant, protection plus difficile.

Dépôt de la marque à l'INPI : environ 190 € pour 1 classe (+ 40 € par classe en plus). Je fais le renommage dans l'app dès que tu as choisi.

## 3. Ordre conseillé

1. Choisir le nom et le vérifier (INPI, EUIPO, stores, domaine), puis le déposer.
2. Créer la micro-entreprise. Un abonnement relève des prestations de services : plafond 83 600 €/an, pas de TVA à facturer sous ~37 500 €/an (à vérifier sur impots.gouv.fr).
3. Compléter les textes de `juridique/` (nom, SIRET, adresse, prix) et les faire relire (quelques centaines d'euros).
4. Technique (moi) : renommage, fournisseur de cartes, Strava coupé, version iPhone qui embarque l'app (exigé par Apple pour l'App Store), écran d'abonnement.
5. Compte Apple Developer, TestFlight, bêta gratuite avec 20 à 50 personnes pendant 1 à 2 mois.
6. Lancement payant : abonnement via l'App Store (Apple prend 15 % la première année avec le programme petites entreprises), puis Google Play.

## 4. Modèle proposé

Gratuit : carnet muscu et course, import Apple Santé et fichiers de montre. Payant (4 à 6 €/mois ou 30 à 40 €/an) : plans de course et HYROX, coach IA, statistiques avancées.
Le coût du coach IA (API Claude) est payé par l'éditeur : garder un plafond de messages par abonné.
