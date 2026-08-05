/**
 * Identifiant de corrélation.
 *
 * Constitution III : « Errors are logged server-side with a correlation id and
 * returned as a generic message plus that id. » Cet identifiant relie une
 * réponse opaque, la ligne de log serveur et l'entrée d'audit.
 */

const crypto = require('crypto');

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reprend l'identifiant fourni par le client s'il s'agit d'un UUID, sinon en
 * génère un. Une valeur client arbitraire n'est jamais réémise : elle se
 * retrouverait dans un en-tête de réponse et dans les journaux.
 */
function requestId(req, res, next) {
  const fourni = req.get('X-Request-Id');
  req.id = fourni && UUID_PATTERN.test(fourni) ? fourni : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

module.exports = { requestId, UUID_PATTERN };
