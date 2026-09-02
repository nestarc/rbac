# Security Policy

## Supported Versions

`@nestarc/rbac` is pre-1.0. Security fixes are provided for the latest
published minor release line only; publishing a new minor normally ends
security support for the previous minor. Always use the newest patch in the
supported line.

| Package release line | Security fixes                  |
| -------------------- | ------------------------------- |
| 0.2.x                | Supported                       |
| 0.1.x and earlier    | Not supported; upgrade to 0.2.x |

Package security support is separate from the Node.js, NestJS, Prisma, and
PostgreSQL versions exercised by this repository. See
[Compatibility and support](docs/compatibility.md) for those exact contracts.

## Reporting a Vulnerability

Report a suspected vulnerability through
[GitHub private vulnerability reporting](https://github.com/nestarc/rbac/security/advisories/new)
for this repository. If that form is unavailable, email
[security@nestarc.dev](mailto:security@nestarc.dev).

Do not open a public issue, discussion, or pull request containing vulnerability
details or proof-of-concept code. Do not disclose the issue publicly before a
coordinated disclosure date has been agreed. A public issue may request help
reaching the private channel, but it must not include exploit details, secrets,
tokens, request data, logs, customer data, or other sensitive material.

Include enough information to assess the report safely:

- The affected package version and API or integration
- The security impact and required deployment conditions
- Minimal reproduction steps or a proof of concept using synthetic data
- Expected and observed behavior
- Any known mitigations or workarounds

Maintainers will assess whether the supported release line is affected, confirm
the security boundary involved, coordinate a fix and downstream notification
when needed, and agree on an appropriate disclosure plan. Timing depends on the
impact, complexity, reporter communication, and downstream coordination; this
policy does not promise a fixed acknowledgement or remediation SLA.

## Security Boundaries

`@nestarc/rbac` makes authorization decisions after an application has
authenticated a caller. It does not verify JWT signatures, API-key secrets,
message producers, or tenant membership. Authentication guards and trusted
identity middleware must run before `RbacGuard`.

The following boundaries are security-sensitive:

- **Subject:** HTTP values such as `request.user`, `request.rbacSubject`, and API-key
  context are application-provided identity carriers. Default subject sources
  must agree on the exact subject type, ID, and tenant ID or resolution fails
  closed. A configured custom subject resolver is authoritative, so its trust
  and validation remain the application's responsibility.
- **Tenant and headers:** A configured tenant resolver is authoritative by
  default. Its result is reconciled with the subject, request tenant fields, and
  `x-tenant-id`; conflicting populated sources fail closed before permission
  lookup. Request fields and headers are not trusted merely because they exist.
- **API keys:** `request.apiKey` is trusted as a canonical carrier only after an
  authentication guard has verified the key. The deprecated
  `request.apiKeyContext` carrier is a compatibility fallback, and conflicting
  canonical and legacy identities fail closed.
- **Storage:** Custom `RbacStorage` adapters are trusted authorization data
  providers. The service defensively rejects malformed, expired, wrong-tenant,
  and incompatible effective records, but it cannot validate every adapter side
  effect or reconstruct provenance that the storage interface does not return.
  Protect the backing store and treat adapter changes as security-sensitive.

See [Guards](docs/guards.md) and [Integrations](docs/integrations.md) for the full
runtime contracts. Reports about behavior outside these documented boundaries,
unsupported release lines, or vulnerabilities wholly in an application or
third-party dependency may be redirected to the responsible project, while any
RBAC contribution to the impact will still be assessed.
