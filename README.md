# Mes Dépenses

Gestionnaire de dépenses personnel, installable sur Android et utilisable sans connexion.
Les données restent sur le téléphone (aucun serveur, aucun compte).

## Fonctions
- Ajouter, modifier ou supprimer des dépenses et des revenus (catégorie, date, note)
- Opérations récurrentes (chaque mois ou chaque semaine), ajoutées automatiquement
- Solde, revenus et dépenses du mois, avec navigation entre les mois
- Budget mensuel avec barre de progression
- Statistiques : répartition par catégorie, moyenne par jour, comparaison avec le mois précédent
- Code PIN à l'ouverture (optionnel), avec verrouillage automatique en arrière-plan
- Choix de la devise (€, FCFA, $, DH, DA, DT, CHF, £)
- Export CSV (Excel), sauvegarde et restauration en fichier .json
- Rappel de sauvegarde (chaque semaine, 15 jours ou mois), avec « Plus tard »
- Thème clair ou sombre selon le téléphone
- Proposition d'installation à chaque ouverture dans le navigateur (masquée une fois l'appli installée)

## Lancer sur le PC
```
node serve.js
```
Puis ouvre http://localhost:5173 dans le navigateur.

## Fichiers
- `index.html`, `style.css`, `app.js` : l'application
- `manifest.webmanifest`, `sw.js` : installation sur le téléphone et mode hors ligne
- `icons/` : icônes (régénérables avec `node tools/make-icons.js`)
- `serve.js` : petit serveur de test
