/**
 * runSeed.js — jeu de démonstration complet (remise à zéro des données).
 *
 * Usage : SEED_ADMIN_PASSWORD='…' node backend/seeds/runSeed.js
 *
 * Différence avec `seeds/run.js` : ce script VIDE les tables métier avant
 * d'insérer un jeu de démonstration complet, module Social inclus.
 *
 * Ne crée ni ne modifie aucun objet de schéma : les migrations en sont la seule
 * autorité, et le script s'interrompt si elles ne sont pas toutes appliquées.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { pool } = require('../src/config/database');
const bcrypt = require('bcryptjs');

const {
  assertSchemaMigrated,
  rattacherAuGrandLivre,
  assertSeedAutorise,
  motDePasseAdminSeed,
  emailAdminSeed,
} = require('./guard');

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const log = (msg) => console.log(`  ✅ ${msg}`);

/**
 * Tables métier remises à zéro. Liste explicite et figée : aucun nom de table
 * n'est déduit d'une donnée ni deviné à l'exécution.
 */
const TABLES_A_VIDER = [
  'distributions_sociales',
  'familles_necessiteuses',
  'paiements_salaires',
  'personnel',
  'cotisations_madrasa',
  'eleves',
  'cotisations',
  'dons',
  'depenses',
  'membres',
  'produits_stock',
  'utilisateurs',
];

(async () => {
  console.log("\n🌱 Seed — Début de l'initialisation des données\n");

  try {
    assertSeedAutorise();
    await assertSchemaMigrated(pool);

    // ── 1. Remise à zéro des données métier ───────────────────────────────
    // Les référentiels (caisses, catégories, classes, types RH, projet_config)
    // et le journal d'audit ne sont pas vidés : ils appartiennent aux
    // migrations et à l'historique.
    console.log('  🧹 Nettoyage des données métier...');
    await pool.query(
      `TRUNCATE TABLE ${TABLES_A_VIDER.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`
    );
    log('Données métier vidées');

    // ── 2. Utilisateur administrateur ─────────────────────────────────────
    const motDePasse = motDePasseAdminSeed();
    const email = emailAdminSeed();
    const hash = await bcrypt.hash(motDePasse, 12);
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe_hash, role)
       VALUES ('Administrateur', $1, $2, 'admin')
       ON CONFLICT (email) DO NOTHING`,
      [email, hash]
    );
    log(`Administrateur : ${email}`);

    // ── 3. Caisse Social de démonstration ─────────────────────────────────
    // `caisses.nom` ne porte pas encore de contrainte d'unicité : l'insertion
    // est gardée explicitement plutôt que par ON CONFLICT.
    await pool.query(
      `INSERT INTO caisses (nom, description, affectation)
       SELECT 'Fonds Solidarité Sociale', 'Aide aux familles nécessiteuses', 'Social'
        WHERE NOT EXISTS (SELECT 1 FROM caisses WHERE nom = 'Fonds Solidarité Sociale')`
    );
    log('Caisse Social vérifiée');

    // ── 4. Membres ────────────────────────────────────────────────────────
    await pool.query(`
      INSERT INTO membres (nom, prenom, email, telephone, statut) VALUES
        ('Membre', 'Démo A', 'membre.a@example.invalid', '0600000101', 'actif'),
        ('Membre', 'Démo B', 'membre.b@example.invalid', '0600000102', 'actif'),
        ('Membre', 'Démo C', 'membre.c@example.invalid', '0600000103', 'actif'),
        ('Membre', 'Démo D', 'membre.d@example.invalid', '0600000104', 'actif'),
        ('Membre', 'Démo E', 'membre.e@example.invalid', '0600000105', 'inactif')
    `);
    log('Membres (5)');

    // ── 5. Personnel + paiements ──────────────────────────────────────────
    const { rows: personnel } = await pool.query(`
      INSERT INTO personnel (nom, prenom, role_poste, telephone, email, salaire_base, date_embauche, statut)
      VALUES
        ('Personnel', 'Démo A', 'Imam',       '0600000201', 'personnel.a@example.invalid', 2200.00, '2020-01-15', 'actif'),
        ('Personnel', 'Démo B', 'Mouadhine',  '0600000202', 'personnel.b@example.invalid', 1300.00, '2021-05-01', 'actif'),
        ('Personnel', 'Démo C', 'Enseignant', '0600000203', 'personnel.c@example.invalid', 1500.00, '2022-09-01', 'actif')
      RETURNING id
    `);
    log('Personnel (3)');

    const today = new Date();
    const moisPrecedent = `${MOIS_FR[(today.getMonth() - 1 + 12) % 12]} ${
      today.getFullYear() - (today.getMonth() === 0 ? 1 : 0)
    }`;
    const moisCourant = `${MOIS_FR[today.getMonth()]} ${today.getFullYear()}`;
    await pool.query(
      `INSERT INTO paiements_salaires
         (personnel_id, montant_verse, type_paiement, date_versement, mois_concerne, commentaire)
       VALUES ($1, 2200.00, 'Salaire mensuel', CURRENT_DATE - INTERVAL '1 month', $2, 'Salaire Imam'),
              ($3, 1300.00, 'Salaire mensuel', CURRENT_DATE,                      $4, 'Salaire Mouadhine')`,
      [personnel[0].id, moisPrecedent, personnel[1].id, moisCourant]
    );
    log('Paiements de salaires (2)');

    // ── 6. Élèves + cotisations ───────────────────────────────────────────
    const { rows: eleves } = await pool.query(`
      INSERT INTO eleves (nom, prenom, classe, nom_parent, telephone_parent, date_inscription, statut) VALUES
        ('Élève', 'Démo A', 'Débutants', 'Parent Démo A', '0600000301', '2025-09-01', 'actif'),
        ('Élève', 'Démo B', 'Débutants', 'Parent Démo B', '0600000302', '2025-09-01', 'actif'),
        ('Élève', 'Démo C', 'Niveau 1',  'Parent Démo C', '0600000303', '2025-09-01', 'actif'),
        ('Élève', 'Démo D', 'Niveau 2',  'Parent Démo D', '0600000304', '2025-09-01', 'actif'),
        ('Élève', 'Démo E', 'Débutants', 'Parent Démo E', '0600000305', '2025-10-01', 'inactif')
      RETURNING id, statut
    `);
    log('Élèves Madrasa (5)');

    let nbCotisations = 0;
    for (const eleve of eleves) {
      for (let i = 0; i < 3; i += 1) {
        const d = new Date();
        d.setMonth(d.getMonth() - 2 + i);
        const mois = `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
        const paye = eleve.statut === 'actif' && i < 2;
        await pool.query(
          `INSERT INTO cotisations_madrasa
             (eleve_id, montant, mois_concerne, date_paiement, methode_paiement, statut_paiement)
           VALUES ($1, 50.00, $2, CURRENT_DATE, 'Espèces', $3)
           ON CONFLICT (eleve_id, periode) DO NOTHING`,
          [eleve.id, mois, paye ? 'payé' : 'en attente']
        );
        nbCotisations += 1;
      }
    }
    log(`Cotisations Madrasa (${nbCotisations})`);

    // ── 7. Dons ───────────────────────────────────────────────────────────
    const { rows: caisses } = await pool.query('SELECT id, nom FROM caisses ORDER BY id');
    const { rows: membres } = await pool.query('SELECT id FROM membres ORDER BY id');
    const caisseParNom = (fragment) =>
      (caisses.find((c) => c.nom.includes(fragment)) || caisses[0]).id;

    await pool.query(
      `INSERT INTO dons (membre_id, caisse_id, montant, date_don, commentaire, anonyme) VALUES
         ($1, $2, 150.00, CURRENT_DATE - 5, 'Don du vendredi',        false),
         (NULL, $3, 50.00, CURRENT_DATE - 3, 'Zakat al-Fitr',          true),
         ($4, $5, 200.00, CURRENT_DATE - 2, 'Don pour les orphelins', false),
         (NULL, $2, 75.00, CURRENT_DATE - 1, 'Sadaqa',                 true)`,
      [
        membres[0].id,
        caisseParNom('Dons du Vendredi'),
        caisseParNom('Zakat al-Fitr'),
        membres[1].id,
        caisseParNom('Orphelins'),
      ]
    );
    log('Dons (4)');

    // ── 8. Cotisations membres ────────────────────────────────────────────
    await pool.query(
      `INSERT INTO cotisations (membre_id, montant, annee, mois, date_paiement, statut) VALUES
         ($1, 120.00, 2025, 1, CURRENT_DATE - 30, 'payee'),
         ($2, 120.00, 2025, 1, CURRENT_DATE - 15, 'payee')`,
      [membres[0].id, membres[1].id]
    );
    log('Cotisations membres (2)');

    // ── 9. Stock ──────────────────────────────────────────────────────────
    await pool.query(`
      INSERT INTO produits_stock (nom, categorie, quantite_actuelle, quantite_minimale_alerte, unite, emplacement) VALUES
        ('Sacs de Ciment',  'Construction',       5,  10, 'Sacs',   'Réserve au sous-sol'),
        ('Briques',         'Construction',     200, 100, 'Pièces', 'Palette arrière'),
        ('Peinture',        'Construction',       3,  10, 'Litres', 'Armoire fermée'),
        ('Cahiers',         'Fournitures École', 30,  20, 'Pièces', 'Bureau Madrasa'),
        ('Tableaux blancs', 'Fournitures École',  2,   1, 'Pièces', 'Salle de classe')
    `);
    log('Produits Stock (5) — dont 2 en alerte');

    // ── 10. Familles nécessiteuses ────────────────────────────────────────
    await pool.query(`
      INSERT INTO familles_necessiteuses
        (nom_responsable, adresse, telephone, ressources_mensuelles, nb_membres_famille,
         montant_recommande_aide, frequence_aide, commentaires)
      VALUES
        ('Famille Bénéficiaire A', '1 rue de la Démonstration, 00000 Villeexemple', '0600000001', 850.00, 4, 300.00, 'Mensuelle', 'Données fictives — gabarit de démonstration'),
        ('Famille Bénéficiaire B', '2 rue de la Démonstration, 00000 Villeexemple', '0600000002', 620.00, 5, 400.00, 'Mensuelle', 'Données fictives — gabarit de démonstration')
    `);
    log('Familles nécessiteuses (2)');

    // ── 11. Don Social puis distribution ──────────────────────────────────
    const caisseSociale = caisses.find((c) => c.nom === 'Fonds Solidarité Sociale');
    if (caisseSociale) {
      await pool.query(
        `INSERT INTO dons (membre_id, caisse_id, montant, date_don, commentaire, anonyme)
         VALUES (NULL, $1, 200.00, CURRENT_DATE - 2, 'Don pour le fonds solidarité', true)`,
        [caisseSociale.id]
      );
      const { rows: familles } = await pool.query(
        'SELECT id FROM familles_necessiteuses ORDER BY id LIMIT 1'
      );
      await pool.query(
        `INSERT INTO distributions_sociales
           (famille_id, caisse_origine_id, montant_verse, date_versement, commentaire)
         VALUES ($1, $2, 150.00, CURRENT_DATE - 1, 'Aide alimentaire urgente')`,
        [familles[0].id, caisseSociale.id]
      );
      log('Don Social (1) et distribution (1)');
    }

    // Sans ce rattachement, aucune des lignes insérées n'apparaîtrait dans les
    // totaux : ils sont tous calculés depuis le grand livre.
    const nbEcritures = await rattacherAuGrandLivre(pool);
    log(`Grand livre : ${nbEcritures} écriture(s) rattachée(s)`);

    console.log('\n✅ Seed terminé avec succès.');
    console.log(`   🔑 Connexion : ${email}`);
  } catch (error) {
    console.error('\n❌ Erreur fatale lors du seed :');
    console.error('   ', error.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }

  await pool.end();
})();
