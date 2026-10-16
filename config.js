// Configuration de FitLog. Ces valeurs sont publiques par conception (voir cloud-setup.md et strava-setup.md).
window.FITLOG = {
  url: '',    // Compte et sauvegarde (Supabase) : adresse du projet
  key: '',    // Compte et sauvegarde (Supabase) : clé publique
  api: '',    // Strava (facultatif) : adresse du Worker, ex. https://fitlog-strava.toi.workers.dev
  coach: true // Coach IA : mets false pour le masquer
};
