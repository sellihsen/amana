# Feature Specification: Secure Access and Complete Audit

**Feature Branch**: `001-secure-access-audit`

**Created**: 2026-08-04

**Status**: Draft

**Input**: User description: "Secure authentication and authorization, close anonymous admin registration, enforce role permissions, and add complete audit logging"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Block Unauthorized Account and Data Changes (Priority: P1)

As the mosque administrator, I need every account creation and protected data
change to require an authenticated user with the appropriate role so that an
outsider or read-only user cannot gain privileges or alter community records.

**Why this priority**: Anonymous administrator registration and unauthorized
financial changes put all application data and community funds at immediate risk.

**Independent Test**: Attempt account creation without signing in, then sign in
as each role and attempt representative read, operational write, and
administrative actions. Access is granted only where the role matrix permits it.

**Acceptance Scenarios**:

1. **Given** no authenticated session, **When** a person attempts to create an
   account or access any protected record, **Then** access is denied and no data
   changes.
2. **Given** an authenticated `lecteur`, **When** the user views operational
   records, **Then** the records are available according to the existing viewing
   experience.
3. **Given** an authenticated `lecteur`, **When** the user attempts to create,
   update, or delete any operational or administrative record, **Then** access is
   denied and no data changes.
4. **Given** an authenticated `tresorier`, **When** the user creates, updates, or
   deletes an operational record, **Then** the permitted change succeeds.
5. **Given** an authenticated `tresorier`, **When** the user attempts to manage
   users, roles, application configuration, caisses, or project settings,
   **Then** access is denied and no data changes.
6. **Given** an authenticated `admin`, **When** the user performs an operational
   or administrative action, **Then** the action is permitted subject to normal
   business validation.

---

### User Story 2 - Authenticate Safely and Consistently (Priority: P1)

As a legitimate user, I need sign-in and session failures to behave consistently
and safely so that I can access the application without exposing account or
system details to an attacker.

**Why this priority**: Authentication is the entry point to every protected
capability and must resist account discovery, repeated guessing, and stale access.

**Independent Test**: Exercise valid sign-in, invalid credentials, repeated
failed attempts, expired or invalid sessions, and a role change during an active
session; verify safe messages and prompt enforcement of the current account state.

**Acceptance Scenarios**:

1. **Given** an active account with valid credentials, **When** the user signs
   in, **Then** the user receives a time-limited authenticated session containing
   only the privileges of the account's current role.
2. **Given** an unknown email or incorrect password, **When** sign-in is
   attempted, **Then** the same generic failure message is shown in either case.
3. **Given** repeated failed sign-in attempts from the same source, **When** the
   allowed short-term attempt threshold is exceeded, **Then** further attempts
   are temporarily rejected without revealing whether the account exists.
4. **Given** an invalid, expired, or revoked session, **When** a protected action
   is requested, **Then** authentication is required again and no action occurs.
5. **Given** an administrator changes or removes a user's role or account,
   **When** that user next requests a protected action, **Then** the current
   account state is enforced rather than privileges cached at sign-in.
6. **Given** an authenticated user lacks permission for an action, **When** the
   action is denied, **Then** the user remains signed in and receives an access
   denied message rather than being treated as unauthenticated.

---

### User Story 3 - Trace Every Sensitive Event (Priority: P1)

As an administrator reviewing community operations, I need a complete,
tamper-resistant history of security events and data changes so that every
important action can be attributed and investigated.

**Why this priority**: Financial and personal records are trustworthy only when
every mutation has a durable, attributable audit trail.

**Independent Test**: Perform one successful mutation in every application
domain, one denied mutation, successful and failed sign-ins, and user lifecycle
changes; then verify the audit history contains complete records and cannot be
altered through the application.

**Acceptance Scenarios**:

1. **Given** an authorized user changes any operational or administrative
   record, **When** the change succeeds, **Then** exactly one audit record captures
   the actor, action, time, affected entity, changed values, and client source.
2. **Given** a successful or failed sign-in, account creation, role change,
   account removal, or access denial, **When** the event occurs, **Then** an audit
   record captures the event without recording credentials or session secrets.
3. **Given** an audit record cannot be stored, **When** a protected data change is
   attempted, **Then** the data change fails and the prior state is preserved.
4. **Given** an administrator views audit history, **When** filters for actor,
   action, date range, or affected domain are applied, **Then** all matching
   records can be found without changing them.
5. **Given** any application user, including an administrator, **When** the user
   attempts to alter or remove an audit record, **Then** the operation is not
   available and the record remains unchanged.

---

### User Story 4 - Manage Accounts Without Creating Security Gaps (Priority: P2)

As an administrator, I need one protected account-management workflow so that I
can create users, assign valid roles, update accounts, and remove access without
leaving an anonymous or parallel registration path.

**Why this priority**: Account administration remains necessary after public
registration is closed, and role assignment must be controlled consistently.

**Independent Test**: As an administrator, create one account for each valid
role, update a role, remove an account, and submit unsupported roles and weak
passwords; verify only valid operations succeed and each success is audited.

**Acceptance Scenarios**:

1. **Given** an authenticated administrator, **When** a user is created with a
   unique email, valid role, and acceptable password, **Then** the account is
   available for sign-in and its creation is audited.
2. **Given** any non-administrator, **When** account creation or role assignment
   is attempted, **Then** access is denied and no account changes.
3. **Given** an unsupported role value, **When** an administrator submits the
   account change, **Then** it is rejected rather than converted to another role.
4. **Given** a password that does not meet the published policy, **When** account
   creation or password replacement is attempted, **Then** the request is
   rejected with actionable guidance.

### Edge Cases

- The last active administrator cannot be deleted, disabled, or demoted, because
  doing so would leave the application without an account-management authority.
- An administrator cannot delete their own currently authenticated account.
- Concurrent role changes and protected requests use the account state valid at
  authorization time; a demoted user cannot complete a newly started privileged
  action.
- A duplicate email, malformed email, missing field, unsupported role, or weak
  password is rejected without exposing internal storage details.
- A malformed authorization value, expired session, deleted account, or session
  with a role not recognized by the system is denied safely.
- Audit details redact passwords, credential hashes, session values, and other
  secrets even when those fields appear in rejected input.
- Client source information remains meaningful behind the deployment proxy and
  cannot be forged by an untrusted caller.
- Audit history remains usable when filters return no records, date boundaries
  are equal, or the record set spans many pages.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST treat all application capabilities as protected
  except an explicit public allowlist limited to sign-in, service health, and
  static application resources.
- **FR-002**: The system MUST remove anonymous account registration; account
  creation MUST be available only to an authenticated `admin` through the
  protected account-management capability.
- **FR-003**: The system MUST recognize exactly three application roles:
  `admin`, `tresorier`, and `lecteur`; any other role value MUST be rejected.
- **FR-004**: The system MUST enforce role permissions on the server for every
  request, independent of navigation visibility or other client-side controls.
- **FR-005**: A `lecteur` MUST be permitted to read operational information and
  MUST be denied every create, update, delete, account-management, configuration,
  caisse-management, and project-settings action.
- **FR-006**: A `tresorier` MUST be permitted to read and manage operational
  records for members, donations, contributions, expenses, personnel and salary
  payments, students and school fees, stock, social aid, and reports.
- **FR-007**: A `tresorier` MUST be denied user and role management, application
  configuration, caisse management, project settings, and audit administration.
- **FR-008**: An `admin` MUST be permitted to perform all operational and
  administrative actions, subject to business validation and last-administrator
  safeguards.
- **FR-009**: Authorization denials MUST preserve the authenticated session and
  MUST be distinguishable to the user from missing, invalid, expired, or revoked
  authentication.
- **FR-010**: Protected requests MUST enforce the user's current account
  existence and role so that deletion, disabling, or demotion takes effect no
  later than the user's next request.
- **FR-011**: Sign-in MUST return the same user-facing failure response for an
  unknown email and an incorrect password.
- **FR-012**: The system MUST temporarily limit repeated failed sign-in attempts
  from the same source and MUST NOT reveal whether a named account exists.
- **FR-013**: Password requirements MUST be enforced at the trusted system
  boundary and communicated to administrators before account creation or
  password replacement.
- **FR-014**: Every successful state change across all application domains MUST
  create exactly one durable audit record as part of the same all-or-nothing
  operation as the business change.
- **FR-015**: Audit coverage MUST include successful and failed sign-ins, account
  creation and deletion, password replacement, role changes, authorization
  denials, and every operational or administrative create, update, and delete.
- **FR-016**: Each audit record MUST contain a stable event type, result, actor
  identity when known, event time, affected domain and entity identifier when
  applicable, changed values when applicable, and trustworthy client source.
- **FR-017**: Audit records MUST NOT contain plaintext passwords, password
  hashes, session values, authorization values, or other secrets.
- **FR-018**: Audit records MUST be append-only and MUST NOT be editable or
  removable through any application role or capability.
- **FR-019**: If an audit record required for a protected state change cannot be
  stored, the state change MUST fail without leaving partial data.
- **FR-020**: Administrators MUST be able to search and filter audit history by
  actor, stable event type, result, date range, and affected domain, with
  paginated results ordered newest first.
- **FR-021**: User-facing failures MUST provide a safe, actionable message and
  MUST NOT disclose internal data structures, storage errors, constraint names,
  or diagnostic traces.
- **FR-022**: The system MUST prevent deletion, disabling, or demotion of the
  last active administrator and MUST prevent an administrator from deleting
  their own active account.
- **FR-023**: All permission decisions and all audit events MUST use one
  consistent role and event vocabulary across the system.
- **FR-024**: Security behavior covered by this feature MUST have automated
  verification for anonymous access, each role boundary, session invalidation,
  audit completeness, secret redaction, and rollback when auditing fails.

### Key Entities

- **User Account**: A person permitted to sign in; identified by a unique email
  and carrying exactly one current role, credential state, and active status.
- **Role**: One of `admin`, `tresorier`, or `lecteur`; defines the complete set of
  allowed reads, operational mutations, and administrative actions.
- **Authenticated Session**: Time-limited proof of a successful sign-in, linked
  to a current user account and invalid when the account no longer authorizes it.
- **Audit Event**: Immutable evidence of a security event or state change,
  including event type, result, actor, time, target, changed values, and source,
  with secret-bearing fields excluded.
- **Protected Action**: A read, operational mutation, or administrative mutation
  evaluated against the user's current role before execution.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a complete permission test matrix, 100% of anonymous and
  out-of-role actions are denied without changing protected data.
- **SC-002**: Anonymous callers have zero available paths to create an account or
  assign themselves a role.
- **SC-003**: 100% of successful state changes and required security events
  produce one complete audit record, with zero plaintext credentials or session
  secrets present in audit history.
- **SC-004**: In every simulated audit-storage failure, the associated protected
  state change leaves business data unchanged.
- **SC-005**: A deleted, disabled, or demoted account loses the removed privilege
  by its next protected request, without waiting for the prior session lifetime.
- **SC-006**: Valid users can sign in and reach their permitted workspace in
  under 10 seconds under normal local operating conditions.
- **SC-007**: Administrators can locate a known audit event by actor, type, date,
  result, or domain in under 30 seconds using the audit interface.
- **SC-008**: 100% of user-visible authentication, authorization, and validation
  failures omit internal storage and diagnostic details while still indicating
  the corrective action available to the user.
- **SC-009**: Automated verification covers every role/action combination and
  all acceptance scenarios in this specification before the feature is accepted.

## Assumptions

- Existing email-and-password sign-in remains the authentication method; adding
  self-service registration, password recovery, or multi-factor authentication
  is outside this feature.
- `admin`, `tresorier`, and `lecteur` are the complete role model. Existing
  accounts with an unsupported role require administrative correction before
  they can perform protected actions.
- Operational records comprise members, donations, member contributions,
  expenses, personnel and salary payments, students and school fees, stock,
  social aid, dashboard data, and financial reports.
- Administrative capabilities comprise users and roles, configurable lists,
  caisses, project settings, and audit review.
- Audit retention and archival policy are outside this feature; existing audit
  records are retained and the feature governs all newly generated events.
- Public interactive documentation is not required for end-user operation and
  may be restricted by deployment policy without changing this feature's goals.
