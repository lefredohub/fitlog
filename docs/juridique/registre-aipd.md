# Registre des traitements et analyse d'impact (AIPD) : brouillon

Responsable de traitement : [PRÉNOM NOM], [ADRESSE], [E-MAIL]. Document interne (art. 30 et 35 du RGPD), à tenir à jour et à faire relire.
L'AIPD est requise ou fortement recommandée : données de santé (données sensibles) traitées pour des utilisateurs en nombre croissant.

## 1. Registre

| Traitement | Données | Base légale | Durée | Destinataires |
|---|---|---|---|---|
| Carnet d'entraînement | Séances, charges, sorties (date, distance, durée, allure, D+) | Exécution du service | Tant que l'utilisateur les garde | Téléphone ; sauvegarde Supabase si compte |
| Données de santé | Fréquence cardiaque, ressenti du jour, données lues dans Apple Santé ou Health Connect (lecture seule) | Consentement exprès (art. 9.2.a), retirable avec effacement | Ressenti : 60 jours ; FC : tant que la sortie existe | Téléphone ; sauvegarde Supabase (résumés, pas les tracés) |
| Tracés GPS | Points GPS des sorties | Exécution du service | Tant que la sortie existe | Téléphone uniquement (exclus de la sauvegarde) |
| Compte | E-mail, mot de passe chiffré | Exécution du service | Jusqu'à suppression du compte | Supabase (authentification) |
| Coach IA (facultatif) | Résumés des séances et sorties à soi, ressenti, objectifs, messages | Consentement exprès avant le premier envoi, retirable (Réglages > Mes données) | Conservation courte par le fournisseur, sans entraînement des modèles (selon ses conditions) | Anthropic (API Claude) ; Cloudflare Workers AI en secours |
| Abonnement (à venir) | Identifiant d'achat, statut | Exécution du contrat, obligations comptables | 10 ans pour les pièces comptables | Apple / [PRESTATAIRE] |

## 2. Analyse d'impact (résumé)

**Nécessité et proportionnalité** : seules les données utiles au suivi sont collectées ; pas de publicité, pas de revente, pas de profilage
commercial ; les tracés GPS restent sur le téléphone ; l'utilisateur peut exporter, corriger et effacer.

| Risque | Gravité | Vraisemblance | Mesures |
|---|---|---|---|
| Accès illégitime à la sauvegarde (fuite) | Importante | Limitée | Authentification Supabase, HTTPS ; [VÉRIFIER : règles d'accès par utilisateur (RLS) actives, chiffrement au repos, région UE] |
| Envoi de données de santé au service d'IA | Importante | Limitée | Opt-in, avertissement avant le premier envoi, fournisseurs sans réutilisation pour l'entraînement des modèles, résumés seulement |
| Transferts hors UE (Cloudflare, Anthropic, GitHub) | Modérée | Certaine | Clauses contractuelles types / Data Privacy Framework ; [VÉRIFIER pour chaque fournisseur] |
| Collecte de santé sans accord valable | Importante | Faible | Accord exprès séparé avant la première collecte, retrait avec effacement (v4.8) ; accord séparé pour le coach IA (v4.12) |
| Mineurs | Modérée | Limitée | Âge minimum 15 ans indiqué ; prudence du coach sur les charges et l'alimentation |

**Actions restantes** : vérifier la région Supabase et signer son DPA ; vérifier les DPA de Cloudflare et d'Anthropic ; documenter la procédure
en cas de fuite (notification CNIL sous 72 h) ; faire relire ce document.
