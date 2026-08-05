import api from './api'
import { normaliserSaisie, messageMontantInvalide } from '../utils/money'

/**
 * Envoi des créations financières.
 *
 * Deux règles s'appliquent à TOUTES les opérations d'argent, et elles vivent
 * ici plutôt que dans chaque page :
 *
 *  1. le serveur exige un en-tête `Idempotency-Key` : un double clic ou un
 *     rejeu réseau ne doit jamais produire deux écritures;
 *  2. les montants voyagent en chaînes EUR exactes, jamais en nombres.
 */

export function nouvelleCleIdempotence() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `op-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** Erreur de saisie monétaire, présentable telle quelle à l'utilisateur. */
export class MontantInvalideError extends Error {
  constructor(champ) {
    super(messageMontantInvalide())
    this.name = 'MontantInvalideError'
    this.champ = champ
  }
}

/**
 * Normalise les champs monétaires d'un corps de requête.
 * @param {object} corps
 * @param {string[]} champsMontant
 * @returns {object} copie avec des chaînes EUR canoniques.
 */
export function normaliserMontants(corps, champsMontant) {
  const sortie = { ...corps }
  for (const champ of champsMontant) {
    const brut = sortie[champ]
    if (brut === undefined || brut === null || brut === '') continue
    const normalise = normaliserSaisie(String(brut))
    if (normalise === null) throw new MontantInvalideError(champ)
    sortie[champ] = normalise
  }
  return sortie
}

/**
 * POST d'une opération financière, avec clé d'idempotence.
 *
 * @param {string} chemin
 * @param {object} corps
 * @param {object} [options]
 * @param {string[]} [options.champsMontant]  Champs à normaliser en EUR.
 * @param {string} [options.cle]              Clé réutilisée lors d'un réessai.
 */
export function envoyerOperation(chemin, corps, { champsMontant = ['montant'], cle } = {}) {
  const corpsNormalise = normaliserMontants(corps, champsMontant)
  return api.post(chemin, corpsNormalise, {
    headers: { 'Idempotency-Key': cle || nouvelleCleIdempotence() },
  })
}
