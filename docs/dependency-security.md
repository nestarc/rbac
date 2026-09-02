# Dependency security policy

Pull requests and releases must pass `npm run verify:dependency-audit`. The command
prints each `npm audit --json` report and its original exit code before applying
the repository policy:

1. The production audit (`npm audit --omit=dev --json`) must exit successfully and
   report zero vulnerabilities. Production findings cannot be allowlisted.
2. The full development audit may contain only findings that exactly match
   `.github/dependency-risk-register.json`, including package, severity, affected
   range, advisory/dependency path, effects, and installed node path.
3. Every audit or package override exception must name an owner, reason, removal
   condition, and exclusive `reviewBy` date. The gate fails on that date until a
   maintainer removes or explicitly renews the entry after review.
4. A new, changed, or resolved finding fails the exact comparison. Resolved
   findings must be removed from the register rather than retained as a blanket
   allowance.
5. Every `package.json` override must have a matching tracked override entry. A
   parent-tool update must re-evaluate and remove an override when upstream has
   incorporated the safe dependency.

The register is deliberately short-lived risk acceptance, not a vulnerability
suppression file. Dependabot groups related NestJS, Prisma, and lint/test updates
so their exact compatibility gates can be reviewed together. GitHub Actions are
pinned to full commit SHAs with human-readable version comments; Dependabot keeps
those pins current. Workflow permissions remain read-only by default, with npm
OIDC permission granted only to the publish job.

## Workflow dependency policy

| Dependency             | Immutable ref policy                                          | Permission policy                                      |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| `actions/checkout`     | Full commit SHA, with the reviewed major version in a comment | Inherits `contents: read`                              |
| `actions/setup-node`   | Full commit SHA, with the reviewed major version in a comment | Inherits `contents: read`; no token write permission   |
| npm trusted publishing | No reusable third-party action                                | Release `publish` job alone receives `id-token: write` |

Container service versions remain compatibility inputs rather than GitHub Action
dependencies. For example, PostgreSQL 16 stays a versioned database lane and is
not converted into an unrelated workflow pinning task.

| Dependabot group | Included packages                                                        | Update policy                          |
| ---------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| `nestjs`         | `@nestjs/*`                                                              | Weekly minor/patch compatibility PR    |
| `prisma`         | `prisma`, `@prisma/*`                                                    | Weekly minor/patch compatibility PR    |
| `lint-test`      | ESLint, Vitest, TypeScript, tsup, Prettier, SWC, types, and test helpers | Weekly development-only minor/patch PR |
| `actions`        | GitHub Actions workflow dependencies                                     | Weekly immutable-ref update PR         |
