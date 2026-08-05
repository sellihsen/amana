/**
 * Seed de développement — jeu de données minimal et convergent.
 *
 * Ne crée ni ne modifie aucun objet de schéma : les migrations en sont la seule
 * autorité. Le script s'interrompt si elles ne sont pas toutes appliquées.
 */

require('dotenv').config();
const { pool } = require('../src/config/database');
const bcrypt = require('bcryptjs');

const {
  assertSchemaMigrated,
  assertSeedAutorise,
  motDePasseAdminSeed,
  emailAdminSeed,
} = require('./guard');

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const seed = async () => {
  assertSeedAutorise();
  await assertSchemaMigrated(pool);

  console.log('🌱 Insertion des données de test...\n');

  // ── 1. Utilisateur administrateur ───────────────────────────────────────
  const motDePasse = motDePasseAdminSeed();
  const email = emailAdminSeed();
  const hash = await bcrypt.hash(motDePasse, 12);
  await pool.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe_hash, role)
     VALUES ('Administrateur', $1, $2, 'admin')
     ON CONFLICT (email) DO NOTHING`,
    [email, hash]
  );
  console.log(`   ✅ Administrateur : ${email}`);

  // ── 2. Membres ──────────────────────────────────────────────────────────
  const membres = [
    ['Membre', 'Démo A', 'membre.a@example.invalid', '0600000101', 'actif'],
    ['Membre', 'Démo B', 'membre.b@example.invalid', '0600000102', 'actif'],
    ['Membre', 'Démo C', 'membre.c@example.invalid', '0600000103', 'actif'],
    ['Membre', 'Démo D', 'membre.d@example.invalid', '0600000104', 'actif'],
    ['Membre', 'Démo E', 'membre.e@example.invalid', '0600000105', 'inactif'],
  ];
  for (const m of membres) {
    await pool.query(
      `INSERT INTO membres (nom, prenom, email, telephone, statut)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      m
    );
  }
  console.log('   ✅ Membres (5)');

  // ── 3. Personnel + paiements ────────────────────────────────────────────
  const { rows: nbPers } = await pool.query('SELECT COUNT(*)::int AS nb FROM personnel');
  if (nbPers[0].nb === 0) {
    const { rows: personnel } = await pool.query(`
      INSERT INTO personnel (nom, prenom, role_poste, telephone, email, salaire_base, date_embauche, statut)
      VALUES
        ('Personnel', 'Démo A', 'Imam',       '0600000201', 'personnel.a@example.invalid', 2200.00, '2020-01-15', 'actif'),
        ('Personnel', 'Démo B', 'Mouadhine',  '0600000202', 'personnel.b@example.invalid', 1300.00, '2021-05-01', 'actif'),
        ('Personnel', 'Démo C', 'Enseignant', '0600000203', 'personnel.c@example.invalid', 1500.00, '2022-09-01', 'actif')
      RETURNING id
    `);
    console.log('   ✅ Personnel (3)');

    const today = new Date();
    const moisPrecedent = `${MOIS_FR[(today.getMonth() - 1 + 12) % 12]} ${
      today.getFullYear() - (today.getMonth() === 0 ? 1 : 0)
    }`;
    const moisCourant = `${MOIS_FR[today.getMonth()]} ${today.getFullYear()}`;
    await pool.query(
      `INSERT INTO paiements_salaires (personnel_id, montant_verse, type_paiement, date_versement, mois_concerne)
       VALUES ($1, 2200.00, 'Salaire mensuel', CURRENT_DATE - INTERVAL '1 month', $2),
              ($3, 1300.00, 'Salaire mensuel', CURRENT_DATE, $4)`,
      [personnel[0].id, moisPrecedent, personnel[1].id, moisCourant]
    );
    console.log('   ✅ Paiements de salaires (2)');
  } else {
    console.log('   ⏭  Personnel déjà présent.');
  }

  // ── 4. Élèves + cotisations Madrasa ─────────────────────────────────────
  const { rows: nbEleves } = await pool.query('SELECT COUNT(*)::int AS nb FROM eleves');
  if (nbEleves[0].nb === 0) {
    const { rows: eleves } = await pool.query(`
      INSERT INTO eleves (nom, prenom, classe, nom_parent, telephone_parent, date_inscription, statut)
      VALUES
        ('Élève', 'Démo A', 'Débutants', 'Parent Démo A', '0600000301', '2025-09-01', 'actif'),
        ('Élève', 'Démo B', 'Débutants', 'Parent Démo B', '0600000302', '2025-09-01', 'actif'),
        ('Élève', 'Démo C', 'Niveau 1',  'Parent Démo C', '0600000303', '2025-09-01', 'actif'),
        ('Élève', 'Démo D', 'Niveau 2',  'Parent Démo D', '0600000304', '2025-09-01', 'actif'),
        ('Élève', 'Démo E', 'Débutants', 'Parent Démo E', '0600000305', '2025-10-01', 'inactif')
      RETURNING id, statut
    `);
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
           ON CONFLICT (eleve_id, mois_concerne) DO NOTHING`,
          [eleve.id, mois, paye ? 'payé' : 'en attente']
        );
      }
    }
    console.log('   ✅ Élèves Madrasa (5) et leurs cotisations');
  } else {
    console.log('   ⏭  Élèves déjà présents.');
  }

  // ── 5. Dons ─────────────────────────────────────────────────────────────
  const { rows: nbDons } = await pool.query('SELECT COUNT(*)::int AS nb FROM dons');
  const { rows: caisses } = await pool.query('SELECT id, nom FROM caisses ORDER BY id');
  const { rows: membresDb } = await pool.query('SELECT id FROM membres ORDER BY id');
  if (nbDons[0].nb === 0 && caisses.length > 0 && membresDb.length >= 2) {
    const caisseParNom = (fragment) =>
      (caisses.find((c) => c.nom.includes(fragment)) || caisses[0]).id;

    await pool.query(
      `INSERT INTO dons (membre_id, caisse_id, montant, date_don, commentaire, anonyme) VALUES
         ($1, $2, 150.00, CURRENT_DATE - INTERVAL '5 days', 'Don du vendredi',        false),
         (NULL, $3, 50.00, CURRENT_DATE - INTERVAL '3 days', 'Zakat al-Fitr',          true),
         ($4, $5, 200.00, CURRENT_DATE - INTERVAL '2 days',  'Don pour les orphelins', false),
         (NULL, $2, 75.00, CURRENT_DATE - INTERVAL '1 day',  'Sadaqa',                 true)`,
      [
        membresDb[0].id,
        caisseParNom('Dons du Vendredi'),
        caisseParNom('Zakat'),
        membresDb[1].id,
        caisseParNom('Orphelins'),
      ]
    );
    console.log('   ✅ Dons (4)');
  } else {
    console.log('   ⏭  Dons déjà présents.');
  }

  // ── 6. Cotisations membres ──────────────────────────────────────────────
  const { rows: nbCot } = await pool.query('SELECT COUNT(*)::int AS nb FROM cotisations');
  if (nbCot[0].nb === 0 && membresDb.length >= 2) {
    await pool.query(
      `INSERT INTO cotisations (membre_id, montant, annee, mois, date_paiement, statut) VALUES
         ($1, 120.00, 2025, 1, CURRENT_DATE - INTERVAL '30 days', 'payee'),
         ($2, 120.00, 2025, 1, CURRENT_DATE - INTERVAL '15 days', 'payee')`,
      [membresDb[0].id, membresDb[1].id]
    );
    console.log('   ✅ Cotisations membres (2)');
  } else {
    console.log('   ⏭  Cotisations déjà présentes.');
  }

  // ── 7. Stock ────────────────────────────────────────────────────────────
  const { rows: nbStock } = await pool.query('SELECT COUNT(*)::int AS nb FROM produits_stock');
  if (nbStock[0].nb === 0) {
    await pool.query(`
      INSERT INTO produits_stock (nom, categorie, quantite_actuelle, quantite_minimale_alerte, unite, emplacement) VALUES
        ('Sacs de Ciment',  'Construction',       5,  10, 'Sacs',   'Réserve au sous-sol'),
        ('Briques',         'Construction',     200, 100, 'Pièces', 'Palette arrière'),
        ('Peinture',        'Construction',       3,  10, 'Litres', 'Armoire fermée'),
        ('Cahiers',         'Fournitures École', 30,  20, 'Pièces', 'Bureau Madrasa'),
        ('Tableaux blancs', 'Fournitures École',  2,   1, 'Pièces', 'Salle de classe')
    `);
    console.log('   ✅ Produits Stock (5)');
  } else {
    console.log('   ⏭  Produits déjà présents.');
  }

  console.log('\n✅ Données de test insérées avec succès.');
};

seed()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('❌ Erreur seed :', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
