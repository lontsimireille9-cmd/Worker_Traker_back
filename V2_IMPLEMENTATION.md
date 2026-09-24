# Workforce Tracker V2 — modèle Projet / Équipe / Section / Tâche / Validation

## Principe
La progression officielle d'un projet provient des tâches validées. Les activités et sous-tâches détaillent le travail mais ne deviennent pas automatiquement des KPI.

## Hiérarchie
Entreprise → Équipe → Projet → Section → Tâche → Sous-tâche → Soumission → Validation → Audit → KPI.

## Règles
- Une tâche est attribuée par un responsable.
- L'employé responsable estime son travail et prépare ses sous-tâches avant la soumission.
- Une tâche ne contribue à la progression officielle qu'après validation.
- Un rejet incrémente `rejectionCount` et conserve l'historique.
- Les poids des équipes d'un projet ne peuvent pas dépasser 100 %.
- Les poids des sections d'une équipe de projet ne peuvent pas dépasser 100 %.
- Les modifications de périmètre créent une nouvelle version dans `projectVersions`.
- Les données historiques ne sont pas supprimées physiquement lorsqu'elles ont contribué aux KPI.

## KPI
- progression pondérée du projet
- effort assigné / validé
- taux de validation
- validation au premier passage
- respect des délais
- tâches en retard
- tâches bloquées
- validations en attente

## Firebase
Le frontend conserve Firebase Authentication. Le backend continue d'utiliser Firebase Admin SDK et Firestore. Le fichier `.env` du backend n'est pas inclus dans le package de livraison : conserver le fichier local existant.

Les règles Firestore bloquent les accès directs client. Les opérations métier passent par l'API backend.
