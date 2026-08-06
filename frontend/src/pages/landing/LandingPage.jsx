import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Plus, ArrowRight, MailCheck } from 'lucide-react'

import './landing.css'

/**
 * Page publique d'Amana.
 *
 * Parti pris : la page est un registre. Le visiteur type est un trésorier
 * bénévole d'association cultuelle, qui devra un jour rendre compte de chaque
 * euro devant son assemblée générale. Les intitulés de section reprennent donc
 * les comptes du plan comptable associatif (754, 756, 641, 12) : ce sont les
 * numéros qu'il lit déjà toutes les semaines, pas une numérotation décorative.
 */

/* ── Données de la page ──────────────────────────────────────────── */

const ENTREES = [
  { code: '754', libelle: 'Dons du vendredi', montant: '18 640,00' },
  { code: '754', libelle: 'Collecte de Ramadan', montant: '42 310,00' },
  { code: '756', libelle: 'Cotisations des adhérents', montant: '9 120,00' },
  { code: '706', libelle: 'Madrasa — inscriptions', montant: '6 450,00' },
]

const SORTIES = [
  { code: '641', libelle: 'Imam et professeurs', montant: '31 200,00' },
  { code: '2313', libelle: 'Chantier — lot menuiserie', montant: '24 800,00' },
  { code: '657', libelle: 'Aides aux familles', montant: '7 350,00' },
  { code: '606', libelle: 'Eau, gaz, entretien', montant: '5 940,00' },
]

const FAITS = [
  { valeur: '10', libelle: 'registres tenus au même endroit, du don du vendredi au bilan de l’exercice.' },
  { valeur: '11580', libelle: 'le CERFA que vos donateurs attendent, édité en un clic.' },
  { valeur: '100 %', libelle: 'des écritures rattachées à une pièce justificative datée.' },
  { valeur: 'France', libelle: 'hébergement des données, conforme au RGPD.' },
]

const COMPTES = [
  {
    code: '756 · Adhésions',
    titre: 'Savoir qui est à jour, sans ouvrir un tableur',
    texte:
      'Le fichier des adhérents, les cotisations de l’année et les relances vivent au même endroit. Chaque fiche indique la dernière somme reçue et la date.',
    detail: ['Relances par courriel ou SMS', 'Cartes d’adhérent à imprimer', 'Historique conservé année par année'],
  },
  {
    code: '641 · Vie de la mosquée',
    titre: 'L’équipe, l’école et le stock',
    texte:
      'Salaires de l’imam et des professeurs, inscriptions des élèves de madrasa, réserves de dattes et de tapis, aides versées aux familles.',
    detail: ['Bulletins et charges sociales', 'Classes, présences, paiements', 'Alertes de stock bas'],
  },
  {
    code: '12 · Résultat',
    titre: 'Une assemblée générale qui tient en une chemise',
    texte:
      'Compte de résultat et bilan se composent tout seuls à partir des écritures de l’année. Vous relisez, vous imprimez, vous présentez.',
    detail: ['Export PDF et Excel', 'Comparaison avec l’exercice passé', 'Journal d’audit de chaque modification'],
  },
]

const PLANS = [
  {
    rang: 'Formule 1',
    nom: 'Salle de prière',
    pour: 'Jusqu’à 100 adhérents, un seul lieu.',
    montant: '0 €',
    cadence: 'pour toujours',
    inclus: [
      'Dons, cotisations et dépenses',
      'Reçus fiscaux CERFA illimités',
      'Deux comptes du bureau',
      'Export Excel à tout moment',
    ],
    action: 'Créer votre registre',
    note: 'Sans carte bancaire.',
    lien: '/login',
  },
  {
    rang: 'Formule 2 · la plus prise',
    nom: 'Mosquée',
    pour: 'Adhérents illimités, salariés et madrasa.',
    montant: '39 €',
    cadence: 'par mois, sans engagement',
    inclus: [
      'Tout ce que contient la formule 1',
      'Paie de l’imam et des professeurs',
      'Madrasa, stock et aides sociales',
      'Bilan et compte de résultat',
      'Comptes du bureau illimités, par rôle',
    ],
    action: 'Essayer 60 jours',
    note: 'Puis 39 €/mois. Résiliable en une page.',
    lien: '/login',
    retenu: true,
  },
  {
    rang: 'Formule 3',
    nom: 'Fédération',
    pour: 'Plusieurs lieux de culte sous une même association.',
    montant: 'Sur devis',
    surDevis: true,
    cadence: 'selon le nombre de lieux',
    inclus: [
      'Tout ce que contient la formule 2',
      'Registres séparés, vue consolidée',
      'Reprise de votre historique par nos soins',
      'Formation du bureau sur place',
      'Interlocuteur dédié',
    ],
    action: 'Demander un devis',
    note: 'Réponse sous deux jours ouvrés.',
    lien: '/login',
  },
]

const QUESTIONS = [
  {
    q: 'Où sont hébergées les données de notre association ?',
    r: 'Chez un hébergeur français, sur des serveurs situés en France, chiffrées au repos et sauvegardées chaque nuit. Elles ne sont ni revendues ni utilisées pour de la publicité. Vous restez propriétaire du registre et pouvez le récupérer en entier, au format Excel, quand vous le décidez.',
  },
  {
    q: 'Les reçus fiscaux sont-ils conformes ?',
    r: 'Amana édite le CERFA n° 11580*03, celui que réclame l’administration pour la réduction d’impôt. Vous renseignez une fois les statuts et le numéro RNA de l’association, puis chaque don donne son reçu numéroté. Le récapitulatif annuel part automatiquement aux donateurs en janvier.',
  },
  {
    q: 'Nous tenons tout sur un tableur depuis huit ans. On repart de zéro ?',
    r: 'Non. Envoyez votre fichier, quel que soit son désordre : nous le reprenons ligne par ligne et vous le rendons chargé dans votre registre, avec les soldes d’ouverture. C’est compris dans la formule Fédération, et facturé une fois 90 € sur les autres.',
  },
  {
    q: 'Qui, dans le bureau, voit quoi ?',
    r: 'Chaque compte reçoit un rôle : lecture, saisie, trésorier ou administrateur. Un professeur de madrasa inscrit ses élèves sans voir les salaires ; un membre du conseil consulte les bilans sans pouvoir les modifier. Toute modification est inscrite dans un journal d’audit, avec l’auteur et l’heure.',
  },
  {
    q: 'Et pendant le Ramadan, quand tout arrive en même temps ?',
    r: 'C’est le mois pour lequel la saisie a été dessinée. La collecte s’enregistre en une opération depuis un téléphone, dans la salle, sans connexion parfaite : les entrées se synchronisent dès que le réseau revient.',
  },
  {
    q: 'Si nous arrêtons, que devient le registre ?',
    r: 'Vous exportez l’intégralité des écritures, des adhérents et des reçus en Excel et en PDF, puis vous demandez la suppression du compte. Les données sont effacées sous trente jours. Aucune période d’engagement, aucun frais de sortie.',
  },
]

const SOMMAIRE = [
  { no: 'N° 17', titre: 'Clôturer l’exercice sans y passer tout le mois de janvier' },
  { no: 'N° 16', titre: 'Reçus fiscaux : les cinq erreurs qui reviennent chaque année' },
  { no: 'N° 15', titre: 'Ce que l’administration attend d’une association cultuelle' },
]

/* ── Fragments ───────────────────────────────────────────────────── */

function Ligne({ code, libelle, montant, delai }) {
  return (
    <li className="lp-ligne lp-anim-ligne" style={{ animationDelay: `${delai}ms` }}>
      <span className="lp-ligne__code">{code}</span>
      <span className="lp-ligne__libelle">{libelle}</span>
      <span className="lp-ligne__montant">{montant}</span>
    </li>
  )
}

function Colonne({ sens, titre, lignes, total, decalage }) {
  return (
    <div className={`lp-colonne lp-colonne--${sens}`}>
      <div className="lp-colonne__titre">
        <span>{titre}</span>
        <span>Euros</span>
      </div>
      <ul>
        {lignes.map((l, i) => (
          <Ligne key={l.libelle} {...l} delai={decalage + i * 110} />
        ))}
        <li
          className="lp-ligne lp-ligne--total lp-anim-ligne"
          style={{ animationDelay: `${decalage + lignes.length * 110}ms` }}
        >
          <span className="lp-ligne__code">—</span>
          <span className="lp-ligne__libelle">Total {titre.toLowerCase()}</span>
          <span className="lp-ligne__montant">{total}</span>
        </li>
      </ul>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const [courriel, setCourriel] = useState('')
  const [inscrit, setInscrit] = useState(false)

  const inscrire = (e) => {
    e.preventDefault()
    // La lettre n'a pas encore de service d'envoi : on confirme localement.
    setInscrit(true)
    setCourriel('')
  }

  return (
    <div className="lp">
      {/* ── Bande d'encre : navigation, héros, registre ───────────── */}
      <div className="lp-ink">
        <header className="lp-nav">
          <div className="lp-wrap lp-nav__inner">
            <a href="#haut" className="lp-marque">
              <span className="lp-marque__nom">Amana</span>
              <span className="lp-marque__ar" lang="ar">
                أمانة
              </span>
            </a>

            <nav className="lp-nav__liens" aria-label="Sections de la page">
              <a href="#collecte">La collecte</a>
              <a href="#registres">Les registres</a>
              <a href="#tarifs">Tarifs</a>
              <a href="#questions">Questions</a>
            </nav>

            <div className="lp-nav__actions">
              <Link to="/login" className="lp-nav__connexion">
                Se connecter
              </Link>
              <Link to="/login" className="lp-btn lp-btn--plein">
                Créer votre registre
              </Link>
            </div>
          </div>
        </header>

        <main id="haut">
          <section className="lp-wrap lp-hero">
            <div className="lp-hero__haut">
              <div>
                <p className="lp-arabe lp-hero__ar" lang="ar">
                  أمانة
                </p>
                <h1 className="lp-display lp-h1">
                  Ce que la communauté vous confie, vous devez pouvoir le{' '}
                  <em>montrer</em>.
                </h1>
                <p className="lp-lead">
                  Amana tient le registre de votre mosquée : dons, cotisations,
                  dépenses, salaires, madrasa. Chaque euro a une ligne, une pièce
                  et une date.
                </p>

                <div className="lp-hero__actions">
                  <Link to="/login" className="lp-btn lp-btn--plein">
                    Créer votre registre
                  </Link>
                  <a href="#collecte" className="lp-btn lp-btn--fantome">
                    Voir comment ça se tient
                  </a>
                </div>

                <p className="lp-mono lp-hero__mention">
                  GRATUIT JUSQU’À 100 ADHÉRENTS · SANS CARTE BANCAIRE · DONNÉES EN
                  FRANCE
                </p>
              </div>

              <figure>
                <blockquote className="lp-lead">
                  « Les dons du vendredi finissaient sur trois carnets et deux
                  téléphones. Cette année, l’assemblée générale a duré quarante
                  minutes. »
                </blockquote>
                <figcaption className="lp-mono lp-hero__mention">
                  KARIM B., TRÉSORIER — ACMCM · MOSQUÉE BILAL
                </figcaption>
              </figure>
            </div>

            {/* Élément signature : le journal de trésorerie qui tombe juste. */}
            <section className="lp-registre" aria-label="Extrait d’un journal de trésorerie">
              <div className="lp-registre__entete">
                <span>Journal de trésorerie · Exercice 2025</span>
                <span>Mosquée Bilal · 1 247 écritures</span>
              </div>

              <div className="lp-registre__corps">
                <Colonne
                  sens="entrees"
                  titre="Entrées"
                  lignes={ENTREES}
                  total="76 520,00"
                  decalage={250}
                />
                <Colonne
                  sens="sorties"
                  titre="Sorties"
                  lignes={SORTIES}
                  total="69 290,00"
                  decalage={400}
                />
              </div>

              <dl className="lp-registre__pied lp-anim-pied">
                <div>
                  <dt>Solde en caisse au 31/12</dt>
                  <dd className="lp-chiffre">7 230,00 €</dd>
                </div>
                <div>
                  <dt>Rapprochement bancaire</dt>
                  <dd className="lp-ecart">
                    0,00 € <small>écart</small>
                  </dd>
                </div>
              </dl>
            </section>
          </section>
        </main>
      </div>

      {/* ── Papier ─────────────────────────────────────────────────── */}

      <section className="lp-wrap lp-section lp-section--serre" aria-label="En bref">
        <ul className="lp-faits">
          {FAITS.map((f) => (
            <li key={f.valeur} className="lp-fait">
              <p className="lp-fait__valeur lp-chiffre">{f.valeur}</p>
              <p className="lp-fait__libelle">{f.libelle}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="collecte" className="lp-wrap lp-section">
        <div className="lp-vedette">
          <div>
            <p className="lp-eyebrow">
              <span className="lp-eyebrow--code">754</span> La collecte
            </p>
            <h2 className="lp-display lp-h2">
              Le vendredi l’argent entre. Le soir, il est déjà écrit.
            </h2>
            <p className="lp-lead">
              Espèces de la prière, virements, chèques, collecte de Ramadan :
              l’entrée se saisit depuis un téléphone, dans la salle, et repart
              avec sa pièce justificative.
            </p>

            <ul className="lp-liste">
              {[
                'Saisir une collecte entière en une opération, par total ou donateur par donateur.',
                'Éditer le reçu fiscal CERFA n° 11580*03 et l’envoyer par courriel dans la foulée.',
                'Adresser à chaque donateur son récapitulatif annuel, en janvier, sans y penser.',
                'Enregistrer les dons anonymes sans fausser le total de l’exercice.',
              ].map((t) => (
                <li key={t}>
                  <Check size={17} strokeWidth={2.2} aria-hidden="true" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Second artefact, volontairement discret : le reçu. */}
          <figure className="lp-recu">
            <div className="lp-recu__entete">
              <span>Reçu au titre des dons</span>
              <span>CERFA 11580*03</span>
            </div>
            <dl>
              {[
                ['Reçu n°', '2025-0412'],
                ['Bénéficiaire', 'ACMCM · Mosquée Bilal'],
                ['N° RNA', 'W751 234 567'],
                ['Donateur', 'Mme A. Benali'],
                ['Date du versement', '14/03/2025'],
                ['Forme du don', 'Virement'],
              ].map(([dt, dd]) => (
                <div className="lp-recu__champ" key={dt}>
                  <dt>{dt}</dt>
                  <dd>{dd}</dd>
                </div>
              ))}
            </dl>
            <div className="lp-recu__somme">
              <span>Somme versée</span>
              <span>250,00 €</span>
            </div>
            <figcaption className="lp-recu__note">
              Ouvre droit à une réduction d’impôt de 66 % dans la limite de 20 %
              du revenu imposable. Édité et numéroté par Amana.
            </figcaption>
          </figure>
        </div>

        {/* Les autres comptes. */}
        <div id="registres" className="lp-comptes">
          {COMPTES.map((c) => (
            <article className="lp-compte" key={c.code}>
              <p className="lp-compte__code">{c.code}</p>
              <h3 className="lp-h3">{c.titre}</h3>
              <p>{c.texte}</p>
              <ul className="lp-compte__detail">
                {c.detail.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* ── Tarifs ─────────────────────────────────────────────────── */}

      <section id="tarifs" className="lp-wrap lp-section">
        <p className="lp-eyebrow">Tarifs</p>
        <h2 className="lp-display lp-h2 lp-titre-section">
          Le prix d’un sac de dattes par mois.
        </h2>

        <div className="lp-tarifs">
          {PLANS.map((p) => (
            <article
              className={`lp-plan${p.retenu ? ' lp-plan--retenu' : ''}`}
              key={p.nom}
            >
              <p className="lp-plan__rang">
                <span>{p.rang}</span>
              </p>
              <h3>{p.nom}</h3>
              <p className="lp-plan__pour">{p.pour}</p>

              <p className="lp-plan__prix">
                <span
                  className={`lp-plan__montant${
                    p.surDevis ? ' lp-plan__montant--mot' : ''
                  }`}
                >
                  {p.montant}
                </span>
                <span className="lp-plan__cadence">{p.cadence}</span>
              </p>

              <ul className="lp-plan__inclus">
                {p.inclus.map((i) => (
                  <li key={i}>
                    <Check size={16} strokeWidth={2.2} aria-hidden="true" />
                    <span>{i}</span>
                  </li>
                ))}
              </ul>

              <div className="lp-plan__pied">
                <Link
                  to={p.lien}
                  className={`lp-btn lp-btn--bloc ${
                    p.retenu ? 'lp-btn--plein' : 'lp-btn--contour'
                  }`}
                >
                  {p.action}
                </Link>
                <p className="lp-plan__note">{p.note}</p>
              </div>
            </article>
          ))}
        </div>

        <p className="lp-tarifs__apres">
          Les associations cultuelles déclarées paient au tarif associatif, déjà
          appliqué ci-dessus. Une mosquée en difficulté peut nous écrire : nous
          n’avons jamais fermé un registre pour une facture.
        </p>
      </section>

      {/* ── Questions ──────────────────────────────────────────────── */}

      <section id="questions" className="lp-wrap lp-section">
        <div className="lp-faq-bloc">
          <div className="lp-faq-bloc__titre">
            <p className="lp-eyebrow">Questions</p>
            <h2 className="lp-display lp-h2 lp-titre-section">
              Ce que les bureaux demandent avant de signer.
            </h2>
          </div>

          <div className="lp-faq">
            {QUESTIONS.map((item) => (
              <details className="lp-question" key={item.q}>
                <summary>
                  <span>{item.q}</span>
                  <Plus
                    size={18}
                    strokeWidth={2}
                    className="lp-question__signe"
                    aria-hidden="true"
                  />
                </summary>
                <p className="lp-question__reponse">{item.r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── La lettre ──────────────────────────────────────────────── */}

      <section className="lp-ink" aria-labelledby="lettre-titre">
        <div className="lp-wrap lp-section lp-lettre">
          <div>
            <p className="lp-eyebrow">La lettre du trésorier</p>
            <h2 id="lettre-titre" className="lp-display lp-h2">
              Un courriel par mois, écrit pour ceux qui tiennent les comptes.
            </h2>
            <p className="lp-lead">
              Obligations déclaratives, modèles à recopier, dates à ne pas
              manquer. Pas de nouveautés produit, pas de relance commerciale.
            </p>

            {inscrit ? (
              <p className="lp-form__confirme" role="status">
                <MailCheck size={18} strokeWidth={2} aria-hidden="true" />
                Inscrit. Le prochain numéro part le 1er du mois.
              </p>
            ) : (
              <form className="lp-form" onSubmit={inscrire} noValidate={false}>
                <div className="lp-form__champ">
                  <label htmlFor="lettre-courriel">Votre adresse</label>
                  <input
                    id="lettre-courriel"
                    name="courriel"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="tresorier@votre-mosquee.fr"
                    value={courriel}
                    onChange={(e) => setCourriel(e.target.value)}
                  />
                </div>
                <div className="lp-form__pied">
                  <button type="submit" className="lp-btn lp-btn--plein">
                    Recevoir la lettre
                    <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
              </form>
            )}

            <p className="lp-form__mention">
              Se désinscrire prend un clic, en bas de chaque numéro. Votre
              adresse ne sert qu’à cela.
            </p>
          </div>

          <div>
            <p className="lp-eyebrow">Numéros parus</p>
            <ul className="lp-sommaire lp-titre-section">
              {SOMMAIRE.map((s) => (
                <li key={s.no}>
                  <span className="lp-sommaire__no">{s.no}</span>
                  <span>{s.titre}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Pied de page ───────────────────────────────────────────── */}

      <footer className="lp-pied">
        <div className="lp-wrap">
          <div className="lp-pied__haut">
            <div>
              <p className="lp-marque">
                <span className="lp-marque__nom">Amana</span>
                <span className="lp-marque__ar" lang="ar">
                  أمانة
                </span>
              </p>
              <p className="lp-pied__accroche">
                La gestion administrative et financière des associations
                cultuelles.
              </p>
            </div>

            <div className="lp-pied__cols">
              <div>
                <p className="lp-pied__titre">Le produit</p>
                <ul>
                  <li><a href="#collecte">Dons et reçus fiscaux</a></li>
                  <li><a href="#registres">Adhérents et cotisations</a></li>
                  <li><a href="#registres">Madrasa et personnel</a></li>
                  <li><a href="#tarifs">Tarifs</a></li>
                </ul>
              </div>
              <div>
                <p className="lp-pied__titre">L’association</p>
                <ul>
                  <li><a href="#questions">Questions fréquentes</a></li>
                  <li><a href="#questions">Reprise de vos données</a></li>
                  <li><a href="#questions">Hébergement et RGPD</a></li>
                  <li><Link to="/login">Se connecter</Link></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="lp-pied__bas">
            <span>© {new Date().getFullYear()} AMANA · TOUS DROITS RÉSERVÉS</span>
            <span>MENTIONS LÉGALES · CONFIDENTIALITÉ · CONTACT</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
