# `@nestarc/rbac` v0.2.1 P0–P3 유지보수 작업 계획

- 상태: `ACTIVE`
- 작성일: 2026-08-30 (Asia/Seoul)
- 공개 기준: `v0.2.1`, `origin/main@69bf0e192865566e67627f9cf5c1c35fcb458103`
- 조사 checkout: `codex/ten-m21-rbac-modern@3ae12a17ab57f3e0cc81f9a2b5f0ec3410897aa4`
- tree hash: 공개 기준과 조사 checkout 모두 `0f867363eccd5d9d0bdd32996549816e2d835107`
- 패키지: `@nestarc/rbac@0.2.1`
- 목적: P0–P3 조사 결과를 독립적인 한 세션/한 PR 작업으로 나누고, 새 세션이 완료된 v0.2.0/v0.2.1 작업이나 오래된 구현 계획을 반복하지 않게 한다.

> [!IMPORTANT]
> 이 문서가 v0.2.1 이후 유지보수 실행 큐다. `docs/prd.md`, `docs/spec*.md`, `docs/superpowers/plans/**`의 미체크 항목은 역사적 설계/구현 자료이며 자동 backlog가 아니다. 실제 구현, CHANGELOG, 이 문서가 현재 상태의 우선 근거다.

> [!CAUTION]
> P0에는 tenant 신뢰 경계, API-key identity source, custom storage 결과 검증이 포함된다. 상세 공격 payload나 비공개 재현 스크립트를 일반 issue/릴리스 노트에 싣지 않는다. 공개 기록에는 영향, 수정 계약, 안전한 회귀 결과만 남긴다.

## 0. 문서 운영 규칙

### 0.1 우선순위

| 우선순위 | 의미 | 실행 원칙 |
| --- | --- | --- |
| `P0` | 재현된 authorization 위반 또는 충돌 시 deny해야 하는 고영향 trust-boundary 결함 | 기능·refactor보다 먼저 수정하되 공개 severity는 실제 attacker-controlled source/exposure 증거에 맞춘다. |
| `P1` | 잘못된 runtime shape, mutation 의미, 지원 범위, audit가 authorization 신뢰성을 떨어뜨리는 문제 | P0 뒤에 작은 계약 단위로 수정한다. |
| `P2` | 문서·성능·transport·예제·공급망의 운영 안정성 | P0/P1 의미가 고정된 뒤 진행한다. |
| `P3` | 구조 분해, 장기 호환성, 신규 helper 연구 | 별도 ADR/스파이크로 시작하며 현 release를 막지 않는다. |

### 0.2 상태

| 상태 | 의미 |
| --- | --- |
| `READY` | 기술적 선행 조건이 충족됐다. 실제 선택은 실행 큐의 우선순위 순서를 따른다. |
| `IN_PROGRESS` | 한 세션/한 PR 범위가 시작됐고 아직 완료 증거가 모이지 않았다. |
| `BLOCKED` | 선행 작업 또는 외부 release가 필요하다. |
| `DECISION` | 구현 전에 호환성/제품 계약을 선택해야 한다. |
| `EXTERNAL` | 다른 저장소 또는 관리자 권한에서 수행한다. |
| `DONE` | 코드, 검증, 문서, 필요한 배포 증거까지 끝났다. |
| `SUPERSEDED` | 다른 작업에 흡수됐으며 재실행하지 않는다. |

### 0.3 새 세션 시작 절차

1. `git fetch --prune --tags`로 원격과 tag를 갱신한 뒤 기준 ref와 `git status --short --branch`를 확인한다.
2. 기존 미추적 `.DS_Store`를 삭제·stage하지 않는다. 다른 사용자 변경이 생기면 그대로 보존한다.
3. `origin/main`, release tag, GitHub Release, npm `latest`를 다시 조회하고 달라졌으면 기준선부터 갱신한다.
4. 실행 큐에서 가장 앞선 실행 가능한 `READY` 또는 선행이 충족된 `DECISION` task 하나만 선택한다. 뒤쪽 P2/P3의 기술적 선행이 충족됐더라도 P0/P1을 건너뛰지 않는다.
5. task의 "정확한 첫 행동"에 적힌 실패 테스트 또는 계약 표를 먼저 만든다.
6. 비범위를 벗어나는 발견은 후보 backlog에 추가하고 현재 PR에 섞지 않는다.

시작용 최소 명령:

```bash
git fetch --prune --tags
git status --short --branch
git log -1 --oneline
git rev-parse origin/main
git rev-parse v0.2.1
gh release view v0.2.1 --json tagName,targetCommitish,publishedAt
npm view @nestarc/rbac version dist.tarball time --json
node -p "require('./package.json').version"
npm run typecheck
npm test
```

현재 checkout에는 사용자 소유 `.DS_Store`가 있으므로 자동 switch/reset하지 않는다. 최신 main에서 깨끗한 worktree와 `codex/<task-id>` branch를 별도로 만들고, 실제 시작 ref를 인계 기록에 남긴다.

### 0.4 세션 종료 인계 형식

```text
Task: RBAC-Mxx
State: DONE | BLOCKED | IN_PROGRESS | DECISION | EXTERNAL
Start ref / end ref:
Changed files:
Contract decision:
Commands and exact results:
Unverified paths and reason:
External PR/release evidence:
Next exact action:
```

작업 종료 때 이 문서의 상태와 마지막 작업 기록을 갱신한다. 코드 작성만으로 `DONE` 처리하지 않는다.

## 1. 2026-08-30 기준선

### 1.1 저장소와 배포 상태

- GitHub Release [`v0.2.1`](https://github.com/nestarc/rbac/releases/tag/v0.2.1)은 게시 완료됐다.
- npm `latest`는 `@nestarc/rbac@0.2.1`이며 2026-08-30T04:54:28.735Z에 게시됐다.
- release/tag와 `origin/main`은 `69bf0e1`을 가리킨다.
- 조사 checkout HEAD는 topic commit `3ae12a1`이지만 공개 main과 tree가 동일하다.
- PR #1의 Nest 11/Prisma 7 호환성 변경은 merge·release·npm publish까지 완료됐다.
- 2026-08-30 조회 당시 Node 22/24, Prisma 6/7, modern consumer, publish checks는 성공했다.

조사 전부터 다음 미추적 파일이 있다.

```text
?? .DS_Store
```

이번 계획은 이를 삭제·복원·stage하지 않는다.

### 1.2 fresh 로컬 검증

조사 환경 Node `24.11.1`에서 실행했다.

| 검증 | 결과 |
| --- | --- |
| `npm test` | 14 files, 205 tests PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| fresh unit/contract coverage | statements 94.8%, branches 87.58%, functions 96.96%, lines 95.53% |
| `npm audit --omit=dev --json` | production 0 |
| `npm audit --json` | 9 total: high 7, low 2; 모두 dev/test/build tree |

coverage는 `test/unit`과 `test/contract` 기준이다. Prisma real DB integration은 별도 gate다.

### 1.3 지원 선언과 실제 증거

| 축 | 공개 선언 | 현재 자동 증거 | 남은 결정 |
| --- | --- | --- | --- |
| Node | `engines` 없음 | Node 22/24 source CI | 명시적 하한과 types 기준 |
| NestJS | `>=10 <12` | default/consumer는 Nest 11 | 현재 patch의 Nest 10 consumer 증거 |
| Prisma | client/CLI `>=5 <8` optional | Prisma 6/7 PostgreSQL | Prisma 5를 검증하거나 peer 축소 |
| PostgreSQL | Prisma adapter | PostgreSQL 16 | 지원 버전 표와 migration semantics |
| package subpaths | root, prisma, testing, tenancy, api-keys, audit-log | packed modern smoke는 root/prisma 중심 | 모든 public subpath artifact smoke |

공개 npm `0.2.1`에는 이미 SLSA provenance attestation이 있고 release workflow는 `id-token: write`를 사용한다. 이후 작업은 이를 새로 구현하는 것이 아니라 보존하고, 실제 게시 artifact와 연결된 attestation인지 검증한다.

Node 지원 정책은 [Node.js 공식 release 표](https://nodejs.org/en/about/previous-releases)와 Nestarc ecosystem의 Node 22/24 기준을 함께 사용한다.

### 1.4 완료된 작업 — 다시 구현하지 않음

- v0.1 role/permission/binding, Guard, service, InMemory/Prisma storage
- tenancy/API Keys/audit-log optional integration과 testing helpers
- v0.2 typed permission, strict preset, decision detail, write validation
- v0.2 policy change publisher, audit-log adapter, testing matrix helper, migration docs
- v0.2.1 Nest 11.2.1/Prisma 7.10.0 strict packed consumer
- Prisma 6.19.3/7.10.0 PostgreSQL 16 integration lanes
- npm `0.2.1` 배포와 tenancy modern published-only ecosystem 사용
- npm `0.2.1` provenance attestation 게시

### 1.5 외부 milestone

| milestone | 상태 | 의미/증거 |
| --- | --- | --- |
| `TEN-M21` | `DONE` | 역사적 published-only full-flow를 tenancy 0.15.0/API Keys 0.3.2/RBAC 0.2.1/Nest 11.2.1/Prisma 7.10.0 tuple에서 완료했고 재개하지 않는다. 이후 tenancy `v0.16.0`/현재 main(`91b9fb7`)도 published tuple을 다시 검증했다. 최종 기록에는 API Keys `a24fe1d`, RBAC `69bf0e1`, Outbox `873f95b`, Webhook `60b2725`, Jobs `405e799`, modern/legacy E2E 각 3/3, targeted 38, unit 56 files/908 tests가 남아 있다. |
| `TEN-ECO-NEXT` | `EXTERNAL` | 향후 RBAC/API Keys patch가 npm에 게시된 뒤 tenancy가 새 exact published tuple을 pin해 post-publish E2E를 수행한다. 어떤 pre-publish RBAC task도 이를 선행 조건으로 삼지 않는다. |
| `EXT-SECURITY-CHANNEL` | `EXTERNAL` | 저장소 관리자가 실제 비공개 신고 채널과 지원 release line을 확정한다. |
| `EXT-PRISMA7-AUDIT-FIX` | `EXTERNAL` | Prisma 7 dependency tree가 fixed `deepmerge-ts`를 제공하거나 제한 override가 공식/로컬 검증으로 안전해진다. |
| `EXT-PRISMA8-STABLE` | `EXTERNAL` | Prisma 8 stable과 공식 migration contract가 게시된다. 현재 latest 조회값은 `8.0.0-rc.12`이므로 충족되지 않았다. |

이 문서의 matrix 작업은 위 완료 항목을 보존하면서 광고 범위의 하한 증거와 release parity를 닫는 일이다.

## 2. 실행 큐

| 순서 | ID | 우선순위 | 상태 | 크기 | 선행 | 작업 |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | `RBAC-M01` | P0 | `DONE` | L | 없음 | trusted tenant source와 request identity conflict fail-closed |
| 2 | `RBAC-M02` | P0 | `DONE` | M | 없음 | canonical API-key context source와 legacy conflict 처리 |
| 3 | `RBAC-M03` | P0 | `DONE` | L | 없음 | custom storage effective result tenant/expiry 방어 검증 |
| 4 | `RBAC-M04` | P1 | `DONE` | M | 없음 | inbound runtime enum/shape fail-closed validation |
| 5 | `RBAC-M05` | P1 | `READY` | M | `RBAC-M02` | subject namespace/source 호환성 정책 |
| 6 | `RBAC-M06` | P1 | `READY` | M | `RBAC-M01`, `RBAC-M02` | 식별자 canonicalization 단일화 |
| 7 | `RBAC-M07` | P1 | `BLOCKED` | L | `RBAC-M06` | mutation outcome과 best-effort event 정합성 |
| 8 | `RBAC-M08` | P1 | `READY` | S | 없음 | 복수 requirement audit 최종 결과 정합성 |
| 9 | `RBAC-M09` | P1 | `DECISION` | M | 없음 | Node/Nest/Prisma 지원·semver 계약 |
| 10 | `RBAC-M10` | P1 | `BLOCKED` | M | `RBAC-M09` | 선택한 Nest/Prisma 하한 compatibility gate |
| 11 | `RBAC-M11` | P1 | `BLOCKED` | M | `RBAC-M10` | CI/release compatibility parity와 tag ancestry |
| 12A | `RBAC-M12A` | P2 | `READY` | S | 없음 | lock-safe dev advisory 갱신 |
| 12B | `RBAC-M12B` | P2 | `DECISION` | S | `RBAC-M12A` | esbuild parent-tool upgrade/제한 override |
| 12C | `RBAC-M12C` | P2 | `BLOCKED` | S | `EXT-PRISMA7-AUDIT-FIX` | Prisma→deepmerge-ts upstream 추적 |
| 13A | `RBAC-M13A` | P2 | `READY` | S | 없음 | 역사 문서 배너와 canonical queue link |
| 13B | `RBAC-M13B` | P2 | `BLOCKED` | S | `RBAC-M01`, `RBAC-M02`, `RBAC-M03`, `RBAC-M09` | support/trust 문서 동기화 |
| 14 | `RBAC-M14` | P2 | `BLOCKED` | M | `RBAC-M03`, `RBAC-M07` | public decision/error 계약 ADR |
| 15 | `RBAC-M15` | P2 | `BLOCKED` | M | `RBAC-M07` | indexed role lookup으로 전체 scan 제거 |
| 16 | `RBAC-M16` | P2 | `DECISION` | M | `RBAC-M01`, `RBAC-M05` | HTTP-only transport 계약 또는 carrier abstraction |
| 17 | `RBAC-M17` | P2 | `READY` | S | 없음 | examples/Prisma docs executable smoke |
| 18 | `RBAC-M18` | P2 | `BLOCKED` | M | `EXT-SECURITY-CHANNEL` | SECURITY와 reporting 경로 |
| 19A | `RBAC-M19A` | P2 | `BLOCKED` | S | `RBAC-M12A`, `RBAC-M12B` | audit automation과 만료형 예외 정책 |
| 19B | `RBAC-M19B` | P2 | `READY` | S | 없음 | Actions pinning과 dependency bot |
| 20A | `RBAC-M20A` | P3 | `BLOCKED` | M | `RBAC-M01`, `RBAC-M02`, `RBAC-M05`, `RBAC-M08`, `RBAC-M16` | Guard behavior-preserving 분해 |
| 20B | `RBAC-M20B` | P3 | `BLOCKED` | M | `RBAC-M20A`, `RBAC-M03`, `RBAC-M04`, `RBAC-M06`, `RBAC-M07`, `RBAC-M14` | service behavior-preserving 분해 |
| 20C | `RBAC-M20C` | P3 | `BLOCKED` | M | `RBAC-M20B`, `RBAC-M03`, `RBAC-M07`, `RBAC-M15` | Prisma adapter behavior-preserving 분해 |
| 21 | `RBAC-M21` | P3 | `BLOCKED` | S | `RBAC-M11`, `RBAC-M19A`, `RBAC-M19B`, `RBAC-M22` | reusable workflow/timeout/중복 build 정리 |
| 22 | `RBAC-M22` | P3 | `BLOCKED` | S | `RBAC-M11` | tarball allowlist·size·subpath·provenance contract |
| 23A | `RBAC-M23A` | P3 | `DECISION` | S | 없음 | Nest 12 stable 호환성 스파이크 |
| 23B | `RBAC-M23B` | P3 | `BLOCKED` | S | `EXT-PRISMA8-STABLE` | Prisma 8 stable 호환성 스파이크 |

P0 세 건은 각각 한 세션/한 PR로 진행한다. 독립 검증을 마치면 `RBAC-M01`과 `RBAC-M02`가 한 published RBAC patch version에 함께 포함되는 것은 허용한다. `RBAC-M01`은 선택된 subject와 trusted tenant reconciliation, `RBAC-M02`는 API-key request property, `RBAC-M03`은 outbound storage row boundary를 소유한다.

큐의 각 ID(접미사 A/B/C 포함)가 한 세션/한 PR 작업 단위다. 완료 조건은 해당 명세의 acceptance, 검증은 명시된 profile/fixture, 비범위는 인접 task 소유권과 각 명세의 비범위로 판단한다.

### 2.1 파일과 정확한 첫 행동

| ID | 주 파일 | 새 세션의 정확한 첫 행동 |
| --- | --- | --- |
| `RBAC-M01` | guard/resolver, service, options, tests | Guard source conflict와 `can({subject tenant A, tenantId B})`/strict `assignRole()` cross-tenant 허용을 각각 RED test로 추가한다. |
| `RBAC-M02` | default subject resolver, API Keys integration, packed fixture, docs | 실제 API Keys Guard가 `request.apiKey`를 쓴 뒤 상충하는 legacy property가 있는 packed fixture를 RED로 만들고 source prerequisite를 기록한다. |
| `RBAC-M03` | service, storage interfaces/contracts | wrong-tenant, expired(`< now`), invalid-Date effective role/permission을 반환하는 adapter deny test와 equality(`=== now`) 회귀를 추가한다. |
| `RBAC-M04` | service/guard assertions, JS consumer | invalid `mode`, `tenantMode`, Date, resource shape 표를 작성하고 현재 완화 동작을 RED로 만든다. |
| `RBAC-M05` | default subject resolver | 현재 보존 중인 `request.user.type='service_account'` fixture와 고정 namespace 대 migration 선택을 ADR로 먼저 작성한다. |
| `RBAC-M06` | assertions, service, adapters | whitespace tenant/subject/role/binding/resource/permission의 create→assign→can→event 표를 만들되 API-key ID exact/no-trim fixture를 함께 고정한다. |
| `RBAC-M07` | service, storage mutation capability, events | create-existing, update-missing/no-change, duplicate assign, grant-existing, revoke-absent/already-revoked outcome/event matrix를 RED로 만든다. |
| `RBAC-M08` | guard/audit specs | 첫 requirement allow, 다음 requirement deny인 요청에서 final audit 결과를 RED로 고정한다. |
| `RBAC-M09` | package metadata, CI/release, README | consumer runtime Node 하한과 maintainer toolchain, Nest/Prisma/sibling peer 선언·증거·semver를 분리한 ADR 표를 만든다. |
| `RBAC-M10` | consumer runner, Prisma integration | Nest 10 packed consumer와 Prisma 5 DB lane 중 유지할 하한을 test-first로 추가한다. |
| `RBAC-M11` | workflows, compatibility runners | CI/release의 Node/Nest/Prisma lane과 main/tag ancestry 차이만 표로 만든다. |
| `RBAC-M12A` | package/lockfile | production/full audit snapshot에서 lock-safe finding만 분류하고 minimal lock update를 준비한다. |
| `RBAC-M12B` | package/lockfile, build tooling | esbuild `>=0.28.1`을 제공하는 parent tool upgrade 또는 검증된 narrow override 중 하나를 선택한다. |
| `RBAC-M12C` | package/lockfile | Prisma→deepmerge-ts 경로와 upstream fixed version을 재조회하고 충족 전에는 예외만 갱신한다. |
| `RBAC-M13A` | README/docs/spec/plans | 이미 구현된 unchecked 항목을 목록화하고 historical/superseded 배너 초안을 만든다. |
| `RBAC-M13B` | README/docs | 완료된 P0/support 결정을 public support/trust 표에 옮긴다. |
| `RBAC-M14` | decision/error types, docs/tests | exported type의 실제 생성/소비 여부를 `rg`와 public type fixture로 분류한다. |
| `RBAC-M15` | storage interface, service, adapters | strict `assignRole()`이 `listRoles({})` 전체를 읽는 call-count/perf test를 추가한다. |
| `RBAC-M16` | guard/decorator/resolvers | HTTP 외 ExecutionContext에서 깨지는 지점을 표로 만들고 문서화 vs abstraction ADR을 쓴다. |
| `RBAC-M17` | examples, docs, CI | shipped examples를 clean packed consumer에서 typecheck해 첫 실패를 기록한다. |
| `RBAC-M18` | `SECURITY.md`, GitHub settings | `EXT-SECURITY-CHANNEL` 증거를 받은 뒤 실제 주소/지원 line만 문서화한다. |
| `RBAC-M19A` | workflows, audit policy | production/full audit의 자동 실패/만료형 예외 규칙을 먼저 작성한다. |
| `RBAC-M19B` | workflows, dependency automation | Actions ref/permissions와 bot grouping 현황을 표로 만든다. |
| `RBAC-M20A` | guard | exact dependency 완료와 Guard public golden test를 확인한 뒤 source-resolution helper 하나를 move-only로 추출한다. |
| `RBAC-M20B` | service | exact dependency 완료와 service contract를 확인한 뒤 validation/decision seam 하나를 move-only로 추출한다. |
| `RBAC-M20C` | Prisma adapter | exact dependency 완료와 real-DB contract를 확인한 뒤 mapper/query seam 하나를 move-only로 추출한다. |
| `RBAC-M21` | workflows | `RBAC-M11`/`RBAC-M19A`/`RBAC-M19B`/`RBAC-M22` 뒤 중복 step과 missing timeout을 목록화한다. |
| `RBAC-M22` | pack/consumer/docs links | 한 번 생성한 `.tgz`의 allowlist/size/모든 subpath/CJS/ESM/types/provenance 검증 fixture를 만든다. |
| `RBAC-M23A` | peer metadata, consumer fixture | Nest 12 stable exact version으로 strict packed consumer를 먼저 실행한다. |
| `RBAC-M23B` | Prisma adapter/integration | `EXT-PRISMA8-STABLE` 충족 뒤 Prisma 8 exact version으로 disposable real-DB lane을 만든다. |

## 3. P0 작업 명세

### `RBAC-M01` — trusted tenant source와 identity reconciliation

- 상태: `P0 / DONE`
- 문제: configured `tenantResolver`는 현재 fallback이다(`src/rbac.guard.ts:199-209`). subject, request field, `x-tenant-id`가 먼저 발견되면 trusted tenancy/ALS resolver를 호출하지 않고, default resolver는 subject/request/header 순으로 선택한다(`src/resolvers/default-http-tenant.resolver.ts:45-63`). 또한 public `RbacService.can()`은 explicit `input.tenantId`를 `subject.tenantId`보다 우선하고(`src/rbac.service.ts:387-404`), strict `assignRole()`은 role/binding tenant만 비교해 subject tenant와 다른 tenant의 binding을 만들 수 있다(`src/rbac.service.ts:555-600`).
- 기존 `writeValidation.rejectTenantMismatch`는 role/binding의 write-time 검증이며 이 request identity 문제와 별개다.

완료 조건:

- [x] configured tenant resolver의 authority와 default HTTP sources의 역할을 public policy로 정의한다.
- [x] trusted source와 subject/request/header가 충돌하면 권한 평가 전에 fail closed한다.
- [x] `null`, `undefined`, `tenant:'none'` 의미를 각각 고정한다.
- [x] configured resolver가 기본적으로 authoritative하고 legacy default-first mode가 필요하면 명시 opt-in과 deprecation을 둔다.
- [x] API-key subject tenant와 tenancy/ALS tenant mismatch가 deny된다.
- [x] direct `can()`에서 subject tenant와 explicit input tenant가 다르면 선택한 tenant contract에 따라 fail closed한다. `tenantMode:'none'`과 명시적 cross-tenant authorization 예외는 ADR과 별도 opt-in 없이는 허용하지 않는다.
- [x] strict `assignRole()`에서 subject, role, binding tenant를 모두 reconcile하고 cross-tenant assignment를 deny한다.
- [x] audit에는 conflict category만 기록하고 raw header/subject attributes는 포함하지 않는다.
- [x] 기존 tenant 없는/global role 동작은 regression test로 보존한다.

검증: 프로필 A/B/C1/C2, resolver matrix, direct-service `can`/`assignRole` matrix, actual HTTP E2E, tenancy structural integration.

비범위: JWT/API key 검증, tenant membership engine, RLS 자체 구현.

### `RBAC-M02` — canonical API-key request source

- 상태: `P0 / DONE`
- 문제: API Keys 0.3.2 Guard의 검증된 canonical writer는 `request.apiKey`다(`api-keys/src/context.ts:3`, `api-keys/src/api-keys.guard.ts:80`). RBAC default/integration resolver는 `request.apiKeyContext ?? request.apiKey`를 선택한다(`src/resolvers/default-http-subject.resolver.ts:112-115`, `src/integrations/api-keys.ts:24-44`). 표준 Guard만으로 외부 요청자가 legacy property를 쓰지는 못하므로 공격 전제는 stale middleware/application code 등 두 in-process writer가 공존하는 배포다. 그 전제에서 상충 값을 신뢰하는 authorization sink가 되므로 trust-boundary hardening을 P0로 처리하며, 실제 dual-writer source가 없다고 확인되면 공개 severity는 낮춰 기록한다.

완료 조건:

- [x] Nestarc canonical source를 `request.apiKey`로 문서화한다.
- [x] 두 property가 모두 있고 identity/tenant가 다르면 fail closed한다.
- [x] 동일한 두 값은 정상 처리한다.
- [x] `apiKeyContext`만 있는 legacy consumer는 명시 fallback으로 유지하고 제거/deprecation target을 기록한다.
- [x] default subject resolver와 `createApiKeySubjectResolver()`가 같은 helper/contract를 사용한다.
- [x] canonical `ApiKeyContext`의 `keyId`, `tenantId`, 기타 identity ID는 opaque exact string이다. legacy fallback의 `id`도 number coercion, case fold, Unicode normalization, `trim()`으로 재해석하지 않는다.
- [x] API Keys 0.3.2 tarball을 strict install한 fixture가 Guard verify/write → conflicting legacy property → RBAC resolution 순서를 재현하고, 이 fixture를 CI/release의 지속 gate로 둔다.
- [x] legacy 우선은 현재 문서화된 동작이므로 precedence 변경/deprecation과 migration note를 CHANGELOG에 남긴다.

검증: 프로필 A/B/D, dual-source conflict tests, packed API Keys consumer. `TEN-ECO-NEXT`는 publish 뒤 외부 확인이며 이 task의 pre-publish 완료 조건이 아니다.

비범위: API key cryptographic verification, `request.apiKey` 작성, API Keys package 코드 변경.

### `RBAC-M03` — custom storage result 방어 검증

- 상태: `P0 / DONE`
- 문제: public custom storage가 반환한 effective role/permission에서 service가 resource는 일부 재확인하지만 tenant/expiry 값을 충분히 재검증하지 않는다. effective row interface에는 subject field가 없으므로 조회된 row만으로 subject provenance를 재검증할 수는 없다(`src/interfaces/storage.ts:31-43`).

완료 조건:

- [x] requested tenant와 다른 effective record는 deny한다.
- [x] tenant request에서 global role을 허용하는 기존 option은 명시적으로만 예외 처리한다.
- [x] global query는 global record만 허용한다.
- [x] built-in 계약과 같이 `expiresAt < now`만 expired이며 `expiresAt === now`는 active로 유지한다. 이 boundary를 바꾸려면 별도 breaking ADR이 필요하다.
- [x] expired, invalid Date, partial/malformed resource pair는 fail closed한다. malformed permission이 현재 normalize 경로에서 이미 deny되는 동작도 regression으로 고정한다.
- [x] `revokedAt`은 현재 effective interface에 없으므로 검증한다고 주장하지 않는다. 필드를 optional/required로 추가할지와 semver를 ADR로 결정한 뒤에만 해당 검증을 추가한다.
- [x] `tenantId: undefined`/`null`과 global record 의미를 interface 및 test로 고정한다.
- [x] role check와 permission check가 같은 defense-in-depth 규칙을 사용한다.
- [x] InMemory/Prisma built-in adapters와 custom adapter contract가 통과한다.

검증: 프로필 A/B/C2/C3, adversarial adapter table, real PostgreSQL contract, global-role/expiry-equality regression.

비범위: 완전히 악성인 storage의 모든 필드/side effect 검증, storage transport 암호화.

## 4. P1 작업 명세

### `RBAC-M04` — runtime enum과 shape fail-closed

- 상태: `P1 / DONE`
- 소유권: inbound caller/config runtime discriminant validation만 담당한다. storage가 반환한 outbound row 검증은 `RBAC-M03`이다.

완료 조건:

- [x] invalid `mode`가 `any`로, invalid tenant mode가 optional로 완화되지 않는다.
- [x] JS/CJS consumer와 `as any` 입력도 stable config error 또는 deny다.
- [x] Date, subject, resource, requirement의 finite/non-empty shape를 경계에서 확인한다.
- [x] 유효한 typed caller의 현재 behavior는 유지된다.
- [x] 범용 validation framework를 도입하지 않고 작은 assertion layer를 사용한다.

검증: unit table, CJS/ESM packed JS consumer, HTTP E2E.

### `RBAC-M05` — subject namespace/source 신뢰 정책

- 상태: `P1 / READY (RBAC-M02 완료)`
- 문제: default resolver가 `request.user.type`을 그대로 받아 fallback namespace를 바꾸거나 user/API-key 동시 source의 우선순위가 의도와 다를 수 있다.

완료 조건:

- [ ] 현재 test가 보존하는 custom `request.user.type` 동작을 호환성 계약으로 분류하고, default `user` 고정으로 바꾸려면 deprecation/migration과 semver를 결정한다.
- [ ] 고정 namespace를 선택한 경우 canonical API key는 `api_key`, default user는 `user`를 사용하고 type override는 custom subject resolver에서만 허용한다.
- [ ] 기존 type override 보존을 선택한 경우 허용 범위, source conflict, deprecation 여부를 명시하고 이를 고정 namespace 보장처럼 문서화하지 않는다.
- [ ] user/API-key/RBAC_SUBJECT 동시 존재 시 authority와 conflict 정책을 문서화한다.
- [ ] 동일 ID가 다른 subject type으로 권한을 공유하지 않는다.

검증: source conflict matrix와 Guard E2E.

비범위: JWT validation, authentication guard ordering의 자동 구성.

### `RBAC-M06` — 식별자 canonicalization 단일화

- 상태: `P1 / READY (RBAC-M01, RBAC-M02 완료)`
- 문제: assertion이 trim한 값을 반환해도 일부 호출자가 버려 write와 can/storage/event의 identity가 다를 수 있다.

완료 조건:

- [ ] tenant, subject, role, binding, resource ID, role key와 permission의 whitespace/empty 정책을 정의한다.
- [ ] API Keys에서 온 identity ID는 `RBAC-M02`의 opaque exact/no-trim 계약을 보존한다. producer contract에 맞는 exact value인지 검증하고 부적합하면 reject하되 consumer가 trim/coerce로 repair하지 않는다.
- [ ] service, both adapters, audit/change events가 같은 canonical value를 사용한다.
- [ ] create→assign→can과 update/delete가 같은 identity를 찾는다.
- [ ] existing non-canonical data의 reject/migration 정책을 기록한다.
- [ ] Unicode normalization/case folding은 별도 결정으로 둔다.

검증: 프로필 A/B/C2/C3, adapter round-trip, event payload.

### `RBAC-M07` — mutation outcome과 best-effort event 정합성

- 상태: `P1 / BLOCKED (RBAC-M06)`
- 문제: duplicate create/assign, missing update, no-op delete/grant/revoke도 성공 audit/change event를 낼 수 있다. storage commit 뒤 audit/publisher를 호출하고 예외를 삼키는 현재 구조에서는 외부 delivery의 transaction 원자성이나 exactly-once를 보장할 수 없다(`src/rbac.service.ts:818-836`).

완료 조건:

- [ ] update는 missing entity를 생성하지 않는다.
- [ ] create/upsert가 필요하면 별도 명시 API/contract다.
- [ ] public `RbacStorage`의 required method/`Promise<void>` 변경은 custom adapter에 breaking이므로, 0.2 patch는 additive optional mutation-result capability와 legacy fallback을 우선 검토한다. required protocol은 deprecation 뒤 0.3 후보로 둔다.
- [ ] storage mutation은 가능한 capability에서 created/updated/deleted/no-op/conflict를 반환한다.
- [ ] built-in/capability adapter에서 실제 변경이 commit된 service invocation당 audit/change publish 시도는 각 최대 한 번이며 best effort다.
- [ ] built-in/capability adapter의 실패/no-op write에는 성공 event가 없다.
- [ ] 결과를 보고할 수 없는 legacy custom adapter fallback은 기존 best-effort 의미와 한계를 문서화하고 deprecation한다. 결과를 추측해 universal no-op 보장을 주장하지 않는다.
- [ ] duplicate create/upsert와 이미 active인 duplicate assignment도 outcome/event matrix에 포함한다.
- [ ] InMemory와 Prisma가 문서화한 concurrency 범위 안에서 동일 의미를 갖는다.

검증: 프로필 A/B/C2/C3, missing/no-op/race table, audit-log integration.

비범위: distributed exactly-once, storage commit과 external publisher의 원자적 delivery, transactional outbox, mutation caller의 관리자 인증/인가.

### `RBAC-M08` — 복수 requirement audit 정합성

- 상태: `P1 / READY`
- 문제: 앞 requirement를 allow로 즉시 기록한 뒤 뒤 requirement가 deny되면 한 요청에 allowed와 denied가 함께 남는다.

완료 조건:

- [ ] request-level 최종 audit를 선택해 모든 requirement 통과 뒤 한 번만 allow를 기록한다.
- [ ] requirement 세부 정보가 필요하면 최종 request outcome 아래 안전한 index/reason으로 포함하고 별도의 `allowed` event로 내지 않는다.
- [ ] deny는 실패 requirement와 안전한 reason만 기록한다.
- [ ] HTTP response와 audit outcome이 일치한다.

검증: stacked class/handler requirements, audit-log adapter, HTTP E2E.

### `RBAC-M09` — Node/Nest/Prisma 지원 계약

- 상태: `P1 / DECISION`

완료 조건:

- [ ] consumer runtime `engines.node` 하한과 maintainer CI/toolchain Node 22/24를 분리한다. 정확한 engine 하한은 packed runtime consumer가 증명한 값만 사용한다.
- [ ] `@types/node`, CI/release, docs가 Node 22/24와 정렬된다.
- [ ] Nest 10/11과 Prisma 5/6/7 peer 각각의 증거/정책을 표로 공개한다.
- [ ] Prisma 5를 유지할지 peer를 6/7로 좁힐지 결정하고 `reflect-metadata`, `rxjs`, optional sibling peer의 실제 지원 범위도 함께 표로 만든다.
- [ ] 모든 Cartesian 조합을 근거 없이 약속하지 않는다.
- [ ] optional sibling peers가 root import를 강제하지 않는 계약을 보존한다.
- [ ] lane 추가만 patch-safe로 취급한다. peer 범위 축소나 `engines` 상향으로 기존 설치를 거부하는 변경은 0.3 migration으로 낸다.

검증: 프로필 A/B/C1/C2/C3/D와 peer metadata.

### `RBAC-M10` — lower-bound compatibility

- 상태: `P1 / BLOCKED (RBAC-M09)`

완료 조건:

- [ ] 유지하기로 한 Nest 10 boundary를 current `0.2.x` packed consumer로 검증한다.
- [ ] 유지하기로 한 Prisma 5 boundary를 real DB contract로 검증한다.
- [ ] existing Nest 11/Prisma 7 modern lane과 Prisma 6 lane을 보존한다.
- [ ] strict install에서 `--force`, `--legacy-peer-deps`, peer bypass를 쓰지 않는다.
- [ ] 지원하지 못한 major는 선언을 축소하고 migration note를 제공한다.

검증: 프로필 D와 `RBAC-M09`에서 선택한 exact lower-bound packed/real-DB lane.

### `RBAC-M11` — CI/release compatibility parity

- 상태: `P1 / BLOCKED (RBAC-M10)`
- 문제: CI는 Prisma 6/7이지만 release는 Prisma 7만 직접 실행한다. 이 task는 compatibility lane과 main/tag ancestry만 소유하며 tarball/subpath/integrity/provenance는 `RBAC-M22`가 소유한다.

완료 조건:

- [ ] 유지하는 legacy Prisma/Nest gate 실패 시 publish가 실행되지 않는다.
- [ ] tag/package version과 target commit ancestry를 확인한다.
- [ ] CI와 release의 선택된 Node/Nest/Prisma lane 차이를 의도된 예외 없이 없앤다.

검증: 프로필 C2/C3/D와 release graph assertion.

### `RBAC-M12A` — lock-safe 개발 dependency advisory 정리

- 상태: `P2 / READY`
- baseline: production 0, full dev tree high 7/low 2.

완료 조건:

- [ ] body-parser, form-data, brace-expansion, postcss/nanoid 등 lock-safe 경로만 minimal update로 정리한다.
- [ ] full audit 잔여 finding별 owner, dependency path, production exposure, 재검토 날짜가 있는 exception을 남긴다.
- [ ] production audit 0을 유지한다.

검증: 프로필 A/D와 두 audit 명령.

### `RBAC-M12B` — esbuild parent-tool 결정

- 상태: `P2 / DECISION (RBAC-M12A)`
- baseline: 설치된 esbuild는 `0.27.7`, fixed 범위는 `>=0.28.1`이고 parent tool의 현재 semver 범위만으로는 lock patch가 아니다.

완료 조건:

- [ ] parent build tool upgrade로 fixed esbuild를 받거나, package/API/build output을 검증한 narrow override 중 하나를 선택한다.
- [ ] 선택 후 프로필 A/B/D와 packed artifact diff를 통과한다.
- [ ] broad override나 audit 숫자만 줄이기 위한 기능 downgrade를 하지 않는다.

### `RBAC-M12C` — Prisma transitive advisory 추적

- 상태: `P2 / BLOCKED (EXT-PRISMA7-AUDIT-FIX)`

완료 조건:

- [ ] fixed Prisma 7 release 또는 안전한 제한 override 근거가 생겼을 때만 `deepmerge-ts` 경로를 변경한다.
- [ ] 그 전에는 dependency path, dev-only exposure, owner, 다음 재검토 날짜를 만료형 exception으로 유지한다.
- [ ] Prisma 7을 6.x로 downgrade하거나 `npm audit fix --force`를 사용하지 않는다.

금지: `npm audit fix --force`, Prisma downgrade, 근거 없는 broad override.

## 5. P2 작업 명세

### `RBAC-M13A` — 문서 권위와 history 정리

- 상태: `P2 / READY`

완료 조건:

- [ ] 이 문서를 canonical maintenance queue로 README에 연결한다. 계획 파일이 package `files` allowlist 밖에 있으면 npm 상대 경로가 아닌 absolute GitHub link를 사용한다.
- [ ] PRD/spec의 이미 구현된 항목과 오래된 `[ ]`에 historical/superseded 배너를 붙인다.
- [ ] 역사 문서를 삭제하지 않는다.

### `RBAC-M13B` — support/trust 문서 동기화

- 상태: `P2 / BLOCKED (RBAC-M01, RBAC-M02, RBAC-M03, RBAC-M09)`

완료 조건:

- [ ] 완료된 support matrix와 actual gate를 README/docs에 동기화한다.
- [ ] tenant/API-key/storage trust boundary와 default/strict 차이를 migration-safe하게 설명한다.
- [ ] 아직 구현되지 않은 미래 동작을 현재 보장처럼 쓰지 않는다.

### `RBAC-M14` — public decision/error 계약 ADR

- 상태: `P2 / BLOCKED (RBAC-M03, RBAC-M07)`

완료 조건:

- [ ] exported requirement reason, decision reason/detail, not-found error의 실제 생성/소비 상태를 표로 만든다.
- [ ] 각 항목을 implement, keep, deprecate, remove 중 하나로 결정한다.
- [ ] unreachable state를 타입에서 허용해 consumer가 잘못 의존하지 않게 한다.
- [ ] 실제 제거는 major/deprecation task로 분리한다.

### `RBAC-M15` — indexed role lookup

- 상태: `P2 / BLOCKED (RBAC-M07)`
- 문제: strict assign validation이 role ID를 찾기 위해 `listRoles({})` 전체 scan을 사용한다.

완료 조건:

- [ ] 0.2 patch는 optional `findRoleById` capability와 `listRoles` fallback/deprecation을 우선 사용해 기존 custom adapter를 깨지 않는다.
- [ ] required method는 adapter migration과 0.3 semver가 준비된 뒤에만 고려한다.
- [ ] both built-in adapters와 optional custom capability contract가 동일 결과를 제공한다.
- [ ] built-in/capability adapter의 assign validation은 전체 role/permission graph를 읽지 않는다. legacy custom adapter fallback은 migration 기간에만 scan을 허용한다.
- [ ] public adapter migration과 performance evidence를 남긴다.

### `RBAC-M16` — transport 계약

- 상태: `P2 / DECISION (RBAC-M01, RBAC-M05)`
- 문제: Guard/decorator/default resolvers는 HTTP request carrier에 고정돼 custom resolver만으로 GraphQL/RPC/WS를 완전히 지원한다고 보기 어렵다.

완료 조건:

- [ ] 현재 지원을 HTTP-only로 명시할지 carrier abstraction을 제공할지 ADR로 결정한다.
- [ ] abstraction을 선택하면 subject/tenant/resource storage를 transport-neutral하게 하고 HTTP adapter를 보존한다.
- [ ] GraphQL/RPC/WS를 실제 E2E 없이 지원한다고 선언하지 않는다.

### `RBAC-M17` — executable examples와 Prisma setup

- 상태: `P2 / READY`

완료 조건:

- [ ] shipped `examples/**`를 clean packed consumer에서 typecheck한다.
- [ ] PostgreSQL URL → generate → migrate → test 절차를 복사 실행 가능하게 만든다.
- [ ] Prisma 6 legacy와 Prisma 7 adapter setup을 명확히 분리한다.
- [ ] 문서 import가 실제 public subpath와 일치한다.

### `RBAC-M18` — SECURITY와 reporting

- 상태: `P2 / BLOCKED (EXT-SECURITY-CHANNEL)`

완료 조건:

- [ ] `SECURITY.md`에 supported release, 비공개 신고 경로, response 범위, 공개 PoC 주의를 기록한다.
- [ ] tenant/header/subject/storage를 trusted/untrusted boundary로 설명한다.
- [ ] 존재하지 않는 이메일/SLA를 발명하지 않는다.
- [ ] private vulnerability reporting과 repository protection을 관리자 권한에서 결정한다.

### `RBAC-M19A` — audit automation과 예외 정책

- 상태: `P2 / BLOCKED (RBAC-M12A, RBAC-M12B)`

완료 조건:

- [ ] PR에서 production audit 0을 요구한다.
- [ ] full dev audit는 만료형 allowlist/risk register로 관리한다.
- [ ] `RBAC-M12C`의 upstream-blocked finding도 owner/review date가 만료되면 실패한다.

### `RBAC-M19B` — workflow dependency hygiene

- 상태: `P2 / READY`

완료 조건:

- [ ] Actions SHA/version 정책과 permissions를 통일한다.
- [ ] Dependabot/Renovate group을 Nest, Prisma, lint/test stack별로 구성한다.
- [ ] provenance 생성, tag ancestry, tarball contract는 각각 현재 baseline/`RBAC-M11`/`RBAC-M22` 소유로 남기고 중복 구현하지 않는다.

## 6. P3와 결정 대기 backlog

### `RBAC-M20A/B/C` — behavior-preserving 분해

- `RBAC-M20A` (`RBAC-M01`, `RBAC-M02`, `RBAC-M05`, `RBAC-M08`, `RBAC-M16` 뒤): 376줄 Guard에서 source resolution, requirement evaluation, audit formatting을 분리한다.
- `RBAC-M20B` (`RBAC-M20A`, `RBAC-M03`, `RBAC-M04`, `RBAC-M06`, `RBAC-M07`, `RBAC-M14` 뒤): 838줄 service에서 validation, decision construction, mutation events를 분리한다.
- `RBAC-M20C` (`RBAC-M20B`, `RBAC-M03`, `RBAC-M07`, `RBAC-M15` 뒤): 608줄 Prisma adapter에서 mapping, query, transaction/error translation을 분리한다.

공통 완료 조건:

- [ ] 한 subtask당 한 PR이다.
- [ ] P0/P1 contract와 public golden output을 먼저 고정한다.
- [ ] move와 behavior change를 같은 commit에 섞지 않는다.
- [ ] coverage/성능/real DB 결과가 악화되지 않는다.

### `RBAC-M21` — workflow hygiene

- 상태: `P3 / BLOCKED (RBAC-M11, RBAC-M19A, RBAC-M19B, RBAC-M22)`
- reusable workflow, job timeout, concurrency, 중복 build/Prisma generate를 정리한다.
- 검증 graph를 바꾸지 않는 refactor로 한정한다.

### `RBAC-M22` — package contract

- 상태: `P3 / BLOCKED (RBAC-M11)`
- 한 번 생성한 `.tgz`를 root, prisma, testing, tenancy, api-keys, audit-log CJS/ESM/types fixture가 소비하고, 검증한 바로 그 파일을 `npm publish <file>`에 전달한다.
- `npm pack --json` allowlist, size budget, docs link와 tarball→published integrity를 검사한다.
- optional peer 미설치 root import와 CJS/ESM parity를 유지한다.
- npm `0.2.1`에 이미 있는 provenance를 보존하고, 게시한 `.tgz`/subject와 attestation이 연결되는지 검증한다.

### `RBAC-M23A` — Nest 12 stable compatibility

- 상태: `P3 / DECISION`
- 2026-08-30 기준 [`@nestjs/core` stable은 `12.0.1`](https://www.npmjs.com/package/%40nestjs/core?activeTab=versions)이다. exact pin한 strict packed consumer로 호환성/변경점을 조사한다.
- peer를 넓히는 구현은 결과 ADR과 semver 검토 뒤 별도 PR로 한다.

### `RBAC-M23B` — Prisma 8 stable compatibility

- 상태: `P3 / BLOCKED (EXT-PRISMA8-STABLE)`
- 현재 [`prisma` next는 `8.0.0-rc.12`](https://www.npmjs.com/package/prisma?activeTab=versions)로 stable milestone을 충족하지 않는다. stable과 공식 migration contract가 나온 뒤 disposable real-DB 스파이크한다.
- stable 전 peer를 넓히지 않는다.

### 결정 대기 후보

| ID | 후보 | 승격 조건 |
| --- | --- | --- |
| `RBAC-B01` | OpenAPI metadata helper | 실제 consumer 요구와 HTTP transport ADR 완료 |
| `RBAC-B02` | permission seed/diff helper | migration ownership과 idempotency 설계 |
| `RBAC-B03` | audit/change publisher failure callback | 관측 요구와 cardinality contract |
| `RBAC-B04` | role tenant 이동 정책 | 실제 migration use case와 cross-tenant risk review |
| `RBAC-B05` | metadata encoder parity | InMemory/Prisma divergence가 재현될 때 |
| `RBAC-B06` | `.DS_Store` ignore | 기존 사용자 파일 소유권 확인 후 |

후보는 합의 전 `READY`가 아니다.

## 7. 검증 프로필

### 프로필 A — 빠른 회귀

```bash
npm run lint
npm run typecheck
npm test
git diff --check
```

### 프로필 B — fresh coverage

```bash
coverage_dir="$(mktemp -d /tmp/rbac-coverage.XXXXXX)"
npm run test:coverage -- --coverage.reportsDirectory="$coverage_dir"
```

ignored/과거 결과 대신 새 report를 사용한다.

### 프로필 C1 — HTTP E2E

```bash
npm run test:e2e
```

P0는 실제 Nest HTTP request source conflict test를 포함한다.

### 프로필 C2 — Prisma 7.10.0 real DB

먼저 disposable PostgreSQL database를 준비한 뒤 두 URL을 같은 database로 지정한다.

```bash
export DATABASE_URL='postgresql://rbac:rbac@127.0.0.1:5432/rbac_test'
export RBAC_PRISMA_DATABASE_URL="$DATABASE_URL"
npm run prisma:generate
npm run prisma:migrate:test
RBAC_PRISMA_CLIENT=modern npm run test:prisma
```

`test:prisma`는 두 DB URL이 모두 없으면 skip한다(`test/integration/prisma-rbac.storage.integration-spec.ts:6-8`). 따라서 exit 0만 보지 말고 integration test가 실제 실행됐고 skip 0인지 결과를 기록한다.

### 프로필 C3 — Prisma 6.19.3 real DB

manifest/lock/node_modules를 바꾸므로 현재 사용자 checkout이 아니라 disposable worktree 또는 CI job에서만 실행한다. `.github/workflows/ci.yml`의 legacy recipe를 그대로 사용한다.

```bash
npm ci
npm run prisma:generate
npm pkg set 'devDependencies.@prisma/client=6.19.3' 'devDependencies.prisma=6.19.3'
npm install --no-save --ignore-scripts --strict-peer-deps --no-audit --no-fund @prisma/client@6.19.3 prisma@6.19.3
npm ls --depth=0 @nestjs/common @nestjs/core @prisma/client prisma
npm run prisma:generate:legacy
npm run prisma:migrate:test:legacy
RBAC_PRISMA_CLIENT=legacy npm run test:prisma
```

두 DB URL은 C2와 같이 설정하고 skip 0을 확인한다. `RBAC-M09`에서 Prisma 5를 유지하기로 한 경우에만 같은 격리 방식의 exact lane을 별도 task에서 추가한다.

### 프로필 D — package/release

```bash
npm run build
npm run test:consumer:modern
npm pack --dry-run --json
npm audit --omit=dev --json
```

`RBAC-M10`/`RBAC-M11` 이후 선택한 legacy compatibility consumer를, `RBAC-M22` 이후 모든 public subpath smoke를 여기에 추가한다.

full `npm audit --json`은 pass gate와 분리해 실행하고 JSON과 exit code를 함께 기록한다. 현재 dev finding이 남아 exit 1인 것은 알려진 snapshot과 일치할 수 있으나, 명령의 nonzero 자체를 profile 실패로 오해하거나 무시하지 않는다. 개수/dependency path가 승인된 만료형 exception과 정확히 일치해야 하며 새 finding이나 production finding은 실패다.

## 8. cross-package 소유권과 release 순서

```text
API Keys: 검증된 ApiKeyContext / request.apiKey 생산
    ↓
RBAC: source conflict 조정, trusted tenant reconciliation, 권한 판단
    ↓
Tenancy ecosystem: published exact tuple E2E
```

- RBAC가 소유: API-key subject mapping, request property precedence, tenant source conflict, role/permission/binding/storage authorization.
- API Keys가 소유: credential verification, canonical `request.apiKey`, tenant ID producer validation.
- tenancy가 소유: published-only exact tuple provenance와 API key → tenant → RBAC → RLS/outbox/jobs/webhook 전체 path.

현재 기준선은 `TEN-M21 / DONE`이다. 역사적 0.15.0 full-flow 완료 뒤 tenancy `v0.16.0`/current main도 RBAC `0.2.1`과 API Keys `0.3.2` published tuple을 검증했다. 이 task를 reopen하거나 앞으로 바뀔 patch의 완료 증거로 재사용하지 않는다.

`TEN-ECO-NEXT`는 이 문서에서 예약한 인계 ID다. 실제 실행 전에 tenancy 계획 문서에 새 외부 작업으로 생성해야 하며, 기존 `TEN-M21`을 이름만 바꾸거나 reopen하지 않는다.

권장 release 순서:

1. `RBAC-M01`과 `RBAC-M02`를 각각 한 세션/한 PR로 구현·검증한다. 독립 PR을 한 RBAC published patch version에 함께 싣는 것은 허용한다.
2. `RBAC-M02`의 API Keys 0.3.2 packed Guard→RBAC fixture를 persistent CI/release gate로 통과시킨 뒤 RBAC를 publish한다.
3. API Keys 변경이 별도로 필요한 경우 API Keys task/PR에서 publish한다. 이는 RBAC pre-publish dependency가 아니다.
4. 필요한 모든 patch가 실제 npm에 존재한 뒤 `TEN-ECO-NEXT / EXTERNAL`이 새 exact tuple을 pin하고 post-publish E2E를 실행한다.

`RBAC-M03`은 외부 package release와 독립적으로 수정·배포할 수 있다.

## 9. 현재 release gate와 향후 활성화 gate

### 9.1 현재 실제 자동 gate

- CI `verify`: Node 22/24에서 install, Prisma generate, lint, typecheck, unit, HTTP E2E, build, unit/contract coverage.
- CI `modern-consumer`: Node 24, Nest 11.2.1/Prisma 7.10.0 strict packed consumer.
- CI `prisma-integration`: PostgreSQL 16에서 Prisma 6.19.3 legacy와 7.10.0 modern real-DB contract.
- release: tag checkout, Node 24, Prisma 7/PostgreSQL 16, tag/package version, lint/typecheck/unit/E2E/build, modern consumer, `npm pack --dry-run`, publish.
- release에는 현재 Prisma 6, coverage, production/full audit가 없다. tag가 main descendant인지와 검증한 동일 `.tgz` 게시도 확인하지 않는다.

### 9.2 이번 조사에서 수동 확인한 증거

- fresh unit/contract coverage: statements 94.8%, branches 87.58%, functions 96.96%, lines 95.53%.
- production audit 0, full dev audit high 7/low 2. full audit exit 1은 알려진 finding을 나타내며 자동 pass gate가 아니다.
- npm `0.2.1` provenance attestation, release/tag/main commit, published timestamp를 수동 확인했다.

이 snapshot은 future release gate가 아니며 새 PR/release에서 재실행·자동화해야 한다.

### 9.3 완료 뒤 활성화할 future gate

- [x] `RBAC-M01`: trusted/default tenant conflict HTTP + direct `can` + strict `assignRole` matrix.
- [x] `RBAC-M02`: canonical/legacy conflict와 API Keys packed Guard→RBAC fixture.
- [x] `RBAC-M03`: adversarial custom storage tenant/expiry contract.
- [x] `RBAC-M04`: invalid runtime discriminant/shape unit table, packed CJS/ESM consumer, HTTP config-error E2E.
- [ ] `RBAC-M09`/`RBAC-M10`: 선택한 Node/Nest/Prisma 하한 lanes.
- [ ] `RBAC-M11`: release legacy compatibility parity와 main/tag ancestry.
- [ ] `RBAC-M19A`: production audit와 만료형 full-audit exception automation.
- [ ] `RBAC-M19B`: Actions/dependency automation policy.
- [ ] `RBAC-M22`: 모든 public subpath, pack-once/publish-same-tarball integrity, 기존 provenance 보존 검증.

향후 gate를 현재 P0 patch의 선행 조건으로 소급 적용하지 않는다.

## 10. 다음 세션 권장 시작점

1. 시작 명령으로 fetch한 뒤 최신 `origin/main` commit과 현재 RBAC-M04 working tree/PR 상태를 기록한다.
2. 완료된 `RBAC-M01`/`RBAC-M02`/`RBAC-M03`/`RBAC-M04`를 반복하지 않고 `RBAC-M05`만 선택한다.
3. 현재 보존 중인 `request.user.type='service_account'` fixture와 user/API-key/RBAC_SUBJECT 동시 source 동작을 표로 만든다.
4. fixed namespace 대 compatibility/deprecation 선택을 ADR로 먼저 기록한 뒤 선택한 source conflict matrix와 Guard E2E를 RED로 고정한다.
5. 이 문서 상태와 작업 기록을 갱신해 별도 patch PR로 종료한다.

세 P0를 한 PR에 묶지 않는다. dependency/toolchain/refactor도 P0 PR에 넣지 않는다. 단, 독립 PR들이 모두 검증됐다면 release 운영상 `RBAC-M01`과 `RBAC-M02`가 한 patch version에 포함될 수 있다.

## 11. 작업 기록

| 날짜 | 작업 ID | 상태 | 시작 ref | 종료 ref/PR/release | 검증 요약 | 다음 행동 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-08-30 | 조사 기준선 | `DONE` | `v0.2.1 / 69bf0e1` | 기준선 확정 | 14 files/205 tests, lint/typecheck, fresh coverage, audits, release/CI/source 검토 | `RBAC-M01` 시작 |
| 2026-09-01 | `RBAC-M01` | `DONE` | `main@2dd5a8c` | uncommitted working tree | authoritative resolver/default-source reconciliation, direct `can()` tenant conflict deny, strict `assignRole()` subject/role/binding reconciliation, HTTP/audit/docs 완료; A/B/C1/C2 PASS | `RBAC-M02` 시작 |
| 2026-09-01 | `RBAC-M02` | `DONE` | `main@224e887` | uncommitted working tree | canonical `request.apiKey`, exact opaque IDs, dual-source conflict deny, API Keys 0.3.2 packed Guard→RBAC CI/release gate, docs/migration 완료; A/B/D PASS | `RBAC-M03` 시작 |
| 2026-09-01 | `RBAC-M03` | `DONE` | `main@b076ff6` | uncommitted working tree | custom effective row를 query tenant/global provenance, finite Date/expiry, resource pair로 재검증하고 resource alias 우회를 차단; A/B/C2/C3와 build PASS | `RBAC-M04` 시작 |
| 2026-09-01 | `RBAC-M04` | `DONE` | `main@13dc26a` | uncommitted working tree | invalid mode/tenantMode와 Date/subject/resource/requirement runtime shape를 작은 assertion layer에서 `RBAC_CONFIG_ERROR` 또는 기존 resolver deny로 fail closed; A/B, HTTP E2E, packed CJS/ESM consumer PASS | `RBAC-M05` 시작 |

### 2026-09-01 RBAC-M01 인계

```text
Task: RBAC-M01
State: DONE
Start ref / end ref: main@2dd5a8c / main@2dd5a8c + uncommitted RBAC-M01 working tree
Changed files: README.md, changelog.md, docs/guards.md, docs/integrations.md, docs/2026-08-30-p0-p3-maintenance-work-plan.md, src/interfaces/decision.ts, src/interfaces/module-options.ts, src/options/strict-rbac-options.ts, src/rbac.guard.ts, src/rbac.service.ts, src/resolvers/default-http-tenant.resolver.ts, src/resolvers/index.ts, test/e2e/rbac-guard.e2e-spec.ts, test/unit/rbac-module.spec.ts, test/unit/rbac-options.spec.ts, test/unit/rbac-service.spec.ts
Contract decision: configured tenantResolver는 기본 authoritative다. string/null은 모든 populated HTTP source와 일치해야 하고 undefined만 consistent HTTP fallback을 허용한다. tenant:'none'은 resolver/source를 건너뛴 explicit global scope다. legacy default-first는 deprecated tenant.resolverMode:'legacy-fallback' opt-in으로만 유지한다. direct can()은 서로 다른 non-null subject/input tenant를 denied_tenant_conflict로 차단하고, strict assignRole()은 subject/binding/role tenant를 write 전에 조정한다.
Commands and exact results: npm run lint PASS; npm run typecheck PASS; npm test PASS (14 files, 219 tests); fresh npm run test:coverage PASS (13 files, 212 tests; statements 94.91%, branches 87.79%, functions 97.03%, lines 95.68%); npm run test:e2e PASS (1 file, 7 tests); Prisma 7.10.0 generate/migration PASS; PostgreSQL 16 real-DB RBAC_PRISMA_CLIENT=modern npm run test:prisma PASS (1 file, 28 tests, skip 0); npm run build PASS; git diff --check PASS.
Unverified paths and reason: Prisma 6/C3는 RBAC-M01 필수 profile이 아니며 adapter 동작을 변경하지 않아 실행하지 않았다.
External PR/release evidence: 없음. 현재 결과는 commit/PR/release 전 working tree다.
Next exact action: RBAC-M02의 request.apiKey canonical writer와 apiKeyContext legacy conflict RED fixture를 추가한다.
```

### 2026-09-01 RBAC-M02 인계

```text
Task: RBAC-M02
State: DONE
Start ref / end ref: main@224e887 / main@224e887 + uncommitted RBAC-M02 working tree
Changed files: .github/workflows/ci.yml, .github/workflows/release.yml, README.md, changelog.md, docs/integrations.md, docs/2026-08-30-p0-p3-maintenance-work-plan.md, examples/api-keys/README.md, examples/api-keys/src/api-key-auth.guard.ts, scripts/verify-modern-consumer.cjs, src/integrations/api-keys.ts, src/resolvers/api-key-subject.resolver.ts, src/resolvers/default-http-subject.resolver.ts, test/unit/default-resolvers.spec.ts, test/unit/integrations.spec.ts
Contract decision: Nestarc API-key canonical source는 request.apiKey다. request.apiKey와 deprecated request.apiKeyContext가 모두 populated면 key/tenant identity를 exact string equality로 조정하고 conflict/invalid shape는 subject resolution에서 fail closed한다. 동일하면 canonical record를 attributes로 선택하며 legacy-only fallback은 다음 breaking minor(0.3.0 earliest)까지 유지한다. keyId/id/tenantId는 trim, number coercion, case fold, Unicode normalization 없이 opaque string으로 처리한다. API Keys 0.3.2 표준 Guard만으로 dual source가 생기지 않으며 stale/custom in-process writer가 legacy property를 추가한 배포가 hardening 전제다.
Commands and exact results: git fetch --prune --tags PASS; initial RED targeted tests 2 files/9 failures 확인; npm run lint PASS; npm run typecheck PASS; npm test PASS (14 files, 227 tests); fresh npm run test:coverage PASS (13 files, 220 tests; statements 94.93%, branches 87.8%, functions 97.07%, lines 95.75%); npm run test:e2e PASS (1 file, 7 tests); npm run build PASS; npm run test:consumer:modern PASS with strict @nestarc/api-keys 0.3.2/Nest 11.2.1/Prisma 7.10.0 install and Guard writer→conflict deny→matching canonical selection; npm pack --dry-run --json PASS (76 entries, 186543 bytes); npm audit --omit=dev --json PASS (production vulnerabilities 0); git diff --check PASS.
Unverified paths and reason: Prisma 6/C3와 Prisma 7 real-DB는 storage/Prisma 코드를 변경하지 않았고 RBAC-M02 필수 profile(A/B/D)이 아니어서 실행하지 않았다.
External PR/release evidence: 없음. API Keys 0.3.2 public tarball을 fixture에서 exact strict install했으나 현재 RBAC 결과는 commit/PR/release 전 working tree다. TEN-ECO-NEXT는 RBAC patch publish 뒤 별도 external task로 남는다.
Next exact action: RBAC-M03의 wrong-tenant, expired, invalid-Date custom storage effective result RED test와 expiresAt === now 회귀를 추가한다.
```

### 2026-09-01 RBAC-M03 인계

```text
Task: RBAC-M03
State: DONE
Start ref / end ref: main@b076ff6 / main@b076ff6 + uncommitted RBAC-M03 working tree
Changed files: docs/2026-08-30-p0-p3-maintenance-work-plan.md, src/interfaces/storage.ts, src/rbac.service.ts, test/contract/storage-contract.ts, test/unit/rbac-service.spec.ts
Contract decision: service는 tenant/global storage query 각각의 결과를 merge 전에 같은 predicate로 재검증한다. tenant query는 exact tenant row만, explicit global query는 tenantId null/undefined global row만 받으며 tenant.allowGlobalRolesInTenant:true만 두 번째 global query를 연다. expiresAt은 null/undefined면 non-expiring, genuine finite Date이면서 now보다 이르면 expired, equality면 active다. resource scope는 양쪽 nullish 또는 populated string pair만 받고 검증된 resourceType/resourceId로 새 comparison object를 만들어 type/id alias 주입을 차단한다. invalid tenant/expiry/resource row는 per-row ineligible로 처리해 ordinary no-match deny를 유지하고 malformed permission은 기존 normalize/storage-error fail-closed 의미를 보존한다. effective interface에 없는 subject provenance와 revokedAt은 검증한다고 주장하거나 필드를 추가하지 않는다.
Commands and exact results: git fetch --prune --tags PASS; GitHub Release v0.2.1과 npm latest 0.2.1 기준선 재확인; baseline npm run typecheck PASS, npm test PASS (14 files, 227 tests); initial RED focused run에서 2 files/75 tests 중 6 failures로 wrong-tenant/expired/global-in-tenant-query 허용 재현; final focused run PASS (2 files, 79 tests); npm run lint PASS; npm run typecheck PASS; npm test PASS (14 files, 245 tests); fresh npm run test:coverage PASS (13 files, 238 tests; statements 94.96%, branches 88.22%, functions 97.09%, lines 95.84%); Prisma 7.10.0 generate/migration PASS, PostgreSQL 16 C2 PASS (1 file, 29 tests, skip 0); disposable worktree Prisma 6.19.3 generate/migration C3 PASS (1 file, 29 tests, skip 0); npm run build PASS; independent bypass/regression review에서 resource type/id alias 우회를 발견·수정했고 role/permission 회귀로 확인; git diff --check PASS.
Unverified paths and reason: HTTP C1과 packed consumer D는 inbound HTTP/package 경로를 바꾸지 않고 RBAC-M03 명시 검증 profile이 A/B/C2/C3이므로 실행하지 않았다. raw RBAC_STORAGE를 직접 소비하는 외부 코드는 RbacService 경계를 우회하므로 이번 방어의 적용 대상이 아니다.
External PR/release evidence: 없음. origin/main, GitHub Release, npm latest는 계속 v0.2.1/69bf0e1 기준이며 현재 결과는 commit/PR/release 전 working tree다.
Next exact action: RBAC-M04의 invalid mode, tenantMode, Date, subject/resource/requirement runtime shape 표와 RED JS/as-any 테스트를 추가한다.
```

### 2026-09-01 RBAC-M04 인계

```text
Task: RBAC-M04
State: DONE
Start ref / end ref: main@13dc26a / main@13dc26a + uncommitted RBAC-M04 working tree
Changed files: changelog.md, docs/2026-08-30-p0-p3-maintenance-work-plan.md, scripts/verify-modern-consumer.cjs, src/rbac.guard.ts, src/rbac.service.ts, src/utils/runtime-validation.ts, test/e2e/rbac-guard.e2e-spec.ts, test/unit/rbac-module.spec.ts, test/unit/rbac-service.spec.ts
Contract decision: direct can()의 명시된 malformed input/subject/resource/requirement, invalid any/all mode, invalid required/optional/none tenantMode, non-Date·invalid Date now는 RbacConfigError(invalid_runtime_shape)다. Guard metadata는 실행 전에 kind/options/mode/tenant/resource/permission·role shape를 검증하고 같은 config error를 HTTP 500 RBAC_CONFIG_ERROR로 매핑한다. subject/resource resolver가 반환한 malformed 값은 기존 RBAC_SUBJECT_MISSING/RBAC_RESOURCE_MISSING deny를 유지한다. input.now와 configured now() 결과, assignRole.expiresAt, revokeRole.revokedAt은 genuine finite Date여야 하며 각 API에서 허용한 null/undefined 의미는 유지한다. whitespace canonicalization과 outbound storage row 검증은 각각 RBAC-M06/RBAC-M03 소유로 남긴다.
Commands and exact results: git fetch --prune --tags PASS; baseline npm run typecheck PASS, npm test PASS (14 files, 245 tests); initial direct-service RED에서 invalid discriminant/Date/subject/resource 15 failures 확인; npm run lint PASS; npm run typecheck PASS; npm test PASS with HTTP port permission (14 files, 275 tests); fresh npm run test:coverage PASS (13 files, 267 tests; statements 94.93%, branches 88.75%, functions 97.27%, lines 95.79%); npm run test:e2e PASS (1 file, 8 tests); npm run build PASS; npm run test:consumer:modern PASS with exact Nest 11.2.1/Prisma 7.10.0/API Keys 0.3.2 and packed CommonJS/ESM runtime validation smokes; git diff --check PASS.
Unverified paths and reason: Prisma C2/C3는 storage/adapters/schema를 변경하지 않았고 RBAC-M04 검증 범위가 unit table, packed JS consumer, HTTP E2E이므로 실행하지 않았다.
External PR/release evidence: 없음. 현재 결과는 commit/PR/release 전 working tree다.
Next exact action: RBAC-M05의 request.user.type='service_account' fixture와 user/API-key/RBAC_SUBJECT 동시 source authority를 표로 만들고 namespace compatibility ADR을 작성한다.
```
