# ADR 0004: NestJS 12 support and Prisma 8 compatibility boundary

- Status: Accepted for NestJS 12; Prisma 8 implementation deferred
- Date: 2026-09-02
- Tasks: `RBAC-M23A`, `RBAC-M23B`

## Context

The 0.2.x package originally declared NestJS `>=10 <12` and optional Prisma
client/CLI peers `>=5 <8`. Those ranges were backed by exact NestJS 10/11 and
Prisma 5/6/7 fixtures. NestJS 12 is now stable, while the npm `prisma` `latest`
tag still resolves to an 8.0.0 release candidate.

NestJS 12 publishes the core framework packages as ESM. Its migration guide
states that CommonJS consumers use modern Node.js `require(esm)` support. The
repository's maintained Node 22 and 24 lines meet that runtime requirement.

Prisma 8 is a different data-access contract rather than another generated
client major. The preview packages emit a schema contract and expose models
through `db.orm.public.Model`; transactions use `db.transaction(...)`. The
current `PrismaRbacStorage` accepts the Prisma 5-7 generated-client shape:
lowercase delegates such as `rbacRole.findMany(...)` and callback
`$transaction(...)`. Prisma 8 does not provide that structural shape, and there
is no `@prisma/client@8.0.0-rc.12` package to satisfy the existing optional peer.

## Decision

1. Expand the NestJS peers to `>=10 <13`. This is an additive install range and
   is patch-safe under the existing compatibility policy.
2. Continuously verify exact NestJS 12.0.1 on Node 22 and 24 with a strict install
   of the packed RBAC artifact. The fixture covers CommonJS, ESM, Nest testing
   module dependency injection, TypeScript declarations, lockfile provenance,
   and exact dependency versions. NestJS 10.4.22 and 11.2.1 gates remain.
3. Do not expand the Prisma peers beyond `<8` and do not claim Prisma 8 support.
   A strict Prisma 8 gate requires a stable release and a new adapter or explicit
   compatibility bridge for the contract/query-builder API.
4. Treat replacement of the existing `PrismaRbacStorage` contract as breaking.
   An additive Prisma 8 adapter may be designed separately, but it must first run
   the complete storage contract against disposable PostgreSQL and document how
   applications transfer migration ownership from Prisma 7.

## Evidence

- NestJS 12.0.1 strict packed consumer: exact peers installed without `--force`
  or `--legacy-peer-deps`; CJS, ESM, DI, and declaration smokes passed on local
  Node 24.11.1. CI/release run the same artifact on Node 22 and 24.
- On 2026-09-02, npm reported `@nestjs/core@12.0.1` as stable, `prisma@8.0.0-rc.12`
  as `latest`, `@prisma/client@7.10.0` as stable, and no
  `@prisma/client@8.0.0-rc.12` artifact.
- Prisma's PostgreSQL upgrade guide is still validated against release-candidate
  packages and prescribes side-by-side Prisma 7/8 operation before migration
  ownership transfers.

## Consequences

NestJS 12 consumers can install 0.2.x without weakening peer enforcement and get
an exact regression lane. Prisma 8 consumers must keep RBAC on a Prisma 7 client
or provide a separately validated custom `RbacStorage`; installing preview
packages does not make `PrismaRbacStorage` compatible.

`RBAC-M23B` remains blocked on a stable Prisma 8 release. When that milestone is
met, the first implementation action is a disposable PostgreSQL fixture using
the stable contract/runtime packages, followed by the full shared storage
contract with zero skips.
