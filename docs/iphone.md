# Menhir sur iPhone

Trois façons d'avoir Menhir sur iPhone. Fabrication : onglet **Actions → App iPhone → Run workflow**.
Les deux premières affichent le site en ligne : les mises à jour arrivent toutes seules. La troisième (TestFlight, App Store) **embarque** l'app, comme Apple l'exige :
chaque mise à jour passe par un nouvel envoi (mode `testflight`), et Strava n'y figure pas.

| | Prix | Apple Santé | Durée | Pour qui |
|---|---|---|---|---|
| 1. Icône depuis Safari | gratuit | non | illimitée | tes amis, la version web avec Strava |
| 2. Xcode + compte Apple gratuit | gratuit (un Mac) | oui | 7 jours, à relancer | toi, pour tester |
| 3. TestFlight | 99 $/an | oui | 90 jours par version | bêta testeurs, puis App Store |

## 1. Icône depuis Safari
Dans **Safari** : ouvre l'adresse du site → **Partager** → **Sur l'écran d'accueil**. L'app s'ouvre en plein écran, hors ligne aussi. Pas d'Apple Santé : ajoute les sorties
à la main, avec Strava ou avec les fichiers de montre (Réglages > Données > Importer).

## 2. App de test : Mac + Xcode + compte Apple gratuit
1. Sur le Mac, installe **Xcode** depuis l'App Store (gratuit, gros téléchargement), ouvre-le une fois et accepte ce qu'il propose d'installer.
2. Xcode → menu **Xcode → Réglages → Comptes** → **+** → **Apple ID** → connecte-toi avec ton Apple ID.
3. Sur GitHub : **Releases → « Menhir iPhone (test) »** → télécharge **`Menhir-Xcode.zip`**, double-clique pour le dézipper.
4. Ouvre le dossier `Menhir-Xcode` → `ios` → `App` → double-clique sur **`App.xcodeproj`**. Attends que Xcode finisse de charger les modules (barre en haut).
5. Dans la colonne de gauche, clique sur **App** (icône bleue tout en haut) → onglet **Signing & Capabilities** :
   - **Team** : choisis ton nom (Personal Team) ;
   - si Xcode signale que l'identifiant est déjà pris, change **Bundle Identifier** en `app.fitlog.` suivi de ton prénom (par ex. `app.fitlog.alex`) ;
   - **HealthKit** doit apparaître dans la liste des capacités (il est déjà déclaré).
6. Branche l'iPhone au Mac en USB, déverrouille-le, touche **« Se fier à cet ordinateur »**. Si iOS le demande : **Réglages → Confidentialité et sécurité → Mode développeur** → activer, puis redémarrer.
7. En haut de Xcode, choisis **ton iPhone** comme destination, puis clique sur **▶** (Run).
8. Première fois seulement, sur l'iPhone : **Réglages → Général → VPN et gestion de l'appareil** → ton Apple ID → **Faire confiance**, puis relance ▶.

L'app reste installée **7 jours** (règle d'Apple pour les comptes gratuits) : il suffit de rebrancher l'iPhone et de recliquer sur ▶.

Si Xcode affiche **« Unable to copy dyld shared cache files »** : Product → Scheme → Edit Scheme → Run → Info → décoche **Debug executable**, puis ▶.
Si Xcode affiche **« Missing package product CapApp-SPM »** : File → Packages → Reset Package Caches, puis Resolve Package Versions ; le dossier dézippé doit contenir `ios` et `node_modules` côte à côte.

## 3. TestFlight (compte Apple Developer, 99 $/an)
Les testeurs installent l'app **TestFlight** puis touchent un lien : ni câble ni ordinateur. Une version reste valable 90 jours ; jusqu'à 10 000 testeurs par lien public.
Le premier envoi passe par une relecture d'Apple (souvent un jour ou deux).

Mise en place (une fois, environ 45 minutes) :
1. **Compte** : developer.apple.com/programs → Enroll (99 $/an), activation en 1 à 2 jours.
2. **Identifiant d'app** : developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → **+** → App IDs → App → Bundle ID **explicit** `app.fitlog.perso` → coche **HealthKit**.
3. **Fiche de l'app** : appstoreconnect.apple.com → Apps → **+** → New App : iOS, nom **Menhir**, français, Bundle ID `app.fitlog.perso`, SKU `menhir`.
4. **Clé d'accès** : App Store Connect → Users and Access → Integrations → App Store Connect API → **+** (rôle Admin). Note l'**Issuer ID** et le **Key ID**, télécharge le `.p8` (une seule fois).
5. **Secrets GitHub** (Settings → Secrets and variables → Actions → New repository secret) : `APPLE_TEAM_ID` (developer.apple.com → Membership details),
   `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (tout le contenu du fichier `.p8`, lignes BEGIN/END comprises).
6. **Actions → App iPhone → Run workflow → mode `testflight`** (15 à 25 minutes). La version apparaît ensuite dans App Store Connect → TestFlight.
7. **Inviter** : TestFlight → Groupes externes → nouveau groupe → **Activer le lien public** → « Informations de test » (e-mail, description, adresse de `privacy.html`) → ajoute la version.
8. **Worker** : recolle `worker.js` dans Cloudflare (il accepte désormais les apps des stores, sinon le coach ne répond pas dans l'app embarquée).

### Passer à l'App Store
Dans App Store Connect → ta fiche Menhir :
- **Informations de l'app** : catégorie Santé et forme ; URL de confidentialité `https://menhir.rk8h5294kt.workers.dev/privacy.html` ;
- **Confidentialité de l'app** : réponses prêtes dans `docs/fiches-store.md` ;
- **Classification par âge** : questionnaire (rien de sensible) ; **Prix** : gratuit (l'abonnement viendra plus tard, via les achats intégrés) ;
- **Version** : textes, mots-clés et captures dans `docs/fiches-store.md`, choisir la version TestFlight, coller les **notes pour l'examen** du même fichier, puis « Soumettre pour examen ».
Points que vérifie Apple et déjà en place : accord avant d'envoyer des données au coach IA (règle 5.1.2), suppression du compte dans l'app (5.1.1),
textes d'autorisation Apple Santé, pas de publicité ni de revente des données de santé (5.1.3), app embarquée et utile sans compte.

L'envoi à TestFlight n'a pas encore pu être essayé (il faut le compte payant) : au premier lancement, copie-moi l'erreur de l'onglet Actions s'il y en a une.

## 4. Synchro montre → Apple Santé → Menhir
1. Vérifie que ta montre écrit dans Apple Santé : app **Santé → Parcourir → Activité → Entraînements**, ta dernière course doit y être.
   Garmin : app Garmin Connect → Paramètres → Apps connectées → Apple Santé → activer les entraînements. Coros, Polar, Suunto : même principe dans leur app.
2. Ouvre l'app installée, connecte-toi à ton compte (ses données sont séparées de l'icône Safari, et de l'app TestFlight qui est embarquée), puis **Course → Sorties → Connecter Apple Santé** → accepte l'accord « données de santé » → autorise tout.
3. Tes courses arrivent (tout l'historique la première fois). Touche une sortie : la carte et la fréquence cardiaque se chargent depuis Apple Santé.
4. Quand tout est là : **« Retirer Strava »** dans la même carte. C'est définitif : les sorties qui ne viennent que de Strava sont retirées.

## Si ça ne marche pas
- **« Apple Santé indisponible »** ou aucune demande d'autorisation : l'Apple ID gratuit n'a peut-être pas reçu le droit Apple Santé. Dis-le-moi avec une capture (et une capture de l'onglet Signing & Capabilities de Xcode).
- **« Aucune course trouvée »** : Réglages de l'iPhone → Santé → Accès aux données et appareils → Menhir → tout activer.
- **L'app ne s'ouvre plus** : les 7 jours sont passés (compte gratuit), relance-la depuis Xcode (▶) (tes données restent si tu es connecté à ton compte).
