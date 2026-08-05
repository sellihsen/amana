/**
 * Configuration PM2 — Amana
 *
 * Ce fichier est versionné : il ne contient donc AUCUN secret, pas même sous
 * forme de placeholder vide.
 *
 * Deux raisons, et la seconde est un piège concret :
 *
 *  1. La constitution l'interdit — « Secrets MUST NOT be committed, including
 *     as empty placeholders in configuration that is loaded before .env ».
 *
 *  2. `dotenv` n'écrase PAS une variable déjà présente dans `process.env`.
 *     Déclarer ici `JWT_SECRET: ''` la définirait à la chaîne vide avant que
 *     `backend/.env` ne soit lu : le vrai secret serait ignoré, et le
 *     démarrage échouerait sur la validation de configuration.
 *
 * Toute la configuration sensible vit dans `backend/.env`, hors dépôt, chargé
 * par `require('dotenv').config()` au premier import de `src/index.js`.
 * Voir `backend/.env.example` pour la liste complète des variables requises.
 */
module.exports = {
  apps: [
    {
      name: 'amana',
      script: 'src/index.js',
      cwd: './backend',
      instances: 1,
      exec_mode: 'fork',


      env: {
        // Seules des valeurs non sensibles figurent ici. Tout le reste —
        // identifiants de base et clé de session — provient de backend/.env.
        NODE_ENV: 'production',
      },

      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
    },
  ],
};
