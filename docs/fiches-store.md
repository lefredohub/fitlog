# Fiches des stores et formulaires (prêts à copier)

À relire avant de coller. Mettre à jour si l'app change (coach payant, nouvelles données…).

## Textes de la fiche

**Nom** : Menhir
**Sous-titre (App Store, 30 caractères max)** : Carnet muscu et course à pied
**Description courte (Play Store, 80 caractères max)** : Tes séances de muscu et de course, ton plan, tes records. Simple et sans pub.

**Description**
> Menhir est un carnet d'entraînement pour ceux qui font de la muscu et de la course à pied.
>
> MUSCU
> • Tes séances ou des programmes tout prêts, près de 200 exercices et machines de salle
> • La charge à viser est calculée d'après ta dernière fois
> • Repos chronométré, remplacement d'un exercice en un geste, historique consultable en pleine séance
> • Un corps en 3D montre les muscles que tu as travaillés
>
> COURSE
> • Un plan semaine par semaine vers ta course (du 5 km au marathon) ou ton HYROX
> • Tes sorties arrivent toutes seules depuis ta montre, via Apple Santé ou Health Connect
> • Records, allures d'entraînement, séance guidée à la voix
>
> ET AUSSI
> • Forme du jour : 3 questions pour savoir s'il faut lever le pied
> • Coach IA (facultatif) pour faire le point sur ton plan et l'ajuster
> • Tout reste sur ton téléphone ; compte facultatif pour sauvegarder. Pas de publicité, pas de revente de données.
>
> Menhir n'est pas un dispositif médical. HYROX est une marque de son propriétaire ; Menhir n'est ni affilié à HYROX ni approuvé par HYROX.

**Mots-clés (App Store, 100 caractères max)** : musculation,course,running,plan,semi,marathon,salle,séance,carnet,records,allure,fitness

**Catégorie** : Santé et forme (App Store) ; Santé et remise en forme (Play Store).
**Captures** : 6,9 pouces (1320 × 2868) pour l'App Store ; au moins 2 captures de téléphone pour le Play Store. Accueil, séance en cours, plan, muscles 3D, records.

## App Store : « Confidentialité de l'app »
Suivi (tracking) : **non**. Données collectées (envoyées hors du téléphone) :

| Type | Utilisation | Liée à l'utilisateur |
|---|---|---|
| Santé et forme → Santé (fréquence cardiaque, ressenti) | Fonctionnalités de l'app | Oui (si compte) |
| Santé et forme → Forme physique (séances, sorties) | Fonctionnalités de l'app | Oui (si compte) |
| Coordonnées → Adresse e-mail (compte facultatif) | Fonctionnalités de l'app | Oui |
| Contenu utilisateur → Autre (messages au coach) | Fonctionnalités de l'app | Oui (si compte) |
| Identifiants → ID de l'appareil (clé aléatoire du coach, pour limiter les messages) | Fonctionnalités de l'app | Non |

Non collecté : position (les tracés GPS restent sur le téléphone), contacts, achats, données d'utilisation, diagnostics.

**Notes pour l'examen d'Apple** :
> Aucun compte n'est nécessaire (« Continuer sans compte »). Apple Santé est facultatif : Course > Sorties > Connecter Apple Santé ; Menhir lit seulement les
> entraînements de course (distance, durée, fréquence cardiaque, tracé) et n'écrit rien. Le coach IA (Muscu > Coach muscu, ou Course > Plan après avoir défini un objectif) demande un accord explicite avant le
> premier envoi de données au service d'IA (Anthropic) ; l'accord est retirable dans Réglages > Mes données. Suppression du compte : Réglages > Compte.

## Play Store : « Sécurité des données »
- Données chiffrées en transit : **oui**. Suppression possible : **oui** (dans l'app et à l'adresse `privacy.html#suppression`).
- Partage avec des tiers : **non** (Supabase, Cloudflare et Anthropic sont des prestataires qui traitent les données pour le compte de Menhir).
- Collecte :

| Catégorie | Type | Facultatif | Finalité |
|---|---|---|---|
| Informations personnelles | Adresse e-mail | Oui (compte) | Fonctionnalités, gestion du compte |
| Santé et remise en forme | Informations de santé (fréquence cardiaque, ressenti) | Oui | Fonctionnalités |
| Santé et remise en forme | Informations sur la remise en forme (séances, sorties) | Oui (rien ne sort du téléphone sans compte ni coach) | Fonctionnalités |
| Activité dans l'app | Autre contenu généré (messages au coach) | Oui | Fonctionnalités |
| Identifiants de l'appareil | Clé aléatoire du coach | Oui | Fonctionnalités (limite de messages) |

Position : non collectée (le tracé GPS lu dans Health Connect reste sur le téléphone).

## Play Store : déclaration Health Connect
| Autorisation | Pourquoi |
|---|---|
| Exercice (READ_EXERCISE) | Importer les séances de course enregistrées par la montre de l'utilisateur pour son suivi, son plan et ses records. |
| Distance (READ_DISTANCE) | Distance de chaque course, base du suivi kilométrique et du plan d'entraînement. |
| Fréquence cardiaque (READ_HEART_RATE) | Fréquence cardiaque moyenne et maximale des courses, pour les zones d'entraînement et la forme du jour. |
| Itinéraire d'exercice (READ_EXERCISE_ROUTE) | Afficher la carte d'une sortie quand l'utilisateur l'ouvre ; le tracé reste sur le téléphone. |

Menhir n'écrit rien dans Health Connect. Les données ne servent jamais à la publicité et ne sont ni vendues ni transmises, sauf au coach IA à la demande de l'utilisateur et avec son accord.
