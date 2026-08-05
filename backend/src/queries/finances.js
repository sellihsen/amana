/**
 * Agrégats financiers canoniques.
 *
 * Constitution I : « Summation, subtraction and comparison of amounts MUST be
 * performed in SQL. Application code MUST NOT reduce, total or compare amounts
 * after parseFloat. »
 *
 * Ce module est la SEULE source des totaux. Le tableau de bord, le résumé
 * financier, le bilan annuel et le bilan Social en dépendent tous : ils ne
 * peuvent donc pas diverger.
 *
 * Deux conventions structurent chaque requête :
 *
 *  1. `montant_signe` = montant × (+1 si CREDIT, −1 si DEBIT). Une somme de
 *     montants signés est donc directement un solde.
 *  2. `type_effectif` = type de l'écriture d'origine lorsqu'il s'agit d'une
 *     contre-écriture. Une annulation se déduit ainsi du même total que
 *     l'opération qu'elle corrige, et les deux s'annulent exactement.
 */

const { pool } = require('../config/database');

/** Écritures enrichies : périmètre, type effectif et montant signé. */
const ECRITURES_EFFECTIVES = `
  SELECT e.id,
         e.perimetre,
         e.caisse_id,
         e.date_effet,
         e.created_at,
         COALESCE(o.type_ecriture, e.type_ecriture) AS type_effectif,
         e.montant * CASE e.sens WHEN 'CREDIT' THEN 1 ELSE -1 END AS montant_signe
    FROM ecritures_financieres e
    LEFT JOIN ecritures_financieres o ON o.id = e.contre_ecriture_de
`;

const TYPES_ENTREE = ['DON', 'COTISATION_MEMBRE', 'ECOLAGE'];
const TYPES_SORTIE = ['DEPENSE', 'PAIEMENT_SALAIRE', 'DISTRIBUTION_SOCIALE'];

/**
 * Bornes d'une année civile : [1er janvier, 1er janvier suivant).
 * L'année est un entier validé en amont ; elle n'est jamais interpolée.
 */
function bornesAnnee(annee) {
  return { debut: `${annee}-01-01`, fin: `${annee + 1}-01-01` };
}

/**
 * Résumé du périmètre GENERAL sur une période.
 * Les montants sont retournés en chaînes exactes, produites par PostgreSQL.
 */
async function resumeGeneral(db = pool, { debut = null, fin = null } = {}) {
  const { rows } = await db.query(
    `WITH ecritures AS (${ECRITURES_EFFECTIVES})
     SELECT
       COALESCE(SUM(montant_signe) FILTER (WHERE type_effectif = 'DON'), 0)::TEXT               AS total_dons,
       COALESCE(SUM(montant_signe) FILTER (WHERE type_effectif = 'COTISATION_MEMBRE'), 0)::TEXT AS total_cotisations,
       COALESCE(SUM(montant_signe) FILTER (WHERE type_effectif = 'ECOLAGE'), 0)::TEXT           AS total_madrasa,
       COALESCE(SUM(montant_signe) FILTER (WHERE type_effectif = ANY($3)), 0)::TEXT             AS total_entrees,
       COALESCE(-SUM(montant_signe) FILTER (WHERE type_effectif = 'DEPENSE'), 0)::TEXT          AS total_depenses_directes,
       COALESCE(-SUM(montant_signe) FILTER (WHERE type_effectif = 'PAIEMENT_SALAIRE'), 0)::TEXT AS total_salaires,
       COALESCE(-SUM(montant_signe) FILTER (WHERE type_effectif = ANY($4)), 0)::TEXT            AS total_depenses,
       COALESCE(SUM(montant_signe), 0)::TEXT                                                    AS solde
     FROM ecritures
     WHERE perimetre = 'GENERAL'
       AND ($1::date IS NULL OR date_effet >= $1::date)
       AND ($2::date IS NULL OR date_effet <  $2::date)`,
    [debut, fin, TYPES_ENTREE, TYPES_SORTIE]
  );
  return rows[0];
}

/**
 * Bilan Social : collecté, distribué et disponible, par caisse et au total.
 * Le grand livre est l'autorité : aucune table de solde n'est maintenue.
 */
async function bilanSocial(db = pool, { debut = null, fin = null } = {}) {
  // Le regroupement se fait sur `type_effectif` : une contre-écriture est
  // imputée au type qu'elle corrige. Annuler une distribution DIMINUE le
  // distribué — elle n'augmente pas le collecté.
  const { rows: totaux } = await db.query(
    `WITH ecritures AS (${ECRITURES_EFFECTIVES})
     SELECT
       COALESCE(SUM(montant_signe) FILTER (WHERE type_effectif <> 'DISTRIBUTION_SOCIALE'), 0)::TEXT
         AS total_collecte,
       COALESCE(-SUM(montant_signe) FILTER (WHERE type_effectif = 'DISTRIBUTION_SOCIALE'), 0)::TEXT
         AS total_distribue,
       COALESCE(SUM(montant_signe), 0)::TEXT AS reste_disponible
     FROM ecritures
     WHERE perimetre = 'SOCIAL'
       AND ($1::date IS NULL OR date_effet >= $1::date)
       AND ($2::date IS NULL OR date_effet <  $2::date)`,
    [debut, fin]
  );

  // Agrégation par caisse : un GROUP BY, sans jointure démultipliante.
  const { rows: caisses } = await db.query(
    `WITH ecritures AS (${ECRITURES_EFFECTIVES})
     SELECT c.id,
            c.nom,
            c.actif,
            c.affectation,
            COALESCE(SUM(e.montant_signe) FILTER (WHERE e.type_effectif <> 'DISTRIBUTION_SOCIALE'), 0)::TEXT
              AS total_collecte,
            COALESCE(-SUM(e.montant_signe) FILTER (WHERE e.type_effectif = 'DISTRIBUTION_SOCIALE'), 0)::TEXT
              AS total_distribue,
            COALESCE(SUM(e.montant_signe), 0)::TEXT AS reste_disponible
       FROM caisses c
       LEFT JOIN ecritures e
              ON e.caisse_id = c.id
             AND e.perimetre = 'SOCIAL'
             AND ($1::date IS NULL OR e.date_effet >= $1::date)
             AND ($2::date IS NULL OR e.date_effet <  $2::date)
      WHERE c.affectation = 'Social'
         OR EXISTS (SELECT 1 FROM ecritures x WHERE x.caisse_id = c.id AND x.perimetre = 'SOCIAL')
      GROUP BY c.id, c.nom, c.actif, c.affectation
      ORDER BY c.nom`,
    [debut, fin]
  );

  return { ...totaux[0], caisses };
}

/**
 * Disponible d'une caisse Social, calculé depuis le grand livre.
 * À appeler APRÈS avoir verrouillé la caisse dans la transaction courante.
 */
async function disponibleSocialCaisse(client, caisseId) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(montant * CASE sens WHEN 'CREDIT' THEN 1 ELSE -1 END), 0)::TEXT AS disponible
       FROM ecritures_financieres
      WHERE perimetre = 'SOCIAL' AND caisse_id = $1`,
    [caisseId]
  );
  return rows[0].disponible;
}

/**
 * Vérifie en SQL qu'un débit laisse le disponible non négatif.
 * La comparaison est faite par PostgreSQL, jamais en JavaScript.
 */
async function debitSocialPossible(client, caisseId, montant) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(montant * CASE sens WHEN 'CREDIT' THEN 1 ELSE -1 END), 0) >= $2::numeric
              AS possible,
            COALESCE(SUM(montant * CASE sens WHEN 'CREDIT' THEN 1 ELSE -1 END), 0)::TEXT
              AS disponible
       FROM ecritures_financieres
      WHERE perimetre = 'SOCIAL' AND caisse_id = $1`,
    [caisseId, montant]
  );
  return { possible: rows[0].possible, disponible: rows[0].disponible };
}

/** Douze mois pleins d'une année, y compris les mois sans opération. */
async function evolutionMensuelle(db = pool, annee) {
  const { debut, fin } = bornesAnnee(annee);
  const { rows } = await db.query(
    `WITH ecritures AS (${ECRITURES_EFFECTIVES}),
     mois AS (
       SELECT generate_series(1, 12) AS mois
     )
     SELECT m.mois,
            COALESCE(SUM(e.montant_signe) FILTER (WHERE e.montant_signe > 0), 0)::TEXT  AS entrees,
            COALESCE(-SUM(e.montant_signe) FILTER (WHERE e.montant_signe < 0), 0)::TEXT AS sorties,
            COALESCE(SUM(e.montant_signe), 0)::TEXT                                     AS solde
       FROM mois m
       LEFT JOIN ecritures e
              ON EXTRACT(MONTH FROM e.date_effet) = m.mois
             AND e.date_effet >= $1::date AND e.date_effet < $2::date
             AND e.perimetre = 'GENERAL'
      GROUP BY m.mois
      ORDER BY m.mois`,
    [debut, fin]
  );
  return rows;
}

/** Indicateurs RH et Madrasa d'une année. */
async function indicateursRhMadrasa(db = pool, annee) {
  const { debut, fin } = bornesAnnee(annee);
  const { rows } = await db.query(
    `WITH ecritures AS (${ECRITURES_EFFECTIVES})
     SELECT
       (SELECT COUNT(*)::int FROM personnel WHERE statut = 'actif')                 AS effectif_actif,
       (SELECT COUNT(*)::int FROM eleves    WHERE statut = 'actif')                 AS eleves_actifs,
       COALESCE(-SUM(montant_signe) FILTER (WHERE type_effectif = 'PAIEMENT_SALAIRE'), 0)::TEXT
                                                                                    AS total_salaires_verses,
       COALESCE(SUM(montant_signe)  FILTER (WHERE type_effectif = 'ECOLAGE'), 0)::TEXT
                                                                                    AS total_ecolages
     FROM ecritures
     WHERE perimetre = 'GENERAL'
       AND date_effet >= $1::date AND date_effet < $2::date`,
    [debut, fin]
  );
  return rows[0];
}

/** Dernières opérations, tous périmètres, avec leur montant signé. */
async function operationsRecentes(db = pool, limite = 10) {
  const { rows } = await db.query(
    `SELECT e.id,
            e.type_ecriture       AS type,
            e.perimetre,
            e.sens,
            e.montant::TEXT       AS montant,
            e.date_effet,
            e.acteur_nom,
            e.motif,
            c.nom                 AS caisse_nom
       FROM ecritures_financieres e
       LEFT JOIN caisses c ON c.id = e.caisse_id
      ORDER BY e.date_effet DESC, e.id DESC
      LIMIT $1`,
    [limite]
  );
  return rows;
}

/**
 * Totaux d'une liste métier, calculés par PostgreSQL.
 *
 * Constitution I : c'est ici, et jamais dans l'interface, que des montants sont
 * additionnés. Une opération contrepassée est exclue du total mais reste
 * visible dans la liste.
 *
 * @param {string} table   Nom issu d'une liste FERMÉE (jamais une donnée client).
 * @param {string} colonne Colonne monétaire, également issue de la liste fermée.
 */
const TOTAUX_LISTES = Object.freeze({
  dons: { table: 'dons', colonne: 'montant' },
  depenses: { table: 'depenses', colonne: 'montant' },
  cotisations: { table: 'cotisations', colonne: 'montant' },
  paiements_salaires: { table: 'paiements_salaires', colonne: 'montant_verse' },
  cotisations_madrasa: { table: 'cotisations_madrasa', colonne: 'montant' },
});

async function totauxListe(db = pool, cle) {
  const definition = TOTAUX_LISTES[cle];
  if (!definition) throw new Error(`Liste inconnue : ${cle}`);

  const { table, colonne } = definition;
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS nombre,
            COALESCE(SUM(t.${colonne}) FILTER (
              WHERE t.ecriture_id IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1 FROM ecritures_financieres ce
                   WHERE ce.contre_ecriture_de = t.ecriture_id
                )
            ), 0)::TEXT AS montant
       FROM ${table} t`
  );
  return rows[0];
}

/** Bilan annuel : résumé général de l'année et section Social séparée. */
async function bilanAnnuel(db = pool, annee) {
  const { debut, fin } = bornesAnnee(annee);
  const [general, social] = await Promise.all([
    resumeGeneral(db, { debut, fin }),
    bilanSocial(db, { debut, fin }),
  ]);
  return { annee, periode: { debut, fin }, ...general, social };
}

module.exports = {
  ECRITURES_EFFECTIVES,
  TYPES_ENTREE,
  TYPES_SORTIE,
  bornesAnnee,
  resumeGeneral,
  bilanSocial,
  disponibleSocialCaisse,
  debitSocialPossible,
  evolutionMensuelle,
  indicateursRhMadrasa,
  operationsRecentes,
  bilanAnnuel,
  TOTAUX_LISTES,
  totauxListe,
};
