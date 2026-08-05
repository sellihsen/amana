<!--
SYNC IMPACT REPORT
Version change: none (unfilled template) → 1.0.0
Bump rationale: MAJOR — initial ratification. No prior governance existed; all
principles are newly defined, so this is the baseline release rather than an
amendment.

Modified principles:
  [PRINCIPLE_1_NAME] → I. Intégrité Financière (NON-NEGOTIABLE)
  [PRINCIPLE_2_NAME] → II. Traçabilité Totale (NON-NEGOTIABLE)
  [PRINCIPLE_3_NAME] → III. Refus par Défaut (Deny by Default)
  [PRINCIPLE_4_NAME] → IV. Vérifié Avant Fusion
  [PRINCIPLE_5_NAME] → V. Une Seule Façon de Faire

Added sections:
  Contraintes Techniques & Socle de Sécurité (was [SECTION_2_NAME])
  Workflow de Développement (was [SECTION_3_NAME])
  Governance rules (was [GOVERNANCE_RULES])

Removed sections: none

Deferred TODOs: none. RATIFICATION_DATE is set to the date of this adoption
(2026-08-04) rather than the repository's first commit (2026-06-18), because the
project had no governance document before today.

Known state at ratification: the codebase does NOT currently satisfy several
MUST rules below (notably transactional writes, audit coverage, deny-by-default
authorization, error-detail suppression, and automated tests). These are
acknowledged debts, not grandfathered exemptions. Run /speckit.specify then
/speckit.plan → /speckit.tasks → /speckit.implement to close them.
-->

# Mosquée App Constitution

This project manages real funds held in trust for a religious community: dons,
zakat, cotisations, salaires, écolages, and aide sociale. The cost of a defect
here is not a broken feature — it is an unexplainable figure in front of the
people who donated the money. Every rule below follows from that.

## Core Principles

### I. Intégrité Financière (NON-NEGOTIABLE)

Money is never approximated and never half-written.

- Monetary columns MUST be PostgreSQL `NUMERIC` with an explicit scale and a
  `CHECK` constraint expressing their valid range. `FLOAT`, `REAL`,
  `DOUBLE PRECISION` and `MONEY` are forbidden for any amount.
- Summation, subtraction and comparison of amounts MUST be performed in SQL.
  Application code MUST NOT reduce, total or compare amounts after `parseFloat`;
  it may format them for display only.
- Any operation that writes money, or whose correctness spans more than one
  statement, MUST execute inside a single transaction on a single connection.
  Sequential independent `pool.query` calls are not an acceptable substitute.
- Read-modify-write of a quantity or balance MUST be expressed as in-database
  arithmetic (`SET x = x + $1`), never as a `SELECT` followed by an `UPDATE`.
- A write that partially succeeds MUST roll back and surface a failure. Silent
  clamping or truncation of an out-of-range amount is forbidden; reject instead.

**Rationale**: the balance sheet is the product. Floating-point drift and
partially-applied writes are indistinguishable from theft to an auditor.

### II. Traçabilité Totale (NON-NEGOTIABLE)

Every figure MUST be attributable to a person and a moment.

- Every state-changing request MUST record an audit entry containing: actor
  identity, action, timestamp, affected entity type and id, the values that
  changed, and client IP.
- Authentication and account lifecycle events — login success, login failure,
  account creation, role change, deletion — MUST be audited.
- The audit entry MUST commit in the same transaction as the change it
  describes. An operation whose audit record cannot be written MUST fail.
  Best-effort, fire-and-forget auditing does not satisfy this principle.
- Audit records are append-only. No code path may `UPDATE` or `DELETE` them.
- Action identifiers MUST come from a single shared enumeration, not from
  free-text literals written at each call site.

**Rationale**: "who changed this number?" must always have an answer. An audit
trail with gaps is worse than none, because it is trusted.

### III. Refus par Défaut (Deny by Default)

Access is denied unless something explicitly grants it.

- Every route MUST require authentication. Public routes MUST be an explicit,
  enumerated whitelist, justified in the plan that introduces them.
- Authorization MUST be enforced server-side on every mutating route. A
  read-only role MUST NOT be able to create, modify or delete any record.
  Frontend guards are presentation only and MUST NOT be the sole control.
- Client-supplied input MUST NOT determine privilege. Roles are assigned only
  through admin-guarded paths that map input to a hardcoded allowlist.
- All SQL MUST be parameterized. Any identifier interpolated into a statement
  MUST be resolved from a hardcoded whitelist; request data MUST NOT reach a
  column, table or operator position, including in dead code.
- API responses MUST NOT expose internal detail — database messages, constraint
  names, column names, or stack traces. Errors are logged server-side with a
  correlation id and returned as a generic message plus that id.
- Secrets MUST NOT be committed, including as empty placeholders in
  configuration that is loaded before `.env`. Required configuration MUST be
  validated at startup; a missing or empty secret MUST abort boot rather than
  fall back to a default.
- Credentials MUST NOT be created by seed scripts for any environment that is
  reachable outside a developer's machine.

**Rationale**: this application holds a community's donation ledger and its
members' personal data. Every control that depends on someone remembering to add
it will eventually be forgotten.

### IV. Vérifié Avant Fusion

Nothing that touches money or access merges unverified.

- Changes to money paths (dons, cotisations, dépenses, salaires, écolages,
  distributions sociales, bilans) and to authentication or authorization paths
  MUST be covered by automated tests. Such a change MUST NOT merge without a
  test that fails before it and passes after it.
- Every reported defect MUST gain a regression test that reproduces it before
  the fix is accepted.
- Other areas SHOULD be covered by automated tests; coverage is expected to grow
  monotonically and MUST NOT regress.
- Manual verification through Swagger UI or the browser is evidence, not a test,
  and MUST NOT be recorded as satisfying this principle.

**Rationale**: this is a single-maintainer project with no CI safety net. Tests
are the only mechanism that will still be enforcing the other four principles in
six months.

### V. Une Seule Façon de Faire

One problem, one solution, in one place.

- A rule, format or guard that applies in more than one place MUST live in
  exactly one module. Money formatting, currency and locale, authorization
  checks, error shaping, and schema definitions MUST NOT be duplicated.
- When an existing pattern solves a problem, new code MUST use it rather than
  introduce a parallel one. Introducing a second pattern requires migrating the
  first, or rejecting the second.
- Additional architectural layers MUST be justified in the plan. Absent
  justification, the existing route → database structure stands.
- Domain vocabulary is French and MUST be applied consistently across
  identifiers, columns, routes and UI. Infrastructural terms (`id`, `email`,
  `token`, `config`) remain English. Accent and casing conventions for a given
  concept MUST NOT differ between two tables.
- Dead code, unused dependencies, and configuration that is read by nothing MUST
  be removed rather than left as documentation of intent.

**Rationale**: divergent copies of the same logic do not stay identical. In a
financial application, two versions of "format an amount" is two versions of the
truth.

## Contraintes Techniques & Socle de Sécurité

**Stack** — Node.js ≥ 18 with Express and `pg` on the backend; React 18, Vite,
Tailwind and Zustand on the frontend; PostgreSQL ≥ 14 for storage. Deployment is
a single PM2 process serving the built SPA. Substituting any of these requires an
amendment, not a plan decision.

**Schema authority** — `backend/migrations/` is the single source of truth for
the database schema. No other file, including seeds, may create or alter schema
objects. Migrations MUST be forward-only, idempotent, applied inside a
transaction, and recorded in a tracking table so that an applied migration is
never re-executed. A migration MUST NOT overwrite data an administrator can edit
through the application.

**Configuration** — all configuration is read from the environment. Every
required variable MUST be listed in `backend/.env.example` and validated at
startup. Configuration files committed to the repository MUST NOT contain
credential keys, empty or otherwise.

**Security baseline** — the following are required and MUST be in place before
the application is exposed beyond localhost: security headers, rate limiting on
authentication endpoints, a request body size limit, declared JWT algorithm
pinning, and a token storage strategy that survives an XSS incident. Password
policy MUST be enforced server-side; browser-side constraints are hints.

**Data protection** — member, employee, student and needy-family records are
personal data. They MUST NOT leave the deployment, MUST NOT be sent to any third
party service, and MUST NOT appear in logs or error payloads.

**API surface** — the API is documented with OpenAPI. Documentation is derived
from the code and MUST be updated in the same change as the route it describes. A
documented guarantee that the code does not implement is a defect of the same
severity as the missing implementation.

## Workflow de Développement

**Spec-driven** — feature work follows the Spec Kit flow: `/speckit.specify` →
`/speckit.plan` → `/speckit.tasks` → `/speckit.implement`, with
`/speckit.converge` closing the gap afterwards. Code MUST NOT be written ahead of
the spec that calls for it.

**Constitution gate** — every plan MUST state how it satisfies Principles I
through V, or record an explicit, justified exception. A plan that silently
violates a MUST is rejected.

**Review gate** — before a change is accepted:

1. Money paths and access-control paths carry passing automated tests.
2. Multi-statement writes are transactional.
3. New mutating routes are authenticated, authorized, and audited.
4. No new duplication of an existing shared rule.
5. No secret, credential, or internal error detail added to the repository or to
   an API response.

**Debt** — the acknowledged violations listed in this file's sync report are
tracked as work, not as precedent. New code MUST NOT cite existing violations as
justification for repeating them.

## Governance

This constitution supersedes all other practices, conventions and habits in this
repository. Where a document, comment, or existing implementation conflicts with
it, this document wins and the conflict is a defect to be fixed.

**Amendment procedure** — amendments MUST be made by editing this file through
`/speckit.constitution`, MUST state their rationale, and MUST include a sync
impact report recording what changed. An amendment that relaxes or removes a MUST
rule MUST additionally describe what replaces the protection being removed.

**Versioning policy** — this document is versioned semantically:

- **MAJOR**: a principle is removed or redefined in a backward-incompatible way.
- **MINOR**: a principle or section is added, or existing guidance is materially
  expanded.
- **PATCH**: clarification, wording, or typographical correction that does not
  change what is required.

**Compliance review** — compliance is verified at the plan gate and at the review
gate described above. A violation of a NON-NEGOTIABLE principle (I or II) is a
release blocker. Complexity, additional layers, and additional dependencies MUST
be justified against Principle V; unjustified complexity is removed rather than
documented.

**Runtime guidance** — `README.md` documents how to install, migrate, seed and
run the project. It is operational documentation and carries no governance
authority; when it disagrees with this constitution, the README is wrong.

**Version**: 1.0.0 | **Ratified**: 2026-08-04 | **Last Amended**: 2026-08-04
