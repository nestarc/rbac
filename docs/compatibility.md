# Compatibility and support

This document separates package-manager compatibility from combinations that this
repository has actually exercised. A peer range means npm may install that version;
it does not claim that every Cartesian combination of Node, NestJS, Prisma, and the
optional Nestarc packages has an independent test lane.

## Runtime and maintainer Node policy

| Concern | 0.2.x contract | Evidence | Next compatibility action |
| --- | --- | --- | --- |
| Consumer runtime | Node 22 and 24 are the maintained runtime lines. The published 0.2.x package has no `engines.node`, so adding a rejecting lower bound is deferred rather than silently breaking existing patch consumers. Node below 22 is unverified. | Source verification runs on Node 22/24. The strict packed Nest 11/Prisma 7 consumer runs on Node 22/24 and executes CJS, ESM, and declaration smokes. | Add `engines.node: ">=22"` only with the 0.3 migration because introducing it can reject an installation that 0.2.x accepted. |
| Maintainer toolchain | CI uses Node 22 and 24; release publishing uses Node 24. TypeScript checks use exact `@types/node` 22.20.1 so the source cannot accidentally depend on Node 25 APIs. | `.github/workflows/ci.yml`, `.github/workflows/release.yml`, and `package.json`. | Keep both maintained Node lines in source and packed-consumer gates. |

`engines.node` is an installation floor, not a promise that every future Node major
is automatically supported. New Node lines require their own CI evidence before
they become maintained lines.

## Framework and Prisma policy

| Axis | 0.2.x install metadata | Exact evidence | Decision |
| --- | --- | --- | --- |
| NestJS 11 | `@nestjs/common` and `@nestjs/core` `>=10 <12` | Nest 11.2.1 with `reflect-metadata` 0.2.2 and RxJS 7.8.2 in the Node 22/24 strict packed consumer; source/E2E on the pinned maintainer toolchain. | Supported and continuously gated. |
| NestJS 10 | Same retained peer range | Nest 10.4.22 with `reflect-metadata` 0.2.2 and RxJS 7.8.2 in a Node 24 strict packed consumer; the fixture executes CJS, ESM, Nest DI, and declaration smokes. | Supported and continuously gated. |
| Prisma 7 | Optional `@prisma/client` and `prisma` `>=5 <8` | Prisma 7.10.0 strict packed consumer and PostgreSQL 16 contract lane. | Supported and continuously gated. Prisma 7 applications also supply the database driver adapter required by their Prisma setup. |
| Prisma 6 | Same retained optional peer range | Prisma 6.19.3 legacy-client PostgreSQL 16 contract lane. | Supported and continuously gated. |
| Prisma 5 | Same retained optional peer range | Prisma 5.22.0 legacy-client PostgreSQL 16 contract lane. | Supported and continuously gated. |
| `reflect-metadata` | `>=0.1.13` | 0.2.2 in the modern packed consumer. | Keep the 0.2.x range. A future upper bound or narrower range is a compatibility change and needs migration review. |
| RxJS | `>=7` | 7.8.2 in the modern packed consumer. | Keep the 0.2.x range; no RxJS 8 support claim exists without a dedicated lane. |

The exact lanes above are representative contracts, not a full Cartesian matrix.
In particular, the Prisma 5 and 6 database lanes currently use the pinned Nest 11
maintainer environment, while the Nest 10 packed lane does not install Prisma.
These lanes do not independently prove every Nest 10/11, Prisma 5/6/7, and Node
22/24 pairing.

## Actual CI and release gates

| Gate | Runtime | What it verifies |
| --- | --- | --- |
| Source verification | Node 22 and 24 | Exact modern maintainer dependencies, Prisma generation, lint, typecheck, unit/contract tests, HTTP E2E, build, and coverage |
| Modern packed consumer | Node 22 and 24 | Exact NestJS 11.2.1, Prisma 7.10.0, and API Keys 0.3.2 under a strict peer install; CJS, ESM, declarations, runtime behavior, and canonical/legacy API-key conflict handling |
| NestJS 10 packed consumer | Node 24 | Exact NestJS 10.4.22 under a strict peer install; CJS, ESM, Nest dependency injection, and declarations |
| Prisma integration | Node 24 and PostgreSQL 16 | The 34-test storage contract with exact Prisma 5.22.0, 6.19.3, and 7.10.0, with no skipped tests |
| Release target | Node 24 | Release tag/package version agreement, tag checkout identity, release target resolution, and tag-to-target-to-`main` ancestry |
| Release publish | Node 24 | Repeats source, packed-consumer, and Prisma lanes on the tag, then runs `npm pack --dry-run` before npm publishing |

The release workflow does not currently run dependency audits or publish a single
previously verified tarball; `npm pack --dry-run` and `npm publish` each prepare the
package. Those are future maintenance gates, not current guarantees. The published
0.2.1 package has provenance, but preservation and artifact-link verification must
be repeated for each future release.

## Optional Nestarc peers and imports

| Peer | Declared range | Evidence and boundary |
| --- | --- | --- |
| `@nestarc/api-keys` | `>=0.1 <1`, optional | Exact 0.3.2 Guard-to-RBAC packed fixture verifies canonical `request.apiKey` handling. Other versions in the install range are not claimed as separately tested. |
| `@nestarc/tenancy` | `>=0.1 <1`, optional | The helper accepts a structural tenant getter and has no runtime import of the tenancy package. The published ecosystem has separately exercised tenancy 0.16.0 with RBAC 0.2.1. |
| `@nestarc/audit-log` | `>=0.1 <1`, optional | The adapter accepts a structural `log()` interface and has no runtime import of the audit-log package. Unit and HTTP adapter contracts exercise that interface without installing the sibling. |

The root export does not import Prisma or any Nestarc sibling package. Prisma and
integration behavior is reached through explicit subpath exports, and all five
peers remain marked optional. Installing or importing `@nestarc/rbac` at the root
therefore does not force those optional packages into an application.

## Semver rules

- Adding another exact compatibility lane is patch-safe when it does not change
  runtime or installation behavior.
- Narrowing a peer range, introducing or raising a rejecting `engines.node` floor,
  or removing an optional-peer fallback is reserved for the 0.3 migration.
- Documentation names an exact combination as tested only after its packed or
  real-database gate passes. An installable peer range alone is not evidence.
