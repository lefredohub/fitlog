# FitLog Android (APK) : fabriquer et partager

L'APK est une **coquille** qui affiche ton app hébergée sur GitHub Pages : quand tu mets à jour `index.html` sur GitHub, tous les téléphones sont à jour au prochain lancement, **sans refaire d'APK**. L'app est mise en cache : elle s'ouvre aussi hors-ligne.

Avant de commencer : l'app doit déjà fonctionner dans un navigateur (voir `cloud-setup.md` pour le compte, `strava-setup.md` pour Strava).

## 1. Fabriquer l'APK (une seule fois)
1. Sur GitHub, dans ton dépôt, crée le fichier `.github/workflows/android.yml` (*Add file → Create new file*, tape les « / » pour créer les dossiers) et colle le contenu de `android.yml` → **Commit**.
2. Vérifie que `icon-512.png` est à la racine du dépôt.
3. Onglet **Actions → APK Android → Run workflow**. Compte ~5 minutes.
4. Page d'accueil du dépôt → **Releases → FitLog Android** → télécharge `FitLog.apk`.
5. Si ton site n'est pas à `https://<pseudo>.github.io/<dépôt>/` : *Settings → Secrets and variables → Actions → Variables* → crée `APP_URL` avec la bonne adresse, puis relance.

Il faut refaire un APK seulement pour changer l'icône ou le nom, ou si l'adresse du site change.

## 2. Installer sur un téléphone Android
1. Envoie `FitLog.apk` (message, mail, lien de la Release).
2. Ouvre le fichier, autorise « sources inconnues » si Android le demande. Play Protect peut afficher un avertissement : normal hors Play Store (APK signé « debug »).

## 3. Ce que voit un ami
1. Un court tour de présentation (on peut le passer).
2. **Créer un compte** FitLog (e-mail + mot de passe) pour sauvegarder ses données, ou **Continuer sans compte** (tout reste sur le téléphone).
3. **Muscu** : tout est accessible (bibliothèque de 170 exercices, programmes, progression, carte du corps).
4. **Course** : **Se connecter avec Strava** (facultatif) ou **+ Ajouter une sortie à la main**.
5. Après l'autorisation Strava, un bouton **Ouvrir FitLog** ramène dans l'app.

## 4. Limites
- Strava : 10 athlètes maximum (toi compris) tant que Strava n'a pas validé l'application (voir `strava-setup.md`).
- APK « debug » : parfait pour toi et tes amis, pas pour le Play Store.
- iPhone : pas d'APK. L'app web installée sur l'écran d'accueil (Safari → Partager → Sur l'écran d'accueil) fonctionne de la même façon, y compris Strava.
