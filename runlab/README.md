# RunLab

> Ton prochain parcours de course à pied, à la distance exacte, sur de vrais chemins.

Une page, un bouton : RunLab propose des boucles (ou des allers-retours) agréables et praticables autour de toi, en 1 à 5 secondes, puis te guide pendant la course.

**Tout se passe sur le téléphone.** Pas de serveur, pas de compte, pas de clé, pas de quota : l'appareil télécharge les données ouvertes de la carte et calcule lui-même les parcours. Le nombre d'utilisateurs n'a donc aucune limite ni aucun coût.

---

## L'application

Un seul écran :

- **la carte**, avec ton départ (position GPS, une adresse cherchée, ou un point touché sur la carte) ;
- **la distance** (− / +) ;
- **un bouton « Créer mon parcours »**.

Ensuite : jusqu'à 3 propositions (glisser pour passer de l'une à l'autre), avec distance, dénivelé et durée estimée, puis **Courir** (guidage), **GPX** (Garmin, Coros…), **★** (enregistrer) ou **↻** (d'autres parcours).

Un seul menu (☰) pour le reste : boucle ou aller-retour, route ou trail, nombre de tours, mode « Idéal pour un record », parcours enregistrés, allure, annonces vocales.

## Ce que RunLab garantit

- **Distance** : chaque proposition fait entre la distance demandée et +5 % (10 km → 10 à 10,5 km). Jamais moins.
- **Praticable** : pas de voie interdite aux piétons, d'allée privée, de parking ni d'autoroute ; pas d'escaliers sur route.
- **Agréable** : les grands axes sont évités, les allées et rues calmes préférées ; boucles rondes, sans aller-retour dans une impasse, sans repasser deux fois par la même rue.
- **Plusieurs tours** sans demi-tour entre deux tours ; depuis le fond d'une impasse, l'impasse sert d'accès.
- **Mode record** : plat, calme, le moins de routes à traverser ; propose de faire plusieurs fois le tour d'un étang, d'un parc, d'un bois ou d'une boucle d'allées proche.

Banc d'essai réel à Vannes (29/10, 4 départs × 7 demandes : 5, 10 et 21 km, record, 3 tours, trail, aller-retour) : **84 propositions sur 84 dans la fourchette**, calcul de 0,4 à 5,6 s sur ordinateur (3,4 s pour une boucle de 10 km dans le navigateur ; un téléphone peut être plus lent) ; recherche d'adresse instantanée une fois le quartier chargé (5 à 16 ms de calcul), 1 à 2 s la première fois dans une nouvelle zone.

---

## Installer, lancer, publier

Prérequis : [Node.js](https://nodejs.org) 20.9 ou plus récent.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # application statique dans dist/
npm run preview    # sert dist/ sur http://localhost:4173
```

Publication actuelle : **Vercel** (offre gratuite), qui reconstruit le site à chaque envoi sur la branche `runlab-mvp` (réglages dans `vercel.json`). `dist/` est un site **100 % statique** : il se publie tel quel sur GitHub Pages (comme Menhir), Netlify, Cloudflare Pages… Aucune variable d'environnement, aucun secret. Sur iPhone, la localisation demande une adresse **https** (c'est le cas de ces hébergeurs).

| Commande | Rôle |
| --- | --- |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript strict |
| `npm test` | Tests unitaires (Vitest) |
| `npm run test:e2e` | Tests de bout en bout (Playwright, après `npm run build`), sur de fausses tuiles locales, sans réseau |
| `REAL_TILES=1 npx vitest run src/lib/engine.real.test.ts` | Banc d'essai sur les vraies données (réseau requis) |

## Intégrer RunLab dans Menhir

RunLab est prêt à être fusionné :

- **Un point d'entrée** : `mountRunLab(element, config?)` (`src/main.tsx`) affiche RunLab dans n'importe quel élément de la page.
- **Les mêmes couleurs** : variables CSS de Menhir (`--bg`, `--s1`, `--y`…, thème « Lande »), mode clair et sombre automatiques.
- **Sources de données remplaçables** : `window.RUNLAB_CONFIG = { sources: { tiles, terrain } }` (par exemple vers des fichiers auto-hébergés).
- **Guidage écran verrouillé dans l'app iPhone** : si l'app hôte (Capacitor) embarque les modules `@capacitor-community/background-geolocation` et `@capacitor-community/text-to-speech`, RunLab les utilise automatiquement (`src/lib/platform/native.ts`). Dans Safari, l'écran doit rester allumé.
- **Données de l'utilisateur** : réglages dans `localStorage` (`runlab:settings`), parcours enregistrés dans IndexedDB (`runlab`).
- **Confidentialité** : à ajouter à `privacy.html` de Menhir : « Pour calculer un parcours, ton téléphone télécharge la carte des chemins (OpenFreeMap) et le relief (Terrain Tiles, Amazon Web Services) de la zone : ces services voient la zone demandée, jamais ton identité. Ta position et tes parcours restent sur ton appareil. »

---

## Comment ça marche

```
src/
  app/            L'écran unique, le menu, le guidage, la carte (React)
  engine/         Fil de calcul (Web Worker) : génération, recherche, nom des lieux
  lib/
    tiles/        Téléchargement et lecture des tuiles (chemins, noms, lieux, relief)
    network/      Réseau piéton (graphe) et moteur d'itinéraires (A*, consignes)
    generation/   Boucles, circuits, allers-retours, choix des propositions
    search/       Recherche d'adresse et nom d'un point
    route/        Statistiques, traversées de route, composition de tracés
    run/          Suivi de la course et texte des consignes
    export/       GPX
    storage/      Réglages et parcours enregistrés
tests/e2e/        Tests Playwright et fausses tuiles
```

**Données** (ouvertes, gratuites, sans clé) :

- **Chemins, noms de rues, adresses, lieux** : tuiles vectorielles [OpenFreeMap](https://openfreemap.org) (schéma OpenMapTiles, zoom 14), les mêmes que le fond de carte. Les villes et villages viennent des tuiles de zoom 10.
- **Relief** : [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen, hébergées par AWS), zoom 13 (environ 13 m de résolution).

**Boucles** : le réseau piéton du quartier devient un graphe (carrefours fusionnés, jonctions raccordées, impasses repérées). Des dizaines de milliers de boucles passant par 2 ou 3 points autour du départ sont évaluées : longueur, forme ronde, pas de rue reprise, pas de « doigt » ni d'épingle, agrément des voies (grands axes, terre, selon le profil), et en mode record le nombre de traversées. Les meilleures sont mesurées exactement depuis ton point de départ réel, puis tracées telles quelles.

**Circuits** (mode record ou plusieurs tours) : tours d'étangs, de parcs, de bois ou de boucles d'allées proches, choisis pour leur calme, sans épingle ni zigzag ; accès + N tours + éventuel dernier tour raccourci + retour, chaque tour annoncé.

**Aller-retour** : dans six directions, le chemin le plus direct et le plus agréable jusqu'à mi-distance, coupé au mètre près, retour par le même chemin.

**Consignes** : un virage n'est annoncé qu'à un vrai carrefour où une autre voie aurait pu être prise, avec le nom de la rue ; une fourche donne « restez à gauche / à droite ». Les crochets de passages piétons sont regroupés.

**Recherche** : rues, numéros, lieux (parcs, stades, écoles…), plans d'eau et communes, lus dans les tuiles autour de l'endroit regardé. Tolère les abréviations (« av », « pl », « st »…) et les accents manquants.

## Limites connues

- **Distance maximale** : 30 km pour une boucle d'un seul tour (au-delà, choisir plusieurs tours ou un aller-retour, jusqu'à 42 km). Le calcul se fait sur le téléphone, dont la mémoire est limitée.
- **Première utilisation dans un quartier** : il faut télécharger la carte de la zone (quelques Mo) ; ensuite tout est instantané. Hors connexion, rien ne peut être calculé dans une zone jamais visitée.
- **Recherche** : limitée à environ 2,5 km autour de l'endroit regardé pour les rues et adresses, une cinquantaine de kilomètres pour les communes. Pour chercher ailleurs, déplace d'abord la carte.
- **Données OpenStreetMap** : un chemin fermé mal renseigné peut être proposé ; une allée absente de la carte ne peut pas l'être. Deux allées parallèles reliées à un seul bout peuvent créer un petit crochet.
- **Dénivelé** : estimation à partir d'un modèle de terrain (une montre barométrique donnera une autre valeur).
- **Guidage écran éteint** : impossible dans Safari, qui suspend la page ; il faut l'app iPhone (Menhir) avec les modules indiqués plus haut.

## Crédits

Carte et chemins : © [contributeurs OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL), © OpenMapTiles, OpenFreeMap. Relief : Terrain Tiles (Mapzen ; SRTM, EU-DEM…). Rendu de carte : MapLibre GL.
