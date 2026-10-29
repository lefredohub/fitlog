# Commercialisation de Menhir : feuille de route

État au 28 octobre 2026. Ce document n'est pas un avis juridique : les textes de `docs/juridique/` sont des brouillons à faire relire.

## 1. Où on en est

| Point | État | Qui |
|---|---|---|
| **Nom** « Menhir » (« FitLog » était déjà pris par au moins 5 apps) | Renommé. Reste : recherche gratuite sur data.inpi.fr et euipo.europa.eu (classes 9 et 41) avant de publier. Dépôt (≈ 190 €) plus tard. | Toi |
| **Textes légaux dans l'app** | Fait (v4.12) : une seule page `privacy.html` (confidentialité, suppression des données, conditions d'utilisation, mentions légales), affichée dans Réglages > Infos légales. À compléter à la création de la micro-entreprise (nom, SIRET, adresse) et à faire relire. | Moi / toi |
| **Accords** : données de santé (RGPD art. 9) et coach IA (règle Apple 5.1.2) | Faits, retirables dans Réglages > Mes données. | — |
| **Suppression du compte** dans l'app et par e-mail | Faite (Apple 5.1.1, Google). | — |
| **Strava** | Retiré partout (v5.0). Seul l'import de l'archive Strava (données de l'utilisateur) reste. | — |
| **Montre** : Apple Santé (iPhone), Health Connect (Android) | Faits. Health Connect à tester sur un vrai Android (un de tes 2 amis). | Ton ami |
| **Apps des stores** : app embarquée, signée | Prête : `iphone.yml` mode `testflight`, `android.yml` mode `play`. Fiches et formulaires dans `docs/fiches-store.md`. | — |
| **Statut** : micro-entreprise | À créer (gratuit, formalites.entreprises.gouv.fr). Nécessaire pour le compte Google « organisation » et pour encaisser. | Toi |
| **Comptes développeur** | Google : 25 $ une fois, compte **organisation** (évite le test à 12 testeurs). Apple : 99 $/an. | Toi |
| **Cartes** : les serveurs gratuits d'OpenStreetMap ne sont pas faits pour une app commerciale | À remplacer par un fournisseur payant (quelques €/mois) avant le lancement payant. | Moi |
| **Supabase** : région (Europe) et accord de traitement des données (DPA) | À vérifier : Project Settings > General (région) ; Legal (DPA). | Toi |

## 2. Le nom
Le dépôt d'une marque **n'est pas obligatoire**. Il protège : sans dépôt, quelqu'un peut déposer « Menhir » après toi. L'inverse compte davantage :
**ne pas utiliser un nom déjà déposé** dans le même domaine. Recherche gratuite : [data.inpi.fr](https://data.inpi.fr), [euipo.europa.eu/eSearch](https://euipo.europa.eu/eSearch).

## 3. Ordre conseillé
1. Recherche de marque « Menhir » (gratuit, 15 minutes).
2. **Micro-entreprise** (activité : édition de logiciels / applications ; un abonnement relève des prestations de services). Puis numéro **D-U-N-S** (gratuit).
3. Compléter `privacy.html` (section Mentions légales : nom, statut, SIRET, adresse) : je le fais quand tu me donnes les informations.
4. **Android** (`docs/android.md`) : compte Play Console organisation, clé de signature, mode `play`, test interne avec tes amis, puis production.
5. **iPhone** (`docs/iphone.md`) : compte Apple Developer, mode `testflight`, bêta, puis App Store.
6. Lancement payant (plus tard) : abonnement via les achats intégrés (Apple et Google prennent 15 % pour les petits éditeurs), écran d'abonnement,
   CGV (`docs/juridique/cgu-cgv.md`), médiateur de la consommation, cartes payantes.

## 4. Modèle proposé
Gratuit : carnet muscu et course, import Apple Santé / Health Connect et fichiers de montre. Payant (4 à 6 €/mois ou 30 à 40 €/an) : plans de course et HYROX, coach IA, statistiques avancées.
Le coût du coach IA (API Claude, ≈ 0,1 centime par message) est payé par l'éditeur : garder un plafond de messages par abonné.

## 5. À savoir
- Les apps des stores sont **embarquées** : une modification n'y arrive qu'après un nouvel envoi (et l'examen d'Apple, souvent 24 h). La version web et l'APK de test suivent le site.
- Les données de l'app embarquée sont séparées de celles du site : crée un compte (Réglages > Compte) avant de passer de l'une à l'autre, la sauvegarde les fait suivre.
- L'identifiant `app.fitlog.perso` se change **avant** la première publication, jamais après (par exemple `fr.menhir.app` ; l'app de test actuelle deviendrait une autre app).
