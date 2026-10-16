# Compte et cloud : installation (≈ 10 min, une seule fois)

Résultat : tu te connectes avec e-mail + mot de passe et tes données arrivent, sur n'importe quel iPhone. Même si tu supprimes et réinstalles l'app.

## 1. Créer le projet Supabase (gratuit)
1. Va sur **supabase.com** → crée un compte → **New project**.
2. Nom : `fitlog`, choisis un mot de passe de base de données (garde-le), région **Europe** (Paris ou Frankfurt) → **Create**.

## 2. Créer la table
Menu **SQL Editor → New query**, colle ceci, puis **Run** :

```sql
create table public.fitlog_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.fitlog_data enable row level security;
create policy "mes donnees" on public.fitlog_data
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.fitlog_data to authenticated;
```

Chaque compte ne voit que **sa propre ligne**.

## 3. Régler l'authentification
- **Authentication → Sign In / Providers → Email** : désactive **Confirm email** (sinon il faut valider un e-mail à chaque inscription).
- **Authentication → URL Configuration** : *Site URL* = l'adresse de ton app (ex. `https://ton-pseudo.github.io/fitlog/`). Sert au lien « mot de passe oublié ».

## 4. Récupérer les deux valeurs
**Project Settings → API** (ou *API Keys*) : note
- **Project URL** (ex. `https://abcd1234.supabase.co`)
- la clé **publique** : `anon` ou `publishable` (**jamais** la clé `service_role` / secrète)

## 5. Les mettre dans l'app
Sur GitHub, ouvre `config.js` → icône crayon → remplace les deux premières lignes (garde `api` et `coach`) :

```js
window.FITLOG = {
  url: 'https://abcd1234.supabase.co',
  key: 'ta-clé-publique',
  api: '',     // Strava : voir strava-setup.md
  coach: true
};
```

→ **Commit changes**. Ces deux valeurs sont publiques par conception : sans mot de passe, elles ne donnent accès à rien.

## 6. Utiliser
1. Ouvre l'app (patiente 1 minute après le commit) : l'écran **Connexion** apparaît.
2. **Créer un compte** : e-mail + mot de passe (8 caractères minimum).
3. Tes données du téléphone partent dans le cloud. Sur un autre appareil ou après réinstallation : tu te connectes, tout revient.

## Bon à savoir
- **Synchro automatique** : après chaque modification, à l'ouverture et au retour dans l'app. Hors ligne, tout reste en local et part à la reconnexion.
- **Conflit** (deux appareils modifiés sans synchro) : l'app te demande quelle version garder.
- **Projet gratuit en pause** : Supabase met un projet gratuit en pause après environ 1 semaine sans aucune activité. Les données sont conservées et se réveillent en un clic depuis le tableau de bord. En utilisant l'app, ça n'arrive pas.
- **Ami(e)s** : ils créent leur compte sur ta même app, avec leurs propres données (isolées par la sécurité de la table). Une fois les inscriptions faites, tu peux fermer les nouvelles inscriptions : *Authentication → Sign In / Providers → désactiver « Allow new users to sign up »*.
- **Strava** est indépendant du compte FitLog et facultatif : chacun se connecte avec **son** compte Strava depuis l'onglet Course (voir `strava-setup.md`).
- Aucune donnée n'est sur un serveur autre que **ton** projet Supabase.
