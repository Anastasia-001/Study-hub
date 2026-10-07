# Study Hub — GitHub/iPhone flat version

Tous les fichiers sont volontairement à la racine pour faciliter l'upload depuis iPhone.

## Synchronisation
- `catalog.json` liste les cours publiés.
- Chaque cours est un fichier JSON à la racine, par ex. `gbm3000-cardio-1a.json`.
- Pour publier un nouveau cours: ajouter son JSON, ajouter son entrée à `catalog.json`, augmenter `catalog_version` et la `version` du cours.
- La PWA vérifie le catalogue au lancement, au retour au premier plan et quand Internet revient.
- Les fichiers déjà téléchargés restent disponibles hors ligne via le service worker.
