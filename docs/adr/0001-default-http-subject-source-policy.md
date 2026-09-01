# ADR 0001: Default HTTP subject namespace and source policy

- Status: Accepted
- Date: 2026-09-01
- Task: `RBAC-M05`

## Context

The default HTTP subject resolver accepts three application-owned carriers:
`request.rbacSubject`, `request.user`, and the canonical/legacy API-key pair.
Before this decision it returned the first valid carrier in that order. A stale
or second authentication writer could therefore leave a different valid identity
on a lower-priority carrier without RBAC noticing it.

The published `request.user` mapping also accepts a non-empty `user.type`. Existing
consumers and tests use this to map service accounts without configuring a custom
resolver. Changing that mapping to a fixed `user` namespace in a patch would merge
existing service-account identities into the user namespace and would be a breaking
authorization-data migration.

## Decision

The default resolver reconciles every valid subject carrier before choosing one.
Identity is the exact tuple `(type, id, tenantId)`. When two valid carriers produce
different tuples, resolution fails closed. When all valid carriers agree, attributes
come from the existing precedence order:

1. `request.rbacSubject`
2. `request.user`
3. canonical `request.apiKey`, then deprecated `request.apiKeyContext`

A populated API-key carrier that is malformed, or a conflicting canonical/legacy
API-key pair, remains a fail-closed API-key source even when another carrier is
valid. For compatibility, malformed `request.rbacSubject` and `request.user`
records remain unusable candidates and the resolver may fall through to another
valid source.

The default user mapping continues to use a non-empty string `request.user.type`,
falling back to `user` only when it is absent or invalid. This is an explicit
compatibility contract, not a guarantee that the default user carrier always uses
the `user` namespace. There is no deprecation scheduled for the 0.x line. An
application that requires a fixed namespace must configure `subjectResolver` and
return the desired type itself. A configured resolver remains authoritative and is
not reconciled with the default HTTP carriers.

Canonical API keys always map to `api_key`. Subject type is part of storage and
authorization identity, so equal IDs in `user`, `service_account`, and `api_key`
namespaces never share role bindings.

## Compatibility and rollout

Preserving `request.user.type` avoids a subject-data migration and is compatible
with the existing public contract. Rejecting simultaneous conflicting valid
carriers is a fail-closed hardening change for the next patch release. Applications
that intentionally populate multiple different identities on one request must
remove the stale writer or select the intended identity in a configured custom
resolver before upgrading.

## Consequences

- Authentication guard ordering remains application-owned.
- RBAC does not validate JWTs or API-key credentials; it reconciles identities
  already written by trusted authentication middleware.
- `undefined` from the default resolver continues to produce
  `RBAC_SUBJECT_MISSING`, without exposing conflicting identity values.
