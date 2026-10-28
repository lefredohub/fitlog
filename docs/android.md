# Menhir sur Android

Deux versions, fabriquées par **Actions → App Android → Run workflow** :

| Mode | Fichier | Contenu | Pour qui |
|---|---|---|---|
| `test` | `Menhir.apk` (Releases → « Menhir Android ») | affiche le site en ligne (mis à jour tout seul), Strava disponible, Health Connect | toi et tes amis |
| `play` | `Menhir.aab` (artefact « Menhir-PlayStore » du workflow) | app **embarquée**, sans Strava, Health Connect, signée | le Play Store |

## 1. APK de test (gratuit)
1. Actions → **App Android** → Run workflow → mode **test** (environ 8 minutes).
2. Releases → **Menhir Android** → envoie `Menhir.apk` (message, mail). Sur le téléphone : ouvrir le fichier, autoriser l'installation si Android le demande.
   Play Protect peut afficher un avertissement : normal hors Play Store.
3. Les courses de la montre : l'app de la montre (Garmin Connect, Samsung Health, Fitbit, Polar, Coros, Pixel Watch…) doit écrire dans **Health Connect**
   (réglage « Health Connect » ou « Applis connectées » dans l'app de la montre ; la liste exacte dépend de la marque). Puis Menhir → Course → Sorties → **Connecter Health Connect**.

## 2. Play Store

### Le compte développeur (25 $, une seule fois)
- **Compte personnel** : Google impose un test fermé avec **au moins 12 testeurs pendant 14 jours d'affilée** avant de pouvoir publier. Avec 2 amis sur Android, ça bloque.
- **Compte organisation** (recommandé) : pas de test obligatoire. Il faut :
  1. la micro-entreprise (formalites.entreprises.gouv.fr, gratuit) ;
  2. un **numéro D-U-N-S** (gratuit, demande en ligne chez Dun & Bradstreet, quelques jours ; le formulaire est accessible depuis la création du compte Play Console) ;
  3. play.google.com/console → créer un compte **Organisation** avec ce numéro, payer 25 $, vérifier l'identité (quelques jours).
- Ces règles changent souvent : relis la page d'aide « Exigences de test pour les nouveaux comptes personnels » au moment de créer le compte.

### La clé de signature (une fois, sur le Mac)
1. Terminal : `keytool -genkeypair -v -keystore menhir-upload.jks -alias menhir -keyalg RSA -keysize 2048 -validity 10000`
   (choisis un mot de passe, réponds aux questions, le nom suffit).
2. `base64 -i menhir-upload.jks | pbcopy` : le contenu est copié.
3. GitHub → Settings → Secrets and variables → Actions → New repository secret :
   `ANDROID_KEYSTORE_B64` (coller), `ANDROID_KEYSTORE_PASSWORD` et `ANDROID_KEY_PASSWORD` (le mot de passe), `ANDROID_KEY_ALIAS` = `menhir`.
4. Garde `menhir-upload.jks` et le mot de passe en lieu sûr (gestionnaire de mots de passe). Avec la signature gérée par Google (activée par défaut),
   une clé perdue se remplace en écrivant au support, mais ça prend du temps.

### Fabriquer et envoyer
1. Actions → App Android → Run workflow → mode **play**. À la fin : bas de la page du workflow → artefact **Menhir-PlayStore** → `Menhir.aab`.
2. Play Console → Créer une application : nom **Menhir**, français, Application, Gratuite.
3. **Contenu de l'application** (menu de gauche, tout doit être vert) :
   - Règles de confidentialité : `https://lefredohub.github.io/fitlog/privacy.html` ;
   - Accès à l'application : tout est accessible sans compte ;
   - Annonces : non ;
   - Classification du contenu : questionnaire (pas de violence, pas d'achat, pas d'échange entre utilisateurs) ;
   - Public cible : 16 ans et plus ;
   - Sécurité des données : réponses dans `docs/fiches-store.md` ;
   - Suppression des données : `https://lefredohub.github.io/fitlog/privacy.html#suppression` ;
   - **Health Connect** : déclarer les autorisations et leur usage (texte prêt dans `docs/fiches-store.md`) ; Google les examine (quelques jours) ;
   - Applications de santé : catégorie « Activité physique et remise en forme ».
4. **Fiche principale** : textes et captures (voir `docs/fiches-store.md`), icône 512 × 512 (`icon-512.png`), image de présentation 1024 × 500.
5. **Tests → Test interne** : envoie `Menhir.aab`, ajoute ton adresse et celles de tes amis. Puis **Production** → nouvelle version → envoyer pour examen.
6. Chaque mise à jour : relancer le mode `play` (le numéro de version augmente tout seul) et envoyer le nouveau `.aab`.

## Limites
- La version Play Store embarque l'app : une modification du site n'y arrive qu'après un nouvel envoi. L'APK de test, lui, suit le site.
- Strava n'est pas dans la version Play Store (règles Strava : pas d'app concurrente).
- Si l'identifiant `app.fitlog.perso` doit changer (par exemple `fr.menhir.app`), c'est **avant** la première publication : après, il est définitif.
