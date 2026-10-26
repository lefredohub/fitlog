# Tester Apple Santé sur ton iPhone (sans compte Apple Developer)

Apple Santé n'est accessible qu'à une **vraie app iPhone** : la version web (icône ajoutée depuis Safari) ne peut pas le lire.
En attendant le compte Apple Developer payant (99 $/an : TestFlight puis App Store), le **compte Apple Developer gratuit** suffit pour tester
sur ton propre iPhone avec **Xcode sur un Mac**. Limite d'Apple : l'app s'arrête au bout de **7 jours** (il suffit de la relancer depuis Xcode).

## 1. Avec un Mac (recommandé) : Xcode et ton compte Apple gratuit
1. Sur le Mac, installe **Xcode** depuis l'App Store (gratuit, gros téléchargement), ouvre-le une fois et accepte ce qu'il propose d'installer.
2. Xcode → menu **Xcode → Réglages → Comptes** → **+** → **Apple ID** → connecte-toi avec ton Apple ID.
3. Sur GitHub : **Releases → « FitLog iPhone (Apple Santé, test) »** → télécharge **`FitLog-Xcode.zip`**, double-clique pour le dézipper.
4. Ouvre le dossier `FitLog-Xcode` → `ios` → `App` → double-clique sur **`App.xcodeproj`**. Attends que Xcode finisse de charger les modules (barre en haut).
5. Dans la colonne de gauche, clique sur **App** (icône bleue tout en haut) → onglet **Signing & Capabilities** :
   - **Team** : choisis ton nom (Personal Team) ;
   - si Xcode signale que l'identifiant est déjà pris, change **Bundle Identifier** en `app.fitlog.` suivi de ton prénom (par ex. `app.fitlog.alex`) ;
   - **HealthKit** doit apparaître dans la liste des capacités (il est déjà déclaré).
6. Branche l'iPhone au Mac en USB, déverrouille-le, touche **« Se fier à cet ordinateur »**. Si iOS le demande : **Réglages → Confidentialité et sécurité → Mode développeur** → activer, puis redémarrer.
7. En haut de Xcode, choisis **ton iPhone** comme destination, puis clique sur **▶** (Run).
8. Première fois seulement, sur l'iPhone : **Réglages → Général → VPN et gestion de l'appareil** → ton Apple ID → **Faire confiance**, puis relance ▶.

L'app reste installée **7 jours** (règle d'Apple pour les comptes gratuits) : il suffit de rebrancher l'iPhone et de recliquer sur ▶.

## 2. Sans Mac : Sideloadly (bloqué par Apple depuis fin octobre 2026)
Fichier `FitLog-Sante.ipa` du même Release, à installer avec Sideloadly (sideloadly.io). Depuis le 22 octobre 2026, Apple refuse la connexion de ces outils
(erreur -80046) : à réessayer seulement quand Sideloadly annonce un correctif.

## 3. Tester la synchro montre → Apple Santé → FitLog
1. Vérifie que ta montre écrit dans Apple Santé : app **Santé → Parcourir → Activité → Entraînements**, ta dernière course doit y être.
   Garmin : app Garmin Connect → Paramètres → Apps connectées → Apple Santé → activer les entraînements. Coros, Polar, Suunto : même principe dans leur app.
2. Ouvre l'app FitLog installée, connecte-toi à ton compte (pour retrouver tes données), puis **Course → Sorties → Connecter Apple Santé** → autorise tout.
3. Tes courses arrivent (tout l'historique la première fois). Touche une sortie : la carte et la fréquence cardiaque se chargent depuis Apple Santé.
4. Quand tout est là : **« Retirer Strava »** dans la même carte. C'est définitif : les sorties qui ne viennent que de Strava sont retirées.

## Si ça ne marche pas
- **« Apple Santé indisponible »** ou aucune demande d'autorisation : l'Apple ID gratuit n'a peut-être pas reçu le droit Apple Santé. Dis-le-moi avec une capture (et une capture de l'onglet Signing & Capabilities de Xcode).
- **« Aucune course trouvée »** : Réglages de l'iPhone → Santé → Accès aux données et appareils → FitLog → tout activer.
- **L'app ne s'ouvre plus** : les 7 jours sont passés, relance-la depuis Xcode (▶) (tes données restent si tu es connecté à ton compte).

Cette version affiche le site en ligne : les mises à jour de FitLog arrivent sans réinstaller (sauf le module Apple Santé lui-même).
