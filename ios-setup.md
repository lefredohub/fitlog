# FitLog sur iPhone : les 3 solutions

**Il n'existe pas d'APK pour iPhone.** Le fichier équivalent s'appelle .ipa, et Apple oblige à le « signer » : il faut un Mac ou un serveur Apple pour le fabriquer, et un compte Apple pour l'installer. Voici les trois voies, de la plus simple à la plus lourde.

## 1. L'app web sur l'écran d'accueil (recommandé, gratuit, aucune limite)
Sur l'iPhone, dans **Safari** : ouvre l'adresse de ton app → **Partager** → **Sur l'écran d'accueil**. L'icône FitLog apparaît, l'app s'ouvre en plein écran, hors-ligne aussi, et se met à jour toute seule. Strava, le compte et le coach fonctionnent exactement comme sur Android. C'est ce que je conseille à tes amis.

## 2. Un fichier .ipa à installer à la main (gratuit, mais 7 jours maximum)
1. Sur GitHub, crée le fichier `.github/workflows/ios.yml` (colle le contenu de `ios.yml`) → **Commit**.
2. Vérifie que `icon-1024.png` est à la racine du dépôt.
3. Onglet **Actions → IPA iPhone → Run workflow**. Compte 10 à 15 minutes (les machines Mac comptent plus de minutes gratuites que les autres : sur un dépôt privé, vérifie ton quota).
4. **Releases → FitLog iPhone** → télécharge `FitLog.ipa`.
5. Installe-le avec **Sideloadly** (sideloadly.io, Mac ou Windows) ou **AltStore** : branche l'iPhone, glisse l'IPA, connecte-toi avec ton Apple ID. Active ensuite le « mode développeur » (Réglages → Confidentialité et sécurité).
Contrainte : avec un Apple ID gratuit, l'app **expire au bout de 7 jours** et doit être réinstallée (AltStore peut le faire automatiquement tant que le Mac est allumé sur le même réseau). Maximum 3 apps de ce type par Apple ID. Ce n'est donc pas adapté à tes amis.

## 3. TestFlight : la seule voie qui dure (99 $ par an)
Sans compte payant, **rien ne dépasse 7 jours** sur iPhone (c'est une règle d'Apple, aucune astuce ne la contourne légalement). Avec le compte **Apple Developer Program (99 $ par an)**, tes amis installent avec un **simple lien**, sans AltStore, sans câble, sans te donner leur identifiant d'appareil :
- jusqu'à **10 000 testeurs** par lien public ;
- une version reste testable **90 jours** ; le workflow `ios-testflight.yml` en renvoie une nouvelle **tout seul tous les 2 mois**, donc l'app ne s'éteint jamais (tant que ton abonnement est actif) ;
- l'app est une coquille de ton site : tes mises à jour du site arrivent sans nouvel envoi.
Le premier envoi passe par une relecture rapide d'Apple (« Beta App Review », souvent un jour ou deux). Les suivants n'en demandent en général pas.

### Mise en place (une seule fois, environ 45 minutes)
1. **Compte** : developer.apple.com/programs → Enroll (99 $/an). L'activation peut prendre 1 à 2 jours.
2. **Identifiant d'app** : developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → **+** → App IDs → App → Bundle ID **explicit** : `app.fitlog.perso`.
3. **Fiche de l'app** : appstoreconnect.apple.com → Apps → **+** → New App : plateforme iOS, nom FitLog, langue français, Bundle ID `app.fitlog.perso`, SKU `fitlog`.
4. **Clé d'accès** : App Store Connect → Users and Access → Integrations → App Store Connect API → **+** (rôle **Admin**). Note l'**Issuer ID** et le **Key ID**, télécharge le fichier `.p8` (une seule fois).
5. **Secrets GitHub** (Settings → Secrets and variables → Actions → New repository secret) :
   - `APPLE_TEAM_ID` : ton Team ID (developer.apple.com → Membership details)
   - `ASC_KEY_ID` : le Key ID
   - `ASC_ISSUER_ID` : l'Issuer ID
   - `ASC_KEY_P8` : le contenu complet du fichier `.p8` (ouvre-le dans un éditeur de texte, copie tout, y compris les lignes BEGIN/END)
6. **Workflow** : crée `.github/workflows/ios-testflight.yml` (colle `ios-testflight.yml`) → Commit. Vérifie que `icon-1024.png` est à la racine.
7. Actions → **IPA TestFlight** → Run workflow (15 à 25 minutes). Quand il est vert, la version apparaît dans App Store Connect → TestFlight après quelques minutes de traitement.
8. **Inviter** : TestFlight → Groupes externes → crée un groupe → **Activer le lien public** → remplis « Informations de test » (adresse e-mail de contact, description, et l'adresse de ta page `privacy.html` comme politique de confidentialité) → ajoute le build. Envoie le lien à tes amis : ils installent l'app **TestFlight** (gratuite) puis touchent le lien.

### Dire à tes amis
« Installe TestFlight depuis l'App Store, ouvre mon lien, touche Installer. » C'est tout.

## À savoir
- Le workflow `ios.yml` n'a pas pu être testé ici (pas de machine Mac) : il peut demander un ajustement au premier lancement. Si Actions affiche une erreur, copie-la-moi.
- Vérifié sur developer.apple.com : 99 $ par an, TestFlight inclus, 90 jours par version, 10 000 testeurs externes par lien public, relecture du premier build. Le reste (7 jours en gratuit, 3 apps par Apple ID, règle 4.2) vient de ma connaissance : vérifie avant de payer.
- `ios-testflight.yml` n'a pas pu être testé non plus (pas de Mac ici). La signature automatique en ligne de commande demande parfois un ajustement : copie-moi l'erreur de l'onglet Actions.
- Si tu ne veux pas payer : reste sur la voie 1 (écran d'accueil), qui n'expire jamais.
