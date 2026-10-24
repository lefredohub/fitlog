# Tester Apple Santé sur ton iPhone (sans compte Apple Developer)

Apple Santé n'est accessible qu'à une **vraie app iPhone** : la version web (icône ajoutée depuis Safari) ne peut pas le lire.
En attendant le compte Apple Developer (99 $/an, TestFlight puis App Store), tu peux installer toi-même une version de test
avec ton **Apple ID gratuit**. Limites d'Apple : l'app s'arrête au bout de **7 jours** (il suffit de la réinstaller), et il faut un ordinateur.

## 1. Récupérer l'app (fichier .ipa)
Sur GitHub : **Releases → « FitLog iPhone (Apple Santé, test) »** → télécharge `FitLog-Sante.ipa`.
(Pour en refaire une : onglet **Actions → IPA Apple Santé (test) → Run workflow**, environ 15 minutes.)

## 2. L'installer avec Sideloadly (Mac ou Windows, sans Terminal)
1. Télécharge **Sideloadly** sur sideloadly.io et installe-le (sur Windows, il demande aussi iTunes et iCloud « hors Microsoft Store »).
2. Branche l'iPhone en USB, déverrouille-le, touche **« Se fier à cet ordinateur »**.
3. Dans Sideloadly : glisse `FitLog-Sante.ipa`, tape ton **Apple ID**, clique **Start** (mot de passe Apple, puis code de validation).
4. Sur l'iPhone : **Réglages → Général → VPN et gestion de l'appareil** → ton Apple ID → **Faire confiance**.
5. Si iOS le demande : **Réglages → Confidentialité et sécurité → Mode développeur** → activer, puis redémarrer.

## 3. Tester la synchro montre → Apple Santé → FitLog
1. Vérifie que ta montre écrit dans Apple Santé : app **Santé → Parcourir → Activité → Entraînements**, ta dernière course doit y être.
   Garmin : app Garmin Connect → Paramètres → Apps connectées → Apple Santé → activer les entraînements. Coros, Polar, Suunto : même principe dans leur app.
2. Ouvre l'app FitLog installée, connecte-toi à ton compte (pour retrouver tes données), puis **Course → Sorties → Connecter Apple Santé** → autorise tout.
3. Tes courses arrivent (tout l'historique la première fois). Touche une sortie : la carte et la fréquence cardiaque se chargent depuis Apple Santé.
4. Quand tout est là : **« Retirer Strava »** dans la même carte. C'est définitif : les sorties qui ne viennent que de Strava sont retirées.

## Si ça ne marche pas
- **« Apple Santé indisponible »** ou aucune demande d'autorisation : l'Apple ID gratuit n'a peut-être pas reçu le droit Apple Santé. Dis-le-moi avec une capture ; sinon, ce sera réglé par le compte Apple Developer (TestFlight).
- **« Aucune course trouvée »** : Réglages de l'iPhone → Santé → Accès aux données et appareils → FitLog → tout activer.
- **L'app ne s'ouvre plus** : les 7 jours sont passés, réinstalle-la avec Sideloadly (tes données restent si tu es connecté à ton compte).

Cette version affiche le site en ligne : les mises à jour de FitLog arrivent sans réinstaller (sauf le module Apple Santé lui-même).
