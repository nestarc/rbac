# Compatibility and support

This document separates package-manager compatibility from combinations that this
repository has actually exercised. A peer range means npm may install that version;
it does not claim that every Cartesian combination of Node, NestJS, Prisma, and the
optional Nestarc packages has an independent test lane.

## Transport policy

| Surface                                                                    | 0.2.x support                                   | Evidence                            |
| -------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------- |
| `RbacService.can()` / `assertCan()`                                        | Transport-neutral plain-input authorization API | Unit and storage contracts          |
| `RbacGuard`, decorators, built-in resources, default/integration resolvers | Nest HTTP requests only                         | Nest HTTP E2E and packed consumers  |
| GraphQL, RPC, and WebSocket Guard integrations                             | Unsupported and unverified                      | No package adapter or transport E2E |

Custom resolvers receive Nest's general `ExecutionContext`, but the surrounding
Guard still accesses an HTTP request and emits HTTP exceptions. Another transport
must use application-owned extraction/error mapping around `RbacService` until a
carrier abstraction and real transport E2E fixtures are added. See
[ADR 0003](adr/0003-http-transport-contract.md).

## Runtime and maintainer Node policy

| Concern              | 0.2.x contract                                                                                                                                                                                                                         | Evidence                                                                                                                                                                           | Next compatibility action                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Consumer runtime     | Node 22 and 24 are the maintained runtime lines. The published 0.2.x package has no `engines.node`, so adding a rejecting lower bound is deferred rather than silently breaking existing patch consumers. Node below 22 is unverified. | Source verification and strict Nest 11/12 packed consumers run on Node 22/24. Nest 12's ESM packages require Node 22.12+ on the 22.x line; CI uses the current maintained release. | Add `engines.node: ">=22"` only with the 0.3 migration because introducing it can reject an installation that 0.2.x accepted. |
| Maintainer toolchain | CI uses Node 22 and 24; release publishing uses Node 24. TypeScript checks use exact `@types/node` 22.20.1 so the source cannot accidentally depend on Node 25 APIs.                                                                   | `.github/workflows/ci.yml`, `.github/workflows/release.yml`, and `package.json`.                                                                                                   | Keep both maintained Node lines in source and packed-consumer gates.                                                          |

`engines.node` is an installation floor, not a promise that every future Node major
is automatically supported. New Node lines require their own CI evidence before
they become maintained lines.

## Framework and Prisma policy

| Axis               | 0.2.x install metadata                            | Exact evidence                                                                                                                                                                                                      | Decision                                                                                                                                                                      |
| ------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NestJS 12          | `@nestjs/common` and `@nestjs/core` `>=10 <13`    | Nest 12.0.1 with `reflect-metadata` 0.2.2 and RxJS 7.8.2 in Node 22/24 strict packed consumers; CJS, ESM, Nest DI, and declaration smokes.                                                                          | Supported and continuously gated. See [ADR 0004](adr/0004-nest-12-prisma-8-compatibility.md).                                                                                 |
| NestJS 11          | Same retained peer range                          | Nest 11.2.1 with `reflect-metadata` 0.2.2 and RxJS 7.8.2 in the Node 22/24 strict packed consumer; source/E2E on the pinned maintainer toolchain.                                                                   | Supported and continuously gated.                                                                                                                                             |
| NestJS 10          | Same retained peer range                          | Nest 10.4.22 with `reflect-metadata` 0.2.2 and RxJS 7.8.2 in a Node 24 strict packed consumer; the fixture executes CJS, ESM, Nest DI, and declaration smokes.                                                      | Supported and continuously gated.                                                                                                                                             |
| Prisma 8           | Not included; existing optional peers remain `<8` | On 2026-09-02 npm `latest` was `8.0.0-rc.12`, `@prisma/client` had no matching v8 artifact, and the preview contract/query API did not implement the delegate/`$transaction` shape required by `PrismaRbacStorage`. | Unsupported pending a stable release and a new adapter or bridge with a disposable PostgreSQL full-contract lane. See [ADR 0004](adr/0004-nest-12-prisma-8-compatibility.md). |
| Prisma 7           | Optional `@prisma/client` and `prisma` `>=5 <8`   | Prisma 7.10.0 strict packed consumer and PostgreSQL 16 contract lane.                                                                                                                                               | Supported and continuously gated. Prisma 7 applications also supply the database driver adapter required by their Prisma setup.                                               |
| Prisma 6           | Same retained optional peer range                 | Prisma 6.19.3 legacy-client PostgreSQL 16 contract lane.                                                                                                                                                            | Supported and continuously gated.                                                                                                                                             |
| Prisma 5           | Same retained optional peer range                 | Prisma 5.22.0 legacy-client PostgreSQL 16 contract lane.                                                                                                                                                            | Supported and continuously gated.                                                                                                                                             |
| `reflect-metadata` | `>=0.1.13`                                        | 0.2.2 in the modern packed consumer.                                                                                                                                                                                | Keep the 0.2.x range. A future upper bound or narrower range is a compatibility change and needs migration review.                                                            |
| RxJS               | `>=7`                                             | 7.8.2 in the modern packed consumer.                                                                                                                                                                                | Keep the 0.2.x range; no RxJS 8 support claim exists without a dedicated lane.                                                                                                |

The exact lanes above are representative contracts, not a full Cartesian matrix.
In particular, the Prisma 5 and 6 database lanes currently use the pinned Nest 11
maintainer environment, while the Nest 10/12 packed lanes do not install Prisma.
These lanes do not independently prove every Nest 10/11/12, Prisma 5/6/7, and
Node 22/24 pairing.

## Actual CI and release gates

| Gate                      | Runtime                   | What it verifies                                                                                                                                                                                               |
| ------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source verification       | Node 22 and 24            | Exact modern maintainer dependencies, Prisma generation, lint, typecheck, unit/contract tests, HTTP E2E, build, and coverage                                                                                   |
| Modern packed consumer    | Node 22 and 24            | Exact NestJS 11.2.1, Prisma 7.10.0, and API Keys 0.3.2 under a strict peer install; CJS, ESM, declarations, every shipped TypeScript example, runtime behavior, and canonical/legacy API-key conflict handling |
| NestJS 10 packed consumer | Node 24                   | Exact NestJS 10.4.22 under a strict peer install; CJS, ESM, Nest dependency injection, and declarations                                                                                                        |
| NestJS 12 packed consumer | Node 22 and 24            | Exact NestJS 12.0.1 under a strict peer install; CJS, ESM, Nest dependency injection, declarations, and packed-artifact provenance                                                                             |
| Prisma integration        | Node 24 and PostgreSQL 16 | The 36-test integration suite with exact Prisma 5.22.0, 6.19.3, and 7.10.0, with no skipped tests                                                                                                              |
| Release target            | Node 24                   | Release tag/package version agreement, tag checkout identity, release target resolution, and tag-to-target-to-`main` ancestry                                                                                  |
| Dependency audit          | Node 24                   | Production vulnerabilities are zero; full development findings and package overrides exactly match active, owner-assigned, expiring risk-register entries                                                      |
| Package contract          | Node 24                   | Reuses the verified Node 24 build to create one allowlisted, size-bounded tarball; checks every export target and packed local documentation link                                                              |
| Release publish           | Node 24                   | Reuses the full CI verification workflow on the tag, publishes that exact verified tarball with provenance, then compares registry integrity, file metadata, and SLSA attestation metadata                     |

Pull requests and releases run the dependency audit policy in
`.github/dependency-risk-register.json`; production findings always fail, while
full development findings must match an unexpired exception exactly. The package
job creates one `.tgz` and manifest after the Node 24 build succeeds. The Node
22/24 modern consumers and Nest 10/12 consumers download that same artifact; their
lockfiles must retain its exact path and SHA-512 integrity. Runtime and type smokes
cover the root, `prisma`, `testing`, `integrations/tenancy`,
`integrations/api-keys`, and `integrations/audit-log` exports.

The release publish job downloads the same artifact, rechecks its bytes against
the manifest, passes the resolved file directly to `npm publish --provenance`, and
then requires npm registry integrity, file count, unpacked size, and SLSA
provenance metadata to match. The published 0.2.1 attestation remains the
baseline; each future release must satisfy the post-publish check independently.

## Optional Nestarc peers and imports

| Peer                 | Declared range       | Evidence and boundary                                                                                                                                                                          |
| -------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nestarc/api-keys`  | `>=0.1 <1`, optional | Exact 0.3.2 Guard-to-RBAC packed fixture verifies canonical `request.apiKey` handling. Other versions in the install range are not claimed as separately tested.                               |
| `@nestarc/tenancy`   | `>=0.1 <1`, optional | The helper accepts a structural tenant getter and has no runtime import of the tenancy package. The published ecosystem has separately exercised tenancy 0.16.0 with RBAC 0.2.1.               |
| `@nestarc/audit-log` | `>=0.1 <1`, optional | The adapter accepts a structural `log()` interface and has no runtime import of the audit-log package. Unit and HTTP adapter contracts exercise that interface without installing the sibling. |

The root export does not import Prisma or any Nestarc sibling package. Prisma and
integration behavior is reached through explicit subpath exports, and all five
peers remain marked optional. Installing or importing `@nestarc/rbac` at the root
therefore does not force those optional packages into an application.

## Semver rules

- Adding another exact compatibility lane is patch-safe when it does not change
  runtime or installation behavior.
- Widening a peer range is patch-safe only after an exact strict-consumer gate
  passes; it admits an additional supported host without rejecting an existing
  installation.
- Narrowing a peer range, introducing or raising a rejecting `engines.node` floor,
  or removing an optional-peer fallback is reserved for the 0.3 migration.
- Documentation names an exact combination as tested only after its packed or
  real-database gate passes. An installable peer range alone is not evidence.
