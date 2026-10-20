# Study Hub

Application de révision en français, installable sur iPhone, hébergée gratuitement sur [GitHub Pages](https://anastasia-001.github.io/Study-hub/). Interface blanc/noir/gris ; rouge pour les notions prioritaires et les cartes à revoir. Aucun compte ni service payant.

## Utilisation sur iPhone

1. Ouvrir le site dans Safari → Partager → Sur l’écran d’accueil. Garder « Ouvrir comme app web » activé si proposé.
2. **Ouvrir l’app depuis cette icône avec Internet**. Le stockage de Safari et celui de l’app installée peuvent être distincts.
3. Attendre « Prêt pour le hors ligne » et « Disponible sans Internet » sur chaque cours.
4. Activer le mode avion, quitter puis rouvrir Study Hub et essayer les questions, réponses, modes et navigation.
5. Retrouver Internet puis ouvrir l’app : les nouveaux cours et leurs images sont téléchargés automatiquement. « Synchroniser » permet de réessayer manuellement.

Ne pas effacer les données du site : cela supprime cours et progression. L’app demande un stockage persistant lors des interactions d’installation/synchronisation, mais iOS garde le contrôle du stockage. Une sauvegarde de progression est exportable depuis le bas de la bibliothèque et restaurable depuis « Installer sur iPhone ». La progression est locale à chaque appareil, sans synchronisation cloud.

## Six cours et quiz

La bibliothèque contient 370 questions dans six sections compactes. Chaque cours propose des thèmes. Les réponses courtes sont sélectionnables; le corrigé et une explication apparaissent après le choix (ou après « Valider » pour les réponses multiples). Les questions du professeur sont adaptées et distinguées des entraînements. Voir [les notes de contenu](COURSE_NOTES.md).

## Révisions

- Priorité examen : questions marquées `exam`, dont les questions du professeur.
- Tout réviser : toutes les questions, avec les compléments.
- Questions du professeur : questions marquées `prof_question` (ou `qcm` pour les données historiques).
- À revoir : cartes marquées manuellement ou évaluées « À revoir / Difficile ».
- Révisions prévues : cartes dont l’échéance est atteinte.

Après réponse : À revoir = 10 minutes, Difficile = 1 jour, Compris = 3 jours puis intervalle précédent × 2,5. La barre de progression compte les cartes dont l’intervalle est d’au moins 3 jours ; il ne constitue pas une mesure de réussite à l’examen. Les cartes gardent leur identifiant pour préserver le suivi après une mise à jour. Une session conserve son jeu de cartes pendant la synchronisation.

## Architecture et garanties

Application statique, sans étape de compilation ni dépendance d’exécution. `index.html`, `styles.css`, `app.js`, manifeste et icônes constituent l’application, précachée par `sw.js` dans `studyhub-shell-v6`. Le stockage est inclus dans le script principal, qui sait aussi démarrer depuis l’ancien HTML pendant la transition de service worker.

IndexedDB `studyhub` conserve :

- `courses` : un enregistrement par cours contenant métadonnées, cartes et toutes les images sous forme de Blob ;
- `settings` : catalogue et horodatage de la dernière synchronisation complète ;
- `progress` : positions et répétition espacée, indépendantes des cours.

Le chargement initial lit IndexedDB sans attendre le réseau. Une synchronisation est déclenchée au lancement, au retour au premier plan, à l’événement `online` et par le bouton. **Aucune synchronisation n’est promise lorsque iOS a fermé ou suspendu l’app.**

Les téléchargements expirent après 15 secondes par ressource. Le JSON est validé et son empreinte SHA-256 vérifiée avant enregistrement. Les images doivent toutes être téléchargées et décodables. L’ensemble d’un cours est enregistré en une transaction IndexedDB : panne serveur, téléchargement incomplet, JSON invalide, image manquante ou quota dépassé conservent l’ancien cours. Les téléchargements réussis d’autres cours restent acquis. Le catalogue distant n’efface jamais les cours locaux. Aucun retour automatique à une version plus ancienne.

Les images sont hébergées dans ce dépôt, aux formats PNG/JPEG/WebP/GIF. Les chemins `src` sont relatifs à la racine de l’application, même pour un JSON dans un sous-dossier. Le HTML pédagogique autorise seulement les éléments simples (paragraphes, listes, gras, indices, tableaux, images), sans scripts ni attributs actifs. Utiliser des fichiers d’image versionnés et une nouvelle version du cours pour chaque changement visuel.

Le service worker ne masque pas les échecs réseau des synchronisations. Les anciens caches sont conservés pour permettre la migration des anciens cours ; les caches d’autres applications du même domaine ne sont jamais supprimés. Le cours historique sans images et les positions v1 sont migrés lorsque présents localement.

## Ajouter les prochains PDF — workflow de publication

Une conversation n’est pas une boîte de dépôt automatique. Sur demande explicite d’ajout : l’agent doit avoir accès au PDF et un accès GitHub en écriture à ce dépôt. Aucun service supplémentaire n’est nécessaire tant que cet accès est disponible.

1. Lire le PDF transmis, repérer les étoiles rouges et les QCM du professeur, rédiger les cartes avec les diapositives sources. Ne pas inventer de faits. Ne pas modifier les cartes actuelles sans consulter leur source.
2. Créer `cours/<identifiant>.json` (ou conserver les fichiers historiques à la racine) au format ci-dessous. Garder des IDs de cartes stables ; augmenter `version` pour une mise à jour. Une carte au sens différent reçoit un nouvel ID.
3. Ajouter les images utiles, lisibles, recadrées, sans réponse visible côté question. Ne pas publier le PDF original sans autorisation explicite. Le dépôt et les flashcards publiées sont publics.
4. Ajouter une entrée `{ "id": "...", "url": "./cours/....json" }` dans `catalog.json` si le cours est nouveau.
5. Exécuter `npm run catalog`, puis `npm run check`. Le script recalcule les compteurs et SHA-256, et incrémente `catalog_version`. `.gitattributes` empêche Git de changer les octets JSON après calcul.
6. Publier JSON, images et catalogue **dans le même commit** sur `main`. GitHub Pages doit continuer à publier la racine de cette branche.
7. Attendre la publication et vérifier l’empreinte du cours en ligne. Ouvrir Study Hub et tester l’apparition puis l’accès hors ligne. La même icône iPhone reste utilisable sans réinstallation.

```json
{
  "schema": 1,
  "id": "gbm3000-chapitre",
  "version": 1,
  "title": "GBM3000 · Nom du chapitre",
  "subtitle": "Nom du cours — Enseignant",
  "cards": [{
    "id": "concept-001",
    "section": "Thème",
    "exam": true,
    "qcm": false,
    "source": "Nom du PDF · p. 12–13",
    "references": [{"document": "cours", "pages": [12, 13]}],
    "prof_question": false,
    "priority_basis": "Objectifs du cours",
    "type": "single",
    "choices": ["Réponse correcte", "Distracteur plausible", "Autre distracteur"],
    "correct": [0],
    "short_answer": "Réponse correcte",
    "question_html": "Question précise ?",
    "answer_html": "Explication sourcée affichée après la sélection."
  }]
}
```

Déclarer aussi les sources dans `documents` avec identifiant, titre et nombre de pages. Pour un choix multiple, utiliser `type: "multiple"` et tous les indices corrects dans `correct`. `qcm` désigne les QCM du professeur, pas l’ensemble des questions à choix de réponse.

Pour ajouter seulement du contenu : ne pas changer le cache de l’application. Pour modifier HTML/CSS/JS/manifeste/icônes : augmenter la version du cache dans **`sw.js` et `checkShell()` dans `app.js`**, ainsi que la version affichée. Le nouveau service worker précache l’application complète puis prend la main. Le bouton Actualiser apparaît à la bibliothèque ; aucune session active n’est interrompue.

## Développement et vérification

Node.js et Chrome installés : `npm install`, `npm run check`, `npm test`. Les dépendances servent uniquement aux tests. Le serveur de tests est local, temporaire et utilise un port libre. Les cours de test sont simulés en mémoire et ne sont jamais publiés. Captures et résultats vont dans `test-results/` (ignoré par Git).

La suite `tests/quiz.cjs` utilise un vrai Chromium avec service worker, Cache Storage et IndexedDB : premier téléchargement, modes, réponses, navigation, progression, sauvegarde, coupure réseau, rechargement/réouverture, erreur HTTP 503, JSON tronqué, conservation de progression après mise à jour, images manquantes/hors ligne, nouveaux cours, conservation d’un cours retiré du catalogue, absence d’erreurs JavaScript et formats d’écran mobiles.

La simulation Chromium ne prouve pas l’installation iOS ni les safe areas sur un iPhone physique : le test mode avion depuis l’icône reste nécessaire. Instructions Apple : https://support.apple.com/fr-ca/guide/iphone/iphea86e5236/ios ; politique de stockage WebKit : https://webkit.org/blog/14403/updates-to-storage-policy/.
