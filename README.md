# Mes Dépenses

Gestionnaire de dépenses personnel, installable sur Android et utilisable sans connexion.
Les données restent sur le téléphone (aucun serveur, aucun compte).

## Fonctions

**Opérations**
- Dépenses, revenus et virements entre comptes (catégorie, compte, date, note)
- Photo du ticket de caisse jointe à une opération
- Favoris : ajouter une dépense habituelle en un geste
- Opérations récurrentes (chaque mois ou chaque semaine), ajoutées automatiquement
- Recherche (note, catégorie, montant) et filtres (type, catégorie, compte, période)

**Suivi**
- Solde, revenus et dépenses du mois, avec navigation entre les mois
- Budget mensuel, et budgets par catégorie avec alerte à 80 % et en cas de dépassement
- Statistiques : répartition par catégorie, évolution sur 6 mois, comparaison avec le mois précédent
- Bilan annuel : totaux, taux d'épargne, mois par mois, principales catégories
- Relevé du mois en PDF (via « Enregistrer en PDF » de l'impression)

**Organisation** (onglet Plus)
- Plusieurs comptes (banque, espèces, mobile money…) avec leur solde
- Objectifs d'épargne avec progression et montant à mettre de côté par mois
- Dettes et prêts, remboursements partiels, alerte en cas de retard

**Réglages**
- Catégories personnalisées (nom, emoji, couleur) et catégories masquables
- Choix de la devise (€, FCFA, $, DH, DA, DT, CHF, £)
- Code PIN à l'ouverture (optionnel), avec verrouillage automatique en arrière-plan
- Sauvegarde .json (protégée par mot de passe si on veut), restauration, export CSV
- Rappel de sauvegarde (chaque semaine, 15 jours ou mois), avec « Plus tard »
- Apparence : thème automatique, clair ou sombre, et 5 couleurs d'encre (marine, forêt, prune, océan, ardoise)

## Design
Idée directrice : « papier et encre ». La carte du solde est imprimée comme un billet de banque
(encre, lignes gravées, rosace dorée) ; le reste est sobre, et les montants sont composés en caractères
à empattements, comme dans un livre de comptes. La couleur porte du sens : vert = entrées,
rouille = sorties, or = ton argent et tes objectifs. Seules les polices du téléphone sont utilisées
(rien à télécharger, l'appli reste légère et marche hors connexion).

Mouvements, chacun en réponse à quelque chose : le billet s'incline avec le téléphone avec un reflet
holographique, le solde défile jusqu'à sa nouvelle valeur, la nouvelle opération est mise en évidence,
un tampon « Atteint ! » s'imprime sur un objectif réussi, et un mini-billet reste visible en haut
quand on fait défiler la liste. Tout est coupé si le téléphone demande de réduire les animations.
- Proposition d'installation à chaque ouverture dans le navigateur

## Lancer sur le PC
```
node serve.js
```
Puis ouvre http://localhost:5173 dans le navigateur.

## Fichiers
- `index.html` : la structure de la page
- `style.css` : l'apparence
- `js/` : le fonctionnement, un fichier par partie
  - `core.js` : données, stockage, calculs et formatage (utilisé par tous les autres)
  - `list.js` : onglet Opérations (liste, recherche, filtres)
  - `stats.js` : onglet Statistiques et graphiques
  - `form.js` : formulaire d'ajout (virements, favoris, photo)
  - `plus.js` : onglet Plus (comptes, objectifs, dettes, bilan annuel, relevé PDF)
  - `settings.js` : onglet Réglages (catégories, favoris…)
  - `recurring.js` : opérations récurrentes
  - `backup.js` : sauvegarde, restauration, chiffrement, export CSV
  - `security.js` : code PIN
  - `photos.js` : stockage des photos de tickets
  - `dialog.js` : fenêtre de saisie réutilisable
  - `install.js` : proposition d'installation
  - `motion.js` : animations (billet qui s'incline, compteur du solde, tampon, mini-billet)
  - `main.js` : affichage général, navigation et démarrage (chargé en dernier)
- `manifest.webmanifest`, `sw.js` : installation sur le téléphone et mode hors ligne
- `icons/` : icônes (régénérables avec `node tools/make-icons.js`)
- `serve.js` : petit serveur de test
