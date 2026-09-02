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
| `EXT-SECURITY-CHANNEL` | `DONE` | GitHub private vulnerability reporting을 `nestarc/rbac`에서 활성화했고 조직의 실제 fallback 주소 `security@nestarc.dev`를 확인했다. pre-1.0 정책은 최신 published minor line만 지원하므로 현재 지원 line은 `0.2.x`다. `main`에는 direct push를 유지하면서 force-push와 deletion을 막는 최소 branch protection을 적용했다. |
| `EXT-PRISMA7-AUDIT-FIX` | `DONE` | Prisma 7.10.0 자체는 아직 `deepmerge-ts@7.1.5`를 고정하지만, `@prisma/config@7.10.0`에만 적용한 `deepmerge-ts@8.0.2` override가 config load/generate, 순환 객체 회귀, PostgreSQL 16 migration과 34/34 storage contract를 통과해 로컬 안전 근거를 충족했다. upstream [issue #30052](https://github.com/prisma/orm/issues/30052)가 해결된 Prisma release로 이동할 때 override를 제거한다. |
| `EXT-PRISMA8-STABLE` | `EXTERNAL` | Prisma 8 stable과 공식 migration contract가 게시된다. 현재 latest 조회값은 `8.0.0-rc.12`이므로 충족되지 않았다. |

이 문서의 matrix 작업은 위 완료 항목을 보존하면서 광고 범위의 하한 증거와 release parity를 닫는 일이다.

## 2. 실행 큐

| 순서 | ID | 우선순위 | 상태 | 크기 | 선행 | 작업 |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | `RBAC-M01` | P0 | `DONE` | L | 없음 | trusted tenant source와 request identity conflict fail-closed |
| 2 | `RBAC-M02` | P0 | `DONE` | M | 없음 | canonical API-key context source와 legacy conflict 처리 |
| 3 | `RBAC-M03` | P0 | `DONE` | L | 없음 | custom storage effective result tenant/expiry 방어 검증 |
| 4 | `RBAC-M04` | P1 | `DONE` | M | 없음 | inbound runtime enum/shape fail-closed validation |
| 5 | `RBAC-M05` | P1 | `DONE` | M | `RBAC-M02` | subject namespace/source 호환성 정책 |
| 6 | `RBAC-M06` | P1 | `DONE` | M | `RBAC-M01`, `RBAC-M02` | 식별자 canonicalization 단일화 |
| 7 | `RBAC-M07` | P1 | `DONE` | L | `RBAC-M06` | mutation outcome과 best-effort event 정합성 |
| 8 | `RBAC-M08` | P1 | `DONE` | S | 없음 | 복수 requirement audit 최종 결과 정합성 |
| 9 | `RBAC-M09` | P1 | `DONE` | M | 없음 | Node/Nest/Prisma 지원·semver 계약 |
| 10 | `RBAC-M10` | P1 | `DONE` | M | `RBAC-M09` | 선택한 Nest/Prisma 하한 compatibility gate |
| 11 | `RBAC-M11` | P1 | `DONE` | M | `RBAC-M10` | CI/release compatibility parity와 tag ancestry |
| 12A | `RBAC-M12A` | P2 | `DONE` | S | 없음 | lock-safe dev advisory 갱신 |
| 12B | `RBAC-M12B` | P2 | `DONE` | S | `RBAC-M12A` | esbuild parent-tool upgrade/제한 override |
| 12C | `RBAC-M12C` | P2 | `DONE` | S | `EXT-PRISMA7-AUDIT-FIX` | Prisma→deepmerge-ts upstream 추적 |
| 13A | `RBAC-M13A` | P2 | `DONE` | S | 없음 | 역사 문서 배너와 canonical queue link |
| 13B | `RBAC-M13B` | P2 | `DONE` | S | `RBAC-M01`, `RBAC-M02`, `RBAC-M03`, `RBAC-M09` | support/trust 문서 동기화 |
| 14 | `RBAC-M14` | P2 | `DONE` | M | `RBAC-M03`, `RBAC-M07` | public decision/error 계약 ADR |
| 15 | `RBAC-M15` | P2 | `DONE` | M | `RBAC-M07` | indexed role lookup으로 전체 scan 제거 |
| 16 | `RBAC-M16` | P2 | `DONE` | M | `RBAC-M01`, `RBAC-M05` | HTTP-only transport 계약 또는 carrier abstraction |
| 17 | `RBAC-M17` | P2 | `DONE` | S | 없음 | examples/Prisma docs executable smoke |
| 18 | `RBAC-M18` | P2 | `DONE` | M | `EXT-SECURITY-CHANNEL` | SECURITY와 reporting 경로 |
| 19A | `RBAC-M19A` | P2 | `DONE` | S | `RBAC-M12A`, `RBAC-M12B` | audit automation과 만료형 예외 정책 |
| 19B | `RBAC-M19B` | P2 | `DONE` | S | 없음 | Actions pinning과 dependency bot |
| 20A | `RBAC-M20A` | P3 | `READY` | M | `RBAC-M01`, `RBAC-M02`, `RBAC-M05`, `RBAC-M08`, `RBAC-M16` | Guard behavior-preserving 분해 |
| 20B | `RBAC-M20B` | P3 | `BLOCKED` | M | `RBAC-M20A`, `RBAC-M03`, `RBAC-M04`, `RBAC-M06`, `RBAC-M07`, `RBAC-M14` | service behavior-preserving 분해 |
| 20C | `RBAC-M20C` | P3 | `BLOCKED` | M | `RBAC-M20B`, `RBAC-M03`, `RBAC-M07`, `RBAC-M15` | Prisma adapter behavior-preserving 분해 |
| 21 | `RBAC-M21` | P3 | `BLOCKED` | S | `RBAC-M11`, `RBAC-M19A`, `RBAC-M19B`, `RBAC-M22` | reusable workflow/timeout/중복 build 정리 |
| 22 | `RBAC-M22` | P3 | `READY` | S | `RBAC-M11` | tarball allowlist·size·subpath·provenance contract |
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
| `RBAC-M10` | consumer runner, Prisma integration | exact Nest 10.4.22 packed consumer와 Prisma 5.22.0 DB lane을 test-first로 추가한다. |
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

- 상태: `P1 / DONE`
- 문제: default resolver가 `request.user.type`을 그대로 받아 fallback namespace를 바꾸거나 user/API-key 동시 source의 우선순위가 의도와 다를 수 있다.

완료 조건:

- [x] 현재 test가 보존하는 custom `request.user.type` 동작을 호환성 계약으로 분류하고, default `user` 고정으로 바꾸려면 deprecation/migration과 semver를 결정한다.
- [x] 고정 namespace는 선택하지 않았다. canonical API key의 `api_key`는 고정하되 default user의 non-empty string type override를 0.x 호환성 계약으로 유지한다.
- [x] 기존 type override의 허용 범위(non-empty string), source conflict, 0.x deprecation 없음과 fixed namespace가 필요할 때의 custom resolver migration을 문서화했다.
- [x] user/API-key/RBAC_SUBJECT 동시 존재 시 exact `(type, id, tenantId)` reconciliation과 agreeing-source precedence를 문서화했다.
- [x] 동일 ID가 다른 subject type으로 권한을 공유하지 않는다.

검증: source conflict matrix와 Guard E2E.

비범위: JWT validation, authentication guard ordering의 자동 구성.

### `RBAC-M06` — 식별자 canonicalization 단일화

- 상태: `P1 / DONE`
- 문제: assertion이 trim한 값을 반환해도 일부 호출자가 버려 write와 can/storage/event의 identity가 다를 수 있다.

완료 조건:

- [x] tenant, subject, role, binding, resource ID, role key와 permission의 whitespace/empty 정책을 정의한다.
- [x] API Keys에서 온 identity ID는 `RBAC-M02`의 opaque exact/no-trim 계약을 보존한다. producer contract에 맞는 exact value인지 검증하고 부적합하면 reject하되 consumer가 trim/coerce로 repair하지 않는다.
- [x] service, both adapters, audit/change events가 같은 canonical value를 사용한다.
- [x] create→assign→can과 update/delete가 같은 identity를 찾는다.
- [x] existing non-canonical data의 reject/migration 정책을 기록한다.
- [x] Unicode normalization/case folding은 별도 결정으로 둔다.

검증: 프로필 A/B/C2/C3, adapter round-trip, event payload.

### `RBAC-M07` — mutation outcome과 best-effort event 정합성

- 상태: `P1 / DONE`
- 문제: duplicate create/assign, missing update, no-op delete/grant/revoke도 성공 audit/change event를 낼 수 있다. storage commit 뒤 audit/publisher를 호출하고 예외를 삼키는 현재 구조에서는 외부 delivery의 transaction 원자성이나 exactly-once를 보장할 수 없다(`src/rbac.service.ts:818-836`).

완료 조건:

- [x] update는 missing entity를 생성하지 않는다.
- [x] create/upsert가 필요하면 별도 명시 API/contract다.
- [x] public `RbacStorage`의 required method/`Promise<void>` 변경은 custom adapter에 breaking이므로, 0.2 patch는 additive optional mutation-result capability와 legacy fallback을 우선 검토한다. required protocol은 deprecation 뒤 0.3 후보로 둔다.
- [x] storage mutation은 가능한 capability에서 created/updated/deleted/no-op/conflict를 반환한다.
- [x] built-in/capability adapter에서 실제 변경이 commit된 service invocation당 audit/change publish 시도는 각 최대 한 번이며 best effort다.
- [x] built-in/capability adapter의 실패/no-op write에는 성공 event가 없다.
- [x] 결과를 보고할 수 없는 legacy custom adapter fallback은 기존 best-effort 의미와 한계를 문서화하고 deprecation한다. 결과를 추측해 universal no-op 보장을 주장하지 않는다.
- [x] duplicate create/upsert와 이미 active인 duplicate assignment도 outcome/event matrix에 포함한다.
- [x] InMemory와 Prisma가 문서화한 concurrency 범위 안에서 동일 의미를 갖는다.

검증: 프로필 A/B/C2/C3, missing/no-op/race table, audit-log integration.

비범위: distributed exactly-once, storage commit과 external publisher의 원자적 delivery, transactional outbox, mutation caller의 관리자 인증/인가.

### `RBAC-M08` — 복수 requirement audit 정합성

- 상태: `P1 / DONE`
- 문제: 앞 requirement를 allow로 즉시 기록한 뒤 뒤 requirement가 deny되면 한 요청에 allowed와 denied가 함께 남는다.

완료 조건:

- [x] request-level 최종 audit를 선택해 모든 requirement 통과 뒤 한 번만 allow를 기록한다.
- [x] requirement 세부 정보가 필요하면 최종 request outcome 아래 안전한 index/reason으로 포함하고 별도의 `allowed` event로 내지 않는다.
- [x] deny는 실패 requirement와 안전한 reason만 기록한다.
- [x] HTTP response와 audit outcome이 일치한다.

검증: stacked class/handler requirements, audit-log adapter, HTTP E2E.

### `RBAC-M09` — Node/Nest/Prisma 지원 계약

- 상태: `P1 / DONE`

완료 조건:

- [x] consumer runtime `engines.node` 하한과 maintainer CI/toolchain Node 22/24를 분리한다. 정확한 engine 하한은 packed runtime consumer가 증명한 값만 사용한다.
- [x] `@types/node`, CI/release, docs가 Node 22/24와 정렬된다.
- [x] Nest 10/11과 Prisma 5/6/7 peer 각각의 증거/정책을 표로 공개한다.
- [x] Prisma 5를 유지할지 peer를 6/7로 좁힐지 결정하고 `reflect-metadata`, `rxjs`, optional sibling peer의 실제 지원 범위도 함께 표로 만든다.
- [x] 모든 Cartesian 조합을 근거 없이 약속하지 않는다.
- [x] optional sibling peers가 root import를 강제하지 않는 계약을 보존한다.
- [x] lane 추가만 patch-safe로 취급한다. peer 범위 축소나 `engines` 상향으로 기존 설치를 거부하는 변경은 0.3 migration으로 낸다.

결정:

- consumer runtime 유지 대상은 Node 22/24다. Node 22.20.0과 24.11.1에서 같은 packed modern consumer를 실행해 CJS/ESM/types와 exact Nest 11.2.1/Prisma 7.10.0/API Keys 0.3.2 tuple을 검증했다.
- 공개 0.2.x에는 `engines`가 없으므로 patch에서 새 `engines.node`를 추가해 이전 설치를 거부하지 않는다. 증명된 하한 `>=22`는 0.3 migration에서 추가한다. maintainer CI와 packed consumer는 Node 22/24, release는 Node 24이며 `@types/node`는 exact 22.20.1로 맞춘다.
- Nest 10과 Prisma 5 peer 하한은 0.2.x에서 유지한다. RBAC-M10에서 exact Nest 10.4.22 packed consumer와 Prisma 5.22.0 PostgreSQL lane을 추가했고 둘 다 strict bypass 없이 통과했다.
- 현재 exact evidence는 Nest 11.2.1 packed, Prisma 7.10.0 packed/DB, Prisma 6.19.3 DB다. `reflect-metadata` 0.2.2와 RxJS 7.8.2는 modern packed tuple에서 증명했으며 기존 peer range는 patch에서 축소하지 않는다.
- optional Nestarc peer는 구조적 adapter 경계와 optional metadata를 유지한다. API Keys 0.3.2는 packed Guard fixture, tenancy 0.16.0은 외부 published tuple, audit-log는 structural unit/HTTP contract만 증거로 기록하고 범위 전체 또는 Cartesian matrix를 주장하지 않는다.

공개 계약: `docs/compatibility.md`. README와 installation 문서는 installable peer range와 exact tested tuple을 구분해 연결한다.

검증: 프로필 A/B/C1/C2/C3/D와 peer metadata.

### `RBAC-M10` — lower-bound compatibility

- 상태: `P1 / DONE`

완료 조건:

- [x] 유지하기로 한 Nest 10 boundary를 current `0.2.x` packed consumer로 검증한다.
- [x] 유지하기로 한 Prisma 5 boundary를 real DB contract로 검증한다.
- [x] existing Nest 11/Prisma 7 modern lane과 Prisma 6 lane을 보존한다.
- [x] strict install에서 `--force`, `--legacy-peer-deps`, peer bypass를 쓰지 않는다.
- [x] 지원하지 못한 major는 선언을 축소하고 migration note를 제공한다.

결정:

- exact Nest 10.4.22, `reflect-metadata` 0.2.2, RxJS 7.8.2, TypeScript 5.9.3, `@types/node` 22.20.1을 Node 24의 저장소 외부 임시 consumer에 설치했다. current 0.2.1 tarball의 sha512/lock provenance를 확인하고 CommonJS, ESM, Nest testing-module DI, declaration smoke를 모두 통과했다.
- exact Prisma client/CLI 5.22.0을 격리된 manifest에 strict peer mode로 설치하고 PostgreSQL 16 migration과 storage contract 34건을 skip 0으로 통과했다. 기존 Prisma 6.19.3/7.10.0 matrix entry와 Nest 11/Prisma 7 modern consumer는 유지한다.
- 두 하한이 모두 우회 없이 통과했으므로 0.2.x의 Nest `>=10 <12`, optional Prisma `>=5 <8` peer 범위를 유지한다. Nest 10 lane은 Prisma를 설치하지 않고 Prisma 5/6 lane은 pinned Nest 11 maintainer 환경을 사용하므로 전체 Cartesian 조합을 주장하지 않는다.

검증: 프로필 D와 `RBAC-M09`에서 선택한 exact lower-bound packed/real-DB lane.

### `RBAC-M11` — CI/release compatibility parity

- 상태: `P1 / DONE`
- 문제: M10 뒤 CI는 Node 22/24, Nest 10/11, Prisma 5/6/7을 검증하지만 release는 Node 24, Nest 11, Prisma 7만 직접 실행했다. 또한 tag/package version만 비교하고 checkout/tag/release target/`origin/main` ancestry는 검증하지 않았다. 이 task는 compatibility lane과 main/tag ancestry만 소유하며 tarball/subpath/integrity/provenance는 `RBAC-M22`가 소유한다.

시작 시 고정한 parity 표:

| gate | CI | 기존 release | 완료된 release |
| --- | --- | --- | --- |
| 기본 verify | Node 22/24 | Node 24 | Node 22/24 |
| modern packed consumer | Node 22/24, Nest 11.2.1, Prisma 7.10.0 | Node 24만 | Node 22/24 |
| Nest lower bound | Node 24, Nest 10.4.22 | 없음 | Node 24, Nest 10.4.22 |
| Prisma real DB | 5.22.0/6.19.3 legacy, 7.10.0 modern | 7.10.0 modern만 | 5.22.0/6.19.3 legacy, 7.10.0 modern |
| release graph | 해당 없음 | tag/package version 비교 | checkout=`tag^{commit}`, tag→release target→`origin/main` ancestry |

완료 조건:

- [x] 유지하는 legacy Prisma/Nest gate 실패 시 publish가 실행되지 않는다.
- [x] tag/package version과 target commit ancestry를 확인한다.
- [x] CI와 release의 선택된 Node/Nest/Prisma lane 차이를 의도된 예외 없이 없앤다.

결정:

- release를 `release-target`, Node 22/24 `verify`, Node 22/24 modern consumer, Nest 10 consumer, Prisma 5/6/7 integration, `publish` job으로 나눴다. `publish.needs`는 앞의 다섯 검증 job을 모두 요구하므로 lower-bound 또는 legacy lane 하나라도 실패하거나 skip되면 npm environment와 publish step에 진입하지 않는다.
- release target 검증은 event 값을 shell에 보간하지 않고 환경 변수와 `execFileSync` argv로 전달한다. `v<package version>` exact match, detached checkout과 dereferenced tag commit 일치, tag commit이 release target의 ancestor인지, target이 `origin/main`의 ancestor인지 순서대로 fail closed한다.
- CI/release의 선택된 compatibility lane은 동일하게 유지한다. workflow 재사용화와 중복 build/generate 제거는 검증 graph가 고정된 뒤 `RBAC-M21`에서 수행한다.

검증: 프로필 C2/C3/D와 release graph assertion.

### `RBAC-M12A` — lock-safe 개발 dependency advisory 정리

- 상태: `P2 / DONE`
- baseline: production 0, full dev tree high 7/low 2.
- 결과: body-parser `2.3.0`, form-data `4.0.6`, brace-expansion `5.0.9`, postcss `8.5.26`, nanoid `3.3.18`로 lockfile만 갱신해 lock-safe finding 5개를 제거했다. 이 단계 직후 잔여는 esbuild low 1과 Prisma/deepmerge-ts high 3뿐이었고 production audit은 계속 0이었다.

완료 조건:

- [x] body-parser, form-data, brace-expansion, postcss/nanoid 등 lock-safe 경로만 minimal update로 정리한다.
- [x] M12A 직후 잔여 finding은 M12B의 `tsup@8.5.1 → esbuild@0.27.7`과 M12C의 `prisma@7.10.0 → @prisma/config@7.10.0 → deepmerge-ts@7.1.5`로 분류했다. 두 owner task가 같은 사용자 요청 세션에서 제한 override와 검증을 완료해 최종 잔여 exception은 없다.
- [x] production audit 0을 유지한다.

검증: 프로필 A/D와 두 audit 명령.

### `RBAC-M12B` — esbuild parent-tool 결정

- 상태: `P2 / DONE (RBAC-M12A)`
- baseline: 설치된 esbuild는 `0.27.7`, fixed 범위는 `>=0.28.1`이고 parent tool의 현재 semver 범위만으로는 lock patch가 아니다.

완료 조건:

- [x] latest `tsup@8.5.1`이 계속 `esbuild:^0.27.0`을 선언하므로 `overrides.tsup.esbuild=0.28.2`를 선택했다. root/global esbuild override가 아니라 tsup parent에만 한정한다.
- [x] 선택 후 프로필 A/B/D를 통과했고, M12 전 HEAD의 esbuild 0.27.7 build와 현재 esbuild 0.28.2 build의 `dist` 전체가 `diff -qr` 기준 동일했다. baseline/current 실제 tarball 77개 파일 비교에서도 의도한 `package.json` override 항목 외 차이가 없었고 packed consumer CJS/ESM/DI/types도 통과했다.
- [x] broad override나 기능 downgrade를 사용하지 않았다. exact override와 lock version을 package smoke에서 고정했다.

결정: tsup parent가 안전한 esbuild 범위를 게시하면 해당 parent upgrade로 override를 제거한다. 그 전에는 `tsup` exact installed version, package smoke, build artifact equality와 profile D를 변경 검토 gate로 사용한다.

### `RBAC-M12C` — Prisma transitive advisory 추적

- 상태: `P2 / DONE (EXT-PRISMA7-AUDIT-FIX)`

완료 조건:

- [x] Prisma upstream [issue #30052](https://github.com/prisma/orm/issues/30052)는 열려 있고 Prisma 7.10.0은 여전히 `deepmerge-ts@7.1.5`를 exact pin한다. `overrides['@prisma/config@7.10.0']['deepmerge-ts']=8.0.2`로 affected parent/version 하나에만 제한했다.
- [x] override 전 경로는 dev-only Prisma CLI config load 경로이고 production audit은 0이었다. local override 근거가 충족되기 전 owner는 RBAC maintainer, 재검토일은 2026-10-01로 분류했으며, override 후 full audit 0으로 잔여 exception은 없다. Prisma 7 upgrade 시 upstream dependency를 재조회하고 fixed release면 override를 제거한다.
- [x] Prisma 7을 유지했고 `npm audit fix --force`를 사용하지 않았다. Prisma config load/generate, deepmerge 순환 객체 회귀, PostgreSQL 16 migration과 modern storage contract 34/34(skip 0)를 통과했다.

금지: `npm audit fix --force`, Prisma downgrade, 근거 없는 broad override.

## 5. P2 작업 명세

### `RBAC-M13A` — 문서 권위와 history 정리

- 상태: `P2 / DONE`

완료 조건:

- [x] 이 문서를 canonical maintenance queue로 README에 연결한다. 계획 파일은 package `files` allowlist 밖에 있으므로 absolute GitHub link를 사용했다.
- [x] PRD/spec 3개와 과거 실행 계획 3개에 historical/superseded 배너를 붙였다. 실행 계획의 오래된 미체크 항목 176개는 역사 기록으로 보존했다.
- [x] 역사 문서를 삭제하지 않았다.

### `RBAC-M13B` — support/trust 문서 동기화

- 상태: `P2 / DONE`

완료 조건:

- [x] 완료된 Node 22/24, Nest 10.4.22/11.2.1, Prisma 5.22.0/6.19.3/7.10.0 support matrix와 실제 CI/release gate를 README와 compatibility 문서에 동기화했다.
- [x] tenant/API-key/storage trust boundary와 plain/strict 차이를 README, Prisma, migration 문서에 migration-safe하게 설명했다.
- [x] 전체 Cartesian matrix, automated audit, pack-once/publish-same-tarball, 미래 release provenance를 현재 보장으로 쓰지 않고 명시적 비보장/future gate로 남겼다.

### `RBAC-M14` — public decision/error 계약 ADR

- 상태: `P2 / DONE`

완료 조건:

- [x] exported requirement reason, decision reason/detail, not-found error의 실제 생성/소비 상태를 표로 만들었다.
- [x] 각 항목을 implement, keep, deprecate, remove 중 하나로 결정했다.
- [x] service/testing-helper producer 타입을 실제 8개 reason과 생성되는 detail/step shape로 좁혀 consumer가 unreachable state에 의존하지 않게 했다.
- [x] 기존 broad compatibility envelope와 HTTP mapping은 유지하고 실제 제거는 별도 breaking/deprecation task 후보로 분리했다.

### `RBAC-M15` — indexed role lookup

- 상태: `P2 / DONE`
- 문제: strict assign validation이 role ID를 찾기 위해 `listRoles({})` 전체 scan을 사용한다.

완료 조건:

- [x] 0.2 patch는 optional `findRoleById` capability와 `listRoles` fallback/deprecation을 우선 사용해 기존 custom adapter를 깨지 않는다.
- [x] required method는 adapter migration과 0.3 semver가 준비된 뒤에만 고려한다.
- [x] both built-in adapters와 optional custom capability contract가 동일 결과를 제공한다.
- [x] built-in/capability adapter의 assign validation은 전체 role/permission graph를 읽지 않는다. legacy custom adapter fallback은 migration 기간에만 scan을 허용한다.
- [x] public adapter migration과 performance evidence를 남긴다.

### `RBAC-M16` — transport 계약

- 상태: `P2 / DONE (RBAC-M01, RBAC-M05)`
- 문제: Guard/decorator/default resolvers는 HTTP request carrier에 고정돼 custom resolver만으로 GraphQL/RPC/WS를 완전히 지원한다고 보기 어렵다.

완료 조건:

- [x] ADR 0003에서 0.2.x 현재 지원을 HTTP-only로 명시하고 carrier abstraction은 별도 feature/release로 연기했다.
- [x] `RbacService`만 transport-neutral authorization boundary로 확정하고, 향후 abstraction은 subject read/write, tenant source reconciliation, resource extraction, error mapping을 분리하면서 HTTP adapter를 보존하도록 acceptance를 고정했다.
- [x] GraphQL/RPC/WS는 실제 adapter와 E2E가 없으므로 지원 대상이 아닌 unverified transport로 공개 문서에 명시했다.

### `RBAC-M17` — executable examples와 Prisma setup

- 상태: `P2 / DONE`

완료 조건:

- [x] shipped `examples/**`의 TypeScript source 7개를 clean packed consumer에서 typecheck한다.
- [x] PostgreSQL URL → generate → migrate → test 절차를 복사 실행 가능하게 만들고 실제 PostgreSQL 16에서 skip 0으로 검증했다.
- [x] Prisma 5/6 legacy client와 Prisma 7 driver adapter setup을 generator, datasource, import, constructor, CLI 절차별로 명확히 분리했다.
- [x] 문서와 예제의 RBAC import를 실제 root 및 `@nestarc/rbac/prisma`, `@nestarc/rbac/integrations/api-keys` public subpath와 일치시켰다.

### `RBAC-M18` — SECURITY와 reporting

- 상태: `P2 / DONE (EXT-SECURITY-CHANNEL)`

완료 조건:

- [x] `SECURITY.md`에 supported release, 비공개 신고 경로, response 범위, 공개 PoC 주의를 기록한다.
- [x] tenant/header/subject/storage를 trusted/untrusted boundary로 설명한다.
- [x] 존재하지 않는 이메일/SLA를 발명하지 않는다.
- [x] private vulnerability reporting과 repository protection을 관리자 권한에서 결정한다.

### `RBAC-M19A` — audit automation과 예외 정책

- 상태: `P2 / DONE`

완료 조건:

- [x] PR과 release에서 production audit 0을 요구한다.
- [x] full dev audit는 finding의 package/severity/range/via/effects/node가 정확히 일치하는 만료형 risk register로 관리한다.
- [x] `RBAC-M12B`/`RBAC-M12C` override 제거 추적과 향후 upstream-blocked finding도 owner/review date가 만료되면 실패한다.

### `RBAC-M19B` — workflow dependency hygiene

- 상태: `P2 / DONE`

완료 조건:

- [x] 모든 GitHub Action을 검토한 v6 full commit SHA로 고정하고 기본 `contents: read`, publish job만 `id-token: write`로 통일한다.
- [x] Dependabot group을 Nest, Prisma, lint/test stack 및 GitHub Actions별 weekly update로 구성한다.
- [x] provenance 생성, tag ancestry, tarball contract는 각각 현재 baseline/`RBAC-M11`/`RBAC-M22` 소유로 남기고 중복 구현하지 않는다.

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

- 상태: `P3 / BLOCKED (RBAC-M22)`
- reusable workflow, job timeout, concurrency, 중복 build/Prisma generate를 정리한다.
- 검증 graph를 바꾸지 않는 refactor로 한정한다.

### `RBAC-M22` — package contract

- 상태: `P3 / READY`
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
| `RBAC-B07` | deprecated decision/error compatibility envelope 제거 | breaking release, published consumer 사용 조사, migration note가 함께 준비될 때 |

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

두 DB URL은 C2와 같이 설정하고 skip 0을 확인한다.

### 프로필 C4 — Prisma 5.22.0 real DB

C3와 같은 격리 recipe를 사용하되 manifest와 exact install을 Prisma 5.22.0으로 맞춘다. CI의 legacy client path는 Prisma 5와 6이 공유한다.

```bash
npm ci
npm run prisma:generate
npm pkg set 'devDependencies.@prisma/client=5.22.0' 'devDependencies.prisma=5.22.0'
npm install --no-save --ignore-scripts --strict-peer-deps --no-audit --no-fund @prisma/client@5.22.0 prisma@5.22.0
npm ls --depth=0 @nestjs/common @nestjs/core @prisma/client prisma
npm run prisma:generate:legacy
npm run prisma:migrate:test:legacy
RBAC_PRISMA_CLIENT=legacy npm run test:prisma
```

두 DB URL은 C2와 같이 설정하고 integration test 34건, skip 0을 확인한다.

### 프로필 D — package/release

```bash
npm run build
npm run test:consumer:modern
npm run test:consumer:nest10
npm pack --dry-run --json
npm audit --omit=dev --json
```

`RBAC-M10`에서 Nest 10 compatibility consumer를 추가했고 `RBAC-M11`에서 이 Node/Nest/Prisma graph와 main/tag ancestry를 publish 선행 gate로 정렬했다. `RBAC-M22` 이후 모든 public subpath smoke를 여기에 추가한다.

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

- CI/release `dependency-audit`: Node 24에서 production audit 0, full dev audit exact risk-register match, 모든 audit/override exception의 owner/review-date 유효성을 검사한다.
- CI `verify`: Node 22/24에서 install, Prisma generate, lint, typecheck, unit, HTTP E2E, build, unit/contract coverage.
- CI `modern-consumer`: Node 22/24, Nest 11.2.1/Prisma 7.10.0 strict packed consumer.
- CI `prisma-integration`: PostgreSQL 16에서 Prisma 5.22.0/6.19.3 legacy와 7.10.0 modern real-DB contract.
- release: tag→target→main ancestry, Node 22/24 source/coverage, Nest 10/11 packed consumer, Prisma 5/6/7 PostgreSQL 16, dependency audit, `npm pack --dry-run`, publish.
- release는 아직 검증한 동일 `.tgz`를 게시하는 pack-once contract를 확인하지 않는다.

### 9.2 이번 조사에서 수동 확인한 증거

- fresh unit/contract coverage: statements 94.8%, branches 87.58%, functions 96.96%, lines 95.53%.
- 최초 조사 snapshot은 production audit 0, full dev audit high 7/low 2였다. M12 이후 현재 snapshot은 production 0, Prisma dev-tool의 `mysql2<3.22.0` 경로 high 2건이다.
- npm `0.2.1` provenance attestation, release/tag/main commit, published timestamp를 수동 확인했다.

최초 snapshot은 역사적 기준선이다. 현재 PR/release는 M19A risk-register 정책으로 새 결과를 매번 재조회한다.

### 9.3 완료 뒤 활성화할 future gate

- [x] `RBAC-M01`: trusted/default tenant conflict HTTP + direct `can` + strict `assignRole` matrix.
- [x] `RBAC-M02`: canonical/legacy conflict와 API Keys packed Guard→RBAC fixture.
- [x] `RBAC-M03`: adversarial custom storage tenant/expiry contract.
- [x] `RBAC-M04`: invalid runtime discriminant/shape unit table, packed CJS/ESM consumer, HTTP config-error E2E.
- [x] `RBAC-M05`: default HTTP subject source conflict matrix, namespace isolation, Guard HTTP E2E.
- [x] `RBAC-M06`: service/InMemory/Prisma identifier round-trip, API-key exact identity, event payload와 non-canonical effective-row fail-closed contract.
- [x] `RBAC-M07`: outcome-aware built-in mutation, missing/no-op/race matrix, audit/change event suppression과 Prisma 6/7 real-DB contract.
- [x] `RBAC-M08`: stacked class/handler request-level final audit, failing requirement index/reason, HTTP/audit-log outcome parity.
- [x] `RBAC-M09`: Node 22/24 packed modern consumer와 support/semver contract.
- [x] `RBAC-M10`: exact Nest 10.4.22 packed consumer와 Prisma 5.22.0 real-DB 하한 lanes.
- [x] `RBAC-M11`: release legacy compatibility parity와 main/tag ancestry.
- [x] `RBAC-M12A`: lock-safe dev dependency patch와 production/full audit snapshot.
- [x] `RBAC-M12B`: tsup-scoped esbuild 0.28.2 override, profile A/B/D와 pre/post artifact equality.
- [x] `RBAC-M12C`: Prisma-config-scoped deepmerge-ts 8.0.2 override, config/generate와 Prisma 7 real-DB contract.
- [x] `RBAC-M13A`: 역사 문서 6개의 권위 배너, 176개 미체크 기록 보존, absolute canonical queue link.
- [x] `RBAC-M13B`: README/docs support·actual gate 및 tenant/API-key/storage trust/default-strict 계약.
- [x] `RBAC-M14`: producer-accurate decision/reason/detail 타입, dormant API deprecation, packed public type fixture와 ADR.
- [x] `RBAC-M15`: optional indexed role-ID lookup, built-in/custom capability contract, legacy scan fallback과 packed public type fixture.
- [x] `RBAC-M16`: 0.2.x Guard/decorator/default resolver HTTP-only 계약, transport-neutral service 경계와 future carrier acceptance ADR.
- [x] `RBAC-M17`: packed tarball의 shipped example 7개 typecheck와 Prisma 6/7 URL→generate→migrate→test 문서/real-DB contract.
- [x] `RBAC-M18`: 최신 published minor `0.2.x` 지원, GitHub private reporting와 `security@nestarc.dev` fallback, subject/tenant/header/API-key/storage trust boundary, 최소 `main` protection.
- [x] `RBAC-M19A`: production audit와 만료형 full-audit exception automation.
- [x] `RBAC-M19B`: Actions/dependency automation policy.
- [ ] `RBAC-M22`: 모든 public subpath, pack-once/publish-same-tarball integrity, 기존 provenance 보존 검증.

향후 gate를 현재 P0 patch의 선행 조건으로 소급 적용하지 않는다.

## 10. 다음 세션 권장 시작점

1. 시작 명령으로 fetch한 뒤 최신 `origin/main` commit과 현재 RBAC-M19A/B working tree/PR 상태를 기록한다.
2. 완료된 `RBAC-M01`–`RBAC-M19B`를 반복하지 않고 실행 가능한 다음 항목 `RBAC-M20A`를 선택한다.
3. exact dependency 완료와 Guard public golden test를 확인한 뒤 source-resolution helper 하나만 move-only로 추출한다.
4. M19 risk register의 review date는 exclusive deadline이다. Dependabot parent-tool/Prisma PR에서는 audit path와 M12 override 제거 가능성을 함께 재검토한다.
5. `RBAC-M21`은 M19A/B가 끝났지만 `RBAC-M22` pack-once/package contract 전까지 계속 blocked다.

세 P0를 한 PR에 묶지 않는다. dependency/toolchain/refactor도 P0 PR에 넣지 않는다. 단, 독립 PR들이 모두 검증됐다면 release 운영상 `RBAC-M01`과 `RBAC-M02`가 한 patch version에 포함될 수 있다.

## 11. 작업 기록

| 날짜 | 작업 ID | 상태 | 시작 ref | 종료 ref/PR/release | 검증 요약 | 다음 행동 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-08-30 | 조사 기준선 | `DONE` | `v0.2.1 / 69bf0e1` | 기준선 확정 | 14 files/205 tests, lint/typecheck, fresh coverage, audits, release/CI/source 검토 | `RBAC-M01` 시작 |
| 2026-09-01 | `RBAC-M01` | `DONE` | `main@2dd5a8c` | uncommitted working tree | authoritative resolver/default-source reconciliation, direct `can()` tenant conflict deny, strict `assignRole()` subject/role/binding reconciliation, HTTP/audit/docs 완료; A/B/C1/C2 PASS | `RBAC-M02` 시작 |
| 2026-09-01 | `RBAC-M02` | `DONE` | `main@224e887` | uncommitted working tree | canonical `request.apiKey`, exact opaque IDs, dual-source conflict deny, API Keys 0.3.2 packed Guard→RBAC CI/release gate, docs/migration 완료; A/B/D PASS | `RBAC-M03` 시작 |
| 2026-09-01 | `RBAC-M03` | `DONE` | `main@b076ff6` | uncommitted working tree | custom effective row를 query tenant/global provenance, finite Date/expiry, resource pair로 재검증하고 resource alias 우회를 차단; A/B/C2/C3와 build PASS | `RBAC-M04` 시작 |
| 2026-09-01 | `RBAC-M04` | `DONE` | `main@13dc26a` | uncommitted working tree | invalid mode/tenantMode와 Date/subject/resource/requirement runtime shape를 작은 assertion layer에서 `RBAC_CONFIG_ERROR` 또는 기존 resolver deny로 fail closed; A/B, HTTP E2E, packed CJS/ESM consumer PASS | `RBAC-M05` 시작 |
| 2026-09-01 | `RBAC-M05` | `DONE` | `main@c3297c8` | uncommitted working tree | custom user type 호환성을 유지하고 valid RBAC subject/user/API-key identity를 exact tuple로 조정해 conflict를 subject missing으로 fail closed; namespace isolation, A/B, Guard E2E와 build PASS | `RBAC-M06` 시작 |
| 2026-09-01 | `RBAC-M06` | `DONE` | `main@7e4f9cf` | uncommitted working tree | service/InMemory/Prisma가 공통 outer-whitespace canonicalization을 사용하고 API-key subject identity는 exact 보존; create→assign→can, update/delete/list, audit/change event, non-canonical storage deny와 A/B/C1/C2/C3 PASS | `RBAC-M07` 시작 |
| 2026-09-01 | `RBAC-M07` | `DONE` | `main@5fc74b0` | uncommitted working tree | optional mutation-result capability로 built-in create/update/delete/grant/revoke/assign의 committed/no-op/conflict를 구분하고 missing update 생성과 no-op 성공 event를 차단; legacy fallback/deprecation 문서화, A/B/C2/C3와 audit-log, build PASS | `RBAC-M08` 시작 |
| 2026-09-01 | `RBAC-M08` | `DONE` | `main@b2f3a59` | uncommitted working tree | stacked requirement audit를 request-final로 변경해 later deny의 선행 allow event를 제거하고 실패 index/reason과 HTTP 결과를 일치시킴; A/B/C1과 audit-log adapter PASS | `RBAC-M09` 결정 시작 |
| 2026-09-01 | `RBAC-M09` | `DONE` | `main@ea34994` | uncommitted working tree | Node 22/24 runtime·maintainer·release 계약, exact peer evidence/semver 표, Node 22 types와 dual packed lane 정렬; A/B/C1/C2/C3/D PASS | `RBAC-M10` exact Nest 10.4.22/Prisma 5.22.0 하한 lane 시작 |
| 2026-09-01 | `RBAC-M10` | `DONE` | `main@183cb77` | uncommitted working tree | exact Nest 10.4.22 strict packed CJS/ESM/DI/types와 Prisma 5.22.0 PostgreSQL 16 34/34 skip 0; A/B/C4/D PASS | `RBAC-M11` CI/release parity와 tag ancestry 시작 |
| 2026-09-01 | `RBAC-M11` | `DONE` | `main@3ea9f61` | uncommitted working tree | release Node 22/24, Nest 10/11, Prisma 5/6/7 parity와 tag→target→main ancestry를 publish 선행 gate로 고정; A/B/C2/C3/D와 release graph PASS | `RBAC-M12A` lock-safe dev advisory 갱신 시작 |
| 2026-09-01 | `RBAC-M12A` | `DONE` | `main@1c4842b` | uncommitted working tree | lock-safe 5경로만 patch해 full audit 9→4, production 0 유지; A/D audit PASS | `RBAC-M12B` tsup/esbuild 결정 |
| 2026-09-01 | `RBAC-M12B` | `DONE` | `main@1c4842b` | uncommitted working tree | tsup-scoped esbuild 0.28.2 override, A/B/D와 packed consumers PASS, 0.27.7 대비 dist byte-identical | `RBAC-M12C` Prisma/deepmerge-ts 결정 |
| 2026-09-01 | `RBAC-M12C` | `DONE` | `main@1c4842b` | uncommitted working tree | @prisma/config 7.10.0-scoped deepmerge-ts 8.0.2 override, full/production audit 0, config/generate/cycle/PG16 34/34 PASS | `RBAC-M13A` 역사 문서 배너와 canonical queue link 시작 |
| 2026-09-02 | `RBAC-M13A` | `DONE` | `main@a51d33f` | uncommitted working tree | 역사 문서 6개 배너, 계획 checkbox 176개 보존, absolute canonical queue link와 package exclusion 확인 | `RBAC-M13B` support/trust 동기화 |
| 2026-09-02 | `RBAC-M13B` | `DONE` | `main@a51d33f` | uncommitted working tree | actual CI/release matrix, plain/strict 및 tenant/API-key/storage trust 계약 동기화; A/D docs 검증 PASS | `RBAC-M14` public decision/error 계약 ADR 시작 |
| 2026-09-02 | `RBAC-M14` | `DONE` | `main@44daec7` | uncommitted working tree | producer-accurate service/testing decision 타입, broad compatibility envelope와 dormant API deprecation ADR; A/B/D와 packed type fixture PASS | `RBAC-M15` indexed role lookup 시작 |
| 2026-09-02 | `RBAC-M15` | `DONE` | `main@05838fc` | uncommitted working tree | optional `findRoleById`, InMemory Map/Prisma PK query, custom capability와 deprecated legacy scan fallback; A/B/C2/D PASS | `RBAC-M16` transport 계약 결정 시작 |
| 2026-09-02 | `RBAC-M16` | `DONE` | `main@8052a9a` | uncommitted working tree | 0.2.x HTTP-only Guard 계약, transport-neutral service 경계, future carrier acceptance; A/C1/D PASS | `RBAC-M17` executable examples/Prisma setup 시작 |
| 2026-09-02 | `RBAC-M17` | `DONE` | `main@c532472` | uncommitted working tree | packed example source 7개 typecheck, Prisma 6/7 copyable setup과 PostgreSQL 16 36/36 skip 0; A/B/C2/C3/D PASS | `RBAC-M19A` audit automation/만료형 예외 정책 시작 (`RBAC-M18`은 external blocker 유지) |
| 2026-09-02 | `RBAC-M18` | `DONE` | `main@e11468b` | uncommitted working tree + GitHub settings | `SECURITY.md`, private reporting enabled, `main` force-push/deletion protection, supported line/reporting/trust boundary 문서 검증 PASS | `RBAC-M19A` audit automation/만료형 예외 정책 시작 |
| 2026-09-02 | `RBAC-M19A` | `DONE` | `main@e9f6a9d` | uncommitted working tree | PR/release production audit 0, exact full-audit risk register, owner/review-date 만료 gate, M12 override 추적; audit policy/unit/A/D PASS | `RBAC-M19B` Actions/dependency automation 시작 |
| 2026-09-02 | `RBAC-M19B` | `DONE` | `main@e9f6a9d` | uncommitted working tree | checkout/setup-node v6 full SHA pin, least-privilege OIDC, Dependabot Nest/Prisma/lint-test/Actions groups; workflow/YAML/A/B/D PASS | `RBAC-M20A` Guard behavior-preserving 분해 시작 |

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

### 2026-09-01 RBAC-M05 인계

```text
Task: RBAC-M05
State: DONE
Start ref / end ref: main@c3297c8 / main@c3297c8 + uncommitted RBAC-M05 working tree
Changed files: README.md, changelog.md, docs/2026-08-30-p0-p3-maintenance-work-plan.md, docs/adr/0001-default-http-subject-source-policy.md, docs/guards.md, docs/spec.md, src/resolvers/default-http-subject.resolver.ts, test/e2e/rbac-guard.e2e-spec.ts, test/unit/default-resolvers.spec.ts, test/unit/rbac-module.spec.ts, test/unit/rbac-service.spec.ts
Contract decision: default request.user mapping은 non-empty string type override를 0.x 호환성 계약으로 유지하고 deprecation을 예약하지 않는다. fixed user namespace가 필요한 consumer는 authoritative custom subjectResolver로 migration한다. default resolver는 valid request.rbacSubject, request.user, canonical/legacy API-key 결과의 exact (type, id, tenantId) tuple을 모두 조정하고 conflict면 undefined로 fail closed한다. agreeing source는 rbacSubject > user > canonical apiKey > legacy fallback 순으로 attributes를 선택한다. populated API-key source 자체가 malformed이거나 canonical/legacy가 충돌하면 다른 valid source 뒤에 숨기지 않는다. canonical API key는 api_key이며 subject type은 binding identity의 일부라 같은 ID의 다른 type과 권한을 공유하지 않는다.
Commands and exact results: git fetch --prune --tags PASS; origin/main 69bf0e1, GitHub Release v0.2.1과 npm latest 0.2.1 기준선 재확인; baseline npm run typecheck PASS; initial focused RED는 2 files/84 tests 중 6 failures로 source precedence 우회 재현; npm run lint PASS; npm run typecheck PASS; npm test PASS (14 files, 289 tests); fresh npm run test:coverage PASS (13 files, 280 tests; statements 95.23%, branches 89.28%, functions 97.31%, lines 96.09%); npm run test:e2e PASS (1 file, 9 tests); npm run build PASS; git diff --check PASS.
Unverified paths and reason: Prisma C2/C3와 packed consumer D는 storage/adapter/package export를 변경하지 않았고 RBAC-M05 명시 검증 범위가 source conflict matrix와 Guard E2E이므로 실행하지 않았다.
External PR/release evidence: 없음. 현재 결과는 commit/PR/release 전 working tree이며 public release/npm 기준선은 계속 v0.2.1이다.
Next exact action: RBAC-M06의 whitespace identifier create→assign→can→event 표와 API-key exact/no-trim fixture를 RED로 추가한다.
```

### 2026-09-01 RBAC-M06 인계

```text
Task: RBAC-M06
State: DONE
Start ref / end ref: main@7e4f9cf / main@7e4f9cf + uncommitted RBAC-M06 working tree
Changed files: README.md, changelog.md, docs/prisma.md, docs/2026-08-30-p0-p3-maintenance-work-plan.md, src/utils/canonicalization.ts, src/rbac.service.ts, src/adapters/in-memory-rbac.storage.ts, src/adapters/prisma-rbac.storage.ts, test/contract/storage-contract.ts, test/unit/rbac-service.spec.ts
Contract decision: tenant, non-API-key subject type/ID, role ID/key, binding ID, resource type/ID와 permission은 경계에서 outer whitespace를 한 번 제거하고 whitespace-only를 reject한다. service와 두 built-in adapter는 같은 helper/permission normalizer를 사용하며 query/write/decision/audit/change event에 canonical value를 전달한다. exact `type === 'api_key'` subject의 ID와 source tenant 값은 non-empty인지 검증하되 trim/coerce하지 않아 `" Key_Å "`와 `"Key_Å"`를 다른 identity로 유지한다. 일반 tenant scope는 canonical tenant ID를 사용한다. case folding과 Unicode normalization은 하지 않는다. 기존 Prisma row는 자동 수정하거나 alias하지 않으며 collision inventory 뒤 명시 migration해야 한다. non-canonical effective identifiers는 authorization에서 제외하고 non-canonical/malformed stored permission은 storage error로 fail closed한다.
Commands and exact results: initial focused RED observed (2 files/105 tests 중 2 failures: adapter가 spaced tenant/key를 저장했고 service role-key assignment가 생성 role을 찾지 못함); npm run typecheck PASS; npm run lint PASS; npm test PASS (14 files, 301 tests); fresh npm run test:coverage PASS (13 files, 292 tests; statements 95.66%, branches 89.9%, functions 98.53%, lines 96.49%); npm run test:e2e PASS (1 file, 9 tests); npm run build PASS; Prisma 7.10.0 generate/migration와 PostgreSQL 16 C2 PASS (1 file, 31 tests, skip 0); disposable exact Prisma 6.19.3 generate/migration와 PostgreSQL 16 C3 PASS (1 file, 31 tests, skip 0); git diff --check PASS. 최초 sandbox npm test는 로컬 listen EPERM으로 실패했고 동일 명령을 허용된 환경에서 재실행해 301/301 PASS를 확인했다.
Unverified paths and reason: packed consumer/package dry-run/audit 프로필 D는 public export나 package metadata를 변경하지 않고 RBAC-M06 명시 검증 profile이 A/B/C2/C3와 event payload이므로 실행하지 않았다.
External PR/release evidence: 없음. 현재 결과는 commit/PR/release 전 working tree다. C2/C3 검증용 임시 PostgreSQL 16 container와 Prisma 6 checkout은 검증 뒤 제거했다.
Next exact action: RBAC-M07의 create-existing, update-missing/no-change, duplicate assign, grant-existing, revoke-absent/already-revoked outcome/event matrix를 RED로 추가한다.
```

### 2026-09-01 RBAC-M07 인계

```text
Task: RBAC-M07
State: DONE
Start ref / end ref: main@5fc74b0 / main@5fc74b0 + uncommitted RBAC-M07 working tree
Changed files: README.md, changelog.md, docs/integrations.md, docs/prisma.md, docs/spec.md, docs/2026-08-30-p0-p3-maintenance-work-plan.md, src/interfaces/storage.ts, src/rbac.service.ts, src/adapters/in-memory-rbac.storage.ts, src/adapters/prisma-rbac.storage.ts, test/contract/storage-contract.ts, test/integration/prisma-rbac.storage.integration-spec.ts, test/unit/audit-log-integration.spec.ts, test/unit/rbac-service.spec.ts
Contract decision: 0.2.x public RbacStorage required methods와 Promise<void> 반환형은 유지하고 optional RbacStorage.mutationResults/RbacStorageMutationCapability를 추가한다. capability는 created/updated/deleted/no-op/conflict와 필요한 role/binding value를 반환한다. RbacService.updateRole()은 capability adapter에서 missing role을 생성하지 않고 RbacRoleNotFoundError를 던지며 storage.upsertRole()은 별도 explicit legacy upsert로 남는다. createRole()은 tenant/key upsert 호환성을 유지해 new는 created, existing changed는 updated, identical은 no-op다. active duplicate assign/grant와 missing/already-applied delete/revoke는 no-op이고 성공 audit/change event가 없다. built-in/capability adapter는 실제 committed service invocation당 audit와 change publish를 각각 최대 한 번 시도한다. capability 없는 custom adapter는 결과를 추측하지 않는 기존 result-less fallback을 0.2.x에서 유지하되 deprecated이며 0.3 removal candidate다. audit/publisher는 storage commit 뒤 best effort이고 실패를 삼키므로 storage와 atomic하지 않으며 distributed exactly-once/outbox를 보장하지 않는다. Prisma는 unique race 뒤 재조회해 identical concurrent role create/assignment 하나만 created, 나머지는 no-op으로 보고한다.
Commands and exact results: git fetch --prune --tags PASS; baseline npm run typecheck PASS; initial focused RED는 1 file/87 tests 중 update-missing이 role을 생성해 1 failure 확인; npm run lint PASS; npm run typecheck PASS; npm test PASS with HTTP port permission (14 files, 305 tests); fresh npm run test:coverage PASS (13 files, 296 tests; statements 94.28%, branches 87.22%, functions 96.92%, lines 95.47%); npm run build PASS; Prisma 7.10.0 generate/migration와 PostgreSQL 16 C2 PASS (1 file, 34 tests, skip 0); disposable exact Prisma 6.19.3 generate/migration와 PostgreSQL 16 C3 PASS (1 file, 34 tests, skip 0); audit-log integration committed-only event test PASS; git diff --check PASS. 최초 sandbox npm test는 로컬 listen EPERM으로 HTTP 9 tests가 실패했으나 unit/contract 292 tests는 통과했고, 동일 전체 명령을 허용된 환경에서 재실행해 305/305 PASS를 확인했다. 최초 sandbox C2는 localhost connect EPERM이었고 허용된 환경에서 migration과 34/34 PASS를 확인했다.
Unverified paths and reason: packed consumer/package dry-run/audit 프로필 D는 package export 경로와 metadata를 바꾸지 않고 RBAC-M07 명시 검증 profile이 A/B/C2/C3와 audit-log integration이므로 실행하지 않았다.
External PR/release evidence: 없음. origin/main은 69bf0e1이고 현재 결과는 commit/PR/release 전 working tree다. C2/C3 검증용 임시 PostgreSQL 16 container와 Prisma 6 worktree는 검증 뒤 제거했다.
Next exact action: RBAC-M08의 첫 requirement allow/다음 requirement deny stacked request에서 request-level 최종 audit 하나만 남는 RED Guard/audit fixture를 추가한다.
```

### 2026-09-01 RBAC-M08 인계

```text
Task: RBAC-M08
State: DONE
Start ref / end ref: main@b2f3a59 / main@b2f3a59 + uncommitted RBAC-M08 working tree
Changed files: changelog.md, docs/integrations.md, docs/2026-08-30-p0-p3-maintenance-work-plan.md, src/rbac.guard.ts, test/e2e/rbac-guard.e2e-spec.ts, test/unit/rbac-module.spec.ts
Contract decision: Guard authorization audit은 stacked class/handler requirement 각각의 중간 결과가 아니라 request-level 최종 결과다. allow decision은 모든 requirement가 통과할 때까지 보류하며, 단일 requirement의 기존 allowed metadata는 유지하고 복수 allow는 allowed_all_requirements 아래 zero-based requirementIndex와 safe reason만 모은 이벤트 하나로 기록한다. 복수 requirement의 tenant scope가 다르면 aggregate event의 top-level tenantId는 undefined다. deny는 실패한 requirement의 zero-based requirementIndex와 기존 safe requirement/reason/details만 기록하며 선행 allow event를 남기지 않는다. audit logger 실패가 HTTP 결과를 바꾸지 않는 기존 best-effort 계약은 유지한다.
Commands and exact results: git fetch --prune --tags PASS; initial RED focused Guard test는 1 test failure로 allow 뒤 deny에서 audit 2건 기록을 재현; npm run lint PASS; npm run typecheck PASS; npm test PASS (14 files, 309 tests); fresh npm run test:coverage PASS (13 files, 299 tests; statements 94.32%, branches 87.26%, functions 96.95%, lines 95.5%; src/rbac.guard.ts branches 95.45%); npm run test:e2e PASS (1 file, 10 tests); audit-log integration targeted PASS (1 file, 3 tests); git diff --check PASS.
Unverified paths and reason: Prisma C2/C3와 packed consumer D는 storage/adapter/package export를 변경하지 않았고 RBAC-M08 명시 검증 범위가 A/B/C1과 audit-log adapter이므로 실행하지 않았다.
External PR/release evidence: 없음. origin/main은 69bf0e1이고 현재 결과는 commit/PR/release 전 working tree다.
Next exact action: RBAC-M09에서 consumer runtime Node 하한과 maintainer toolchain, Nest/Prisma/sibling peer 선언·증거·semver를 분리한 ADR 표를 작성한다.
```

### 2026-09-01 RBAC-M09 인계

```text
Task: RBAC-M09
State: DONE
Start ref / end ref: main@ea34994 / main@ea34994 + uncommitted RBAC-M09 working tree
Changed files: .github/workflows/ci.yml, README.md, changelog.md, docs/compatibility.md, docs/installation.md, docs/2026-08-30-p0-p3-maintenance-work-plan.md, package.json, package-lock.json, test/unit/package-smoke.spec.ts
Contract decision: consumer runtime 유지 대상은 Node 22/24이고 maintainer source/packed CI도 두 line, release는 Node 24, type baseline은 exact @types/node 22.20.1이다. Node 22.20.0 packed consumer가 하한을 증명했지만 공개 0.2.x에는 engines가 없으므로 patch에서 새 설치 제한을 만들지 않고 engines.node >=22는 0.3 migration에 추가한다. Nest >=10 <12와 optional Prisma >=5 <8은 0.2.x에서 유지하며 RBAC-M10이 exact Nest 10.4.22/Prisma 5.22.0을 strict 검증한다. reflect-metadata/RxJS와 optional Nestarc peer도 install range와 exact evidence를 분리하고 범위 전체 Cartesian 지원을 주장하지 않는다. optional Prisma/Nestarc peer는 root runtime import를 강제하지 않는다.
Commands and exact results: git fetch --prune --tags PASS; origin/main 69bf0e1, v0.2.1 f24e4be tag object -> 69bf0e1 commit, GitHub Release v0.2.1 published 2026-08-30T04:52:45Z, npm latest 0.2.1 published 2026-08-30T04:54:28.735Z; baseline npm run lint PASS, npm run typecheck PASS, npm test PASS (14 files, 309 tests); @types/node 22.20.1 install/lock PASS; focused package metadata test PASS (1 file, 4 tests); post-change lint/typecheck PASS; strict packed modern consumer PASS on Node 24.11.1 and Node 22.20.0 with identical sha512 integrity, exact Nest 11.2.1/Prisma 7.10.0/API Keys 0.3.2, CJS/ESM/types/runtime validation; npm run test:e2e PASS (1 file, 10 tests); fresh coverage PASS (13 files, 299 tests; statements 94.32%, branches 87.26%, functions 96.95%, lines 95.5%); Prisma 7.10.0 PostgreSQL 16 PASS (1 file, 34 tests, skip 0); isolated Prisma 6.19.3 PostgreSQL 16 PASS (1 file, 34 tests, skip 0); npm pack --dry-run --json PASS (77 files, compatibility doc included); npm audit --omit=dev --json PASS (0 vulnerabilities); git diff --check PASS.
Unverified paths and reason: Nest 10.4.22와 Prisma 5.22.0 lower bounds는 이 decision task에서 exact target만 선택했으며 실제 packed/DB gate는 RBAC-M10 소유다. 모든 Node/Nest/Prisma Cartesian 조합과 sibling peer range 전체는 의도적으로 지원 증거로 주장하지 않는다.
External PR/release evidence: 현재 공개 기준은 GitHub/npm v0.2.1이고 RBAC-M09 결과는 commit/PR/release 전 working tree다. tenancy 0.16.0 external published tuple evidence는 기존 TEN-M21 기록을 참조하며 이번 task에서 재실행하지 않았다.
Next exact action: RBAC-M10에서 exact Nest 10.4.22 strict packed consumer RED fixture와 격리된 Prisma 5.22.0 PostgreSQL 16 real-DB lane을 추가한다.
```

### 2026-09-01 RBAC-M10 인계

```text
Task: RBAC-M10
State: DONE
Start ref / end ref: main@183cb77 / main@183cb77 + uncommitted RBAC-M10 working tree
Changed files: .github/workflows/ci.yml, changelog.md, docs/compatibility.md, docs/installation.md, docs/2026-08-30-p0-p3-maintenance-work-plan.md, package.json, scripts/verify-nest10-consumer.cjs, test/unit/package-smoke.spec.ts
Contract decision: 0.2.x의 Nest >=10 <12와 optional Prisma >=5 <8 peer 범위를 유지한다. exact Nest 10.4.22 packed consumer는 Node 24에서 reflect-metadata 0.2.2, RxJS 7.8.2, TypeScript 5.9.3, @types/node 22.20.1을 strict install하고 tarball/lock sha512 provenance, CJS, ESM, Nest testing-module DI, declaration을 검증한다. exact Prisma client/CLI 5.22.0은 Prisma 6과 같은 legacy engine path로 격리된 manifest와 PostgreSQL 16에서 검증한다. Nest 10 lane은 Prisma를 설치하지 않고 Prisma 5/6 lane은 pinned Nest 11 maintainer 환경을 사용하므로 전체 Cartesian matrix를 주장하지 않는다. release parity와 ancestry는 RBAC-M11 소유다.
Commands and exact results: git fetch --prune --tags PASS after sandbox FETCH_HEAD permission retry; initial focused RED package contract 1/5 failure 확인; focused final package contract PASS (1 file, 5 tests); npm run lint PASS; npm run typecheck PASS; npm test PASS (14 files, 310 tests); fresh npm run test:coverage PASS (13 files, 300 tests; statements 94.32%, branches 87.26%, functions 96.95%, lines 95.5%); npm run test:consumer:nest10 PASS on Node 24.11.1 with exact Nest 10.4.22 and strict install, CJS/ESM/DI/types; isolated exact Prisma 5.22.0 install/generate/migration PASS and PostgreSQL 16 npm run test:prisma PASS (1 file, 34 tests, skip 0); existing npm run test:consumer:modern PASS with exact Nest 11.2.1/Prisma 7.10.0/API Keys 0.3.2; npm pack --dry-run --json PASS (77 files, 245180 bytes); npm audit --omit=dev --json PASS (0 vulnerabilities); CI YAML parse PASS; git diff --check PASS. 최초 sandbox consumer/pack은 npm cache EPERM, Prisma migration은 localhost restriction, final full test는 HTTP listen EPERM으로 실패해 같은 명령을 허용된 환경에서 재실행했다. 최초 Nest 10 fixture declaration smoke는 @types/node 부재를 발견했고 exact 22.20.1을 명시해 통과시켰다.
Unverified paths and reason: Prisma 6.19.3/7.10.0 real-DB lane은 workflow entry와 구현을 변경하지 않아 이번 M10 필수 profile(D와 exact lower-bound C4)에서 재실행하지 않았다. Prisma 7 exact packed consumer는 재실행했다. Nest 10 on Node 22와 모든 Nest/Prisma/Node Cartesian 조합은 지원 증거로 주장하지 않는다. release의 lower-bound publish blocking parity와 tag ancestry는 RBAC-M11 소유다.
External PR/release evidence: 없음. fetch 뒤 origin/main과 v0.2.1 commit은 69bf0e1이고 현재 결과는 commit/PR/release 전 working tree다. 검증용 PostgreSQL 16 container와 격리 복사본은 완료 뒤 제거했다.
Next exact action: RBAC-M11에서 CI/release의 Node/Nest/Prisma lane과 main/tag ancestry 차이만 표로 만든 뒤 lower-bound failure가 publish를 차단하도록 release graph를 정렬한다.
```

### 2026-09-01 RBAC-M11 인계

```text
Task: RBAC-M11
State: DONE
Start ref / end ref: main@3ea9f61 / main@3ea9f61 + uncommitted RBAC-M11 working tree
Changed files: .github/workflows/release.yml, docs/2026-08-30-p0-p3-maintenance-work-plan.md, package.json, scripts/verify-release-target.cjs, test/unit/package-smoke.spec.ts
Contract decision: release는 CI와 같은 Node 22/24 verify와 modern consumer, Node 24 Nest 10.4.22 consumer, Prisma 5.22.0/6.19.3 legacy 및 7.10.0 modern PostgreSQL lanes를 실행한다. npm publish job은 release-target/verify/modern-consumer/nest10-consumer/prisma-integration을 모두 needs로 요구한다. release-target은 v<package version> exact match, checkout=tag commit, tag→release target→origin/main ancestry를 순서대로 검증하며 event ref는 shell interpolation 없이 argv로 전달한다. tarball allowlist/subpath/integrity/provenance는 RBAC-M22, reusable workflow와 중복 제거는 RBAC-M21 소유로 남긴다.
Commands and exact results: git fetch --prune --tags PASS after sandbox FETCH_HEAD permission retry; GitHub Release/npm baseline both v0.2.1 and origin/main=v0.2.1^{commit}=69bf0e1 확인; initial focused RED package contract 1/6 failure 확인; focused final package contract PASS (1 file, 7 tests); npm run lint PASS; npm run typecheck PASS; npm test PASS (14 files, 312 tests); fresh npm run test:coverage PASS (13 files, 302 tests; statements 93.78%, branches 86.98%, functions 96.67%, lines 94.9%); release workflow YAML parse PASS; isolated tag checkout release-target CLI PASS; Prisma 7.10.0 generate/migration and PostgreSQL 16 contract PASS (1 file, 34 tests, skip 0); isolated exact Prisma 6.19.3 install/generate/migration and PostgreSQL 16 contract PASS (1 file, 34 tests, skip 0); npm run build PASS; modern consumer PASS on Node 24.11.1 with exact Nest 11.2.1/Prisma 7.10.0/API Keys 0.3.2; Nest 10 consumer PASS with exact Nest 10.4.22; npm pack --dry-run --json PASS (77 files, 245198 bytes); npm audit --omit=dev --json PASS (0 vulnerabilities); git diff --check PASS. 최초 full test는 sandbox HTTP listen EPERM으로 실패해 같은 npm test를 허용된 환경에서 재실행했다.
Unverified paths and reason: 실제 GitHub release event와 Node 22 runner는 새 release를 만들지 않아 실행하지 않았다. workflow graph/contract test로 publish 선행 관계와 Node 22 lane parity를 검증했다. Prisma 5.22.0 real-DB는 직전 RBAC-M10에서 34/34 skip 0으로 검증했고 M11은 동일 recipe를 release graph에 복제했으므로 재실행하지 않았다.
External PR/release evidence: 현재 공개 기준은 GitHub/npm v0.2.1이고 tag targetCommitish는 main, publishedAt은 2026-08-30T04:52:45Z다. RBAC-M11 결과는 commit/PR/release 전 working tree다. 검증용 PostgreSQL 16 container와 격리 복사본은 완료 뒤 제거했다.
Next exact action: RBAC-M12A에서 production/full audit snapshot을 다시 만들고 lock-safe finding만 minimal lock update로 정리한다.
```

### 2026-09-01 RBAC-M12A 인계

```text
Task: RBAC-M12A
State: DONE
Start ref / end ref: main@1c4842b / main@1c4842b + uncommitted RBAC-M12A/B/C working tree
Changed files: package-lock.json, docs/2026-08-30-p0-p3-maintenance-work-plan.md
Contract decision: production dependency 경로는 변경하지 않고 body-parser 2.3.0, form-data 4.0.6, brace-expansion 5.0.9, postcss 8.5.26, nanoid 3.3.18만 현재 parent range 안에서 lock patch했다. M12A 직후 full audit은 9건(high 7/low 2)에서 4건(high 3/low 1)으로 줄었고, 잔여 owner는 M12B esbuild와 M12C Prisma/deepmerge-ts로 분리했다.
Commands and exact results: npm update ... --package-lock-only PASS; M12A 직후 npm audit --json exit 1 with 4 dev-only findings; npm audit --omit=dev --json PASS (0); 최종 npm ci PASS (461 packages installed, audit 0); final profile A PASS 결과는 아래 M12B/C combined validation에 기록한다.
Unverified paths and reason: M12A 단독 시점의 A/B/D 전체는 뒤 task가 같은 사용자 요청 세션에서 연속 수행되어 최종 dependency tree에서 실행했다.
External PR/release evidence: 없음. dependency metadata는 npm registry와 audit advisory를 조회했으며 현재 결과는 commit/PR/release 전 working tree다.
Next exact action: RBAC-M12B에서 tsup parent에만 제한한 fixed esbuild를 검증한다.
```

### 2026-09-01 RBAC-M12B 인계

```text
Task: RBAC-M12B
State: DONE
Start ref / end ref: main@1c4842b / main@1c4842b + uncommitted RBAC-M12A/B/C working tree
Changed files: package.json, package-lock.json, test/unit/package-smoke.spec.ts, docs/2026-08-30-p0-p3-maintenance-work-plan.md
Contract decision: latest tsup 8.5.1은 esbuild ^0.27.0을 유지하므로 root/global override가 아닌 overrides.tsup.esbuild=0.28.2를 사용한다. exact override와 resolved lock version을 package smoke로 고정하고 tsup이 안전 범위를 게시하면 parent upgrade와 함께 제거한다. 기능 downgrade와 npm audit fix --force는 사용하지 않았다.
Commands and exact results: npm ls/npm explain에서 tsup 8.5.1 → esbuild 0.28.2 overridden, bundle-require >=0.18 peer와 Vite ^0.27 || ^0.28 peer 만족 확인; profile A PASS (lint, typecheck, 14 files/313 tests, diff-check); fresh profile B PASS (13 files/303 tests; statements 93.78%, branches 86.98%, functions 96.67%, lines 94.9%); build PASS; modern packed consumer PASS (Nest 11.2.1/Prisma 7.10.0/API Keys 0.3.2); Nest 10.4.22 packed consumer PASS; npm pack --dry-run --json PASS (77 files, 245249 bytes); isolated M12 전 esbuild 0.27.7 build와 esbuild 0.28.2 build의 dist diff -qr PASS with no differences; baseline/current actual tarball diff는 package.json의 의도한 override 항목만 표시; both audits 0.
Unverified paths and reason: 실제 Node 22 runner는 새 workflow run을 만들지 않아 실행하지 않았다. local profile D와 두 exact packed consumer는 Node 24.11.1에서 통과했다.
External PR/release evidence: esbuild 0.28.2 release와 tsup 8.5.1 current manifest를 조회했으며 현재 결과는 commit/PR/release 전 working tree다.
Next exact action: RBAC-M12C에서 Prisma config parent에만 제한한 deepmerge-ts 8 override를 검증한다.
```

### 2026-09-01 RBAC-M12C 인계

```text
Task: RBAC-M12C
State: DONE
Start ref / end ref: main@1c4842b / main@1c4842b + uncommitted RBAC-M12A/B/C working tree
Changed files: package.json, package-lock.json, test/unit/package-smoke.spec.ts, docs/2026-08-30-p0-p3-maintenance-work-plan.md
Contract decision: Prisma 7.10.0과 @prisma/config 7.10.0은 유지하고 overrides['@prisma/config@7.10.0']['deepmerge-ts']=8.0.2를 적용한다. 이 exact parent/version 범위를 벗어난 Prisma upgrade에는 override를 자동 확장하지 않으며 upstream issue #30052의 fixed Prisma release가 나오면 override를 제거한다. dev-only CLI config path이고 package consumer production audit은 계속 0이다.
Commands and exact results: npm ls/npm explain에서 prisma 7.10.0 → @prisma/config 7.10.0 → deepmerge-ts 8.0.2 overridden 확인; deepmerge cyclic object regression PASS; Prisma config load와 npm run prisma:generate PASS; PostgreSQL 16에서 prisma:migrate:test PASS; RBAC_PRISMA_CLIENT=modern npm run test:prisma PASS (1 file, 34 tests, skip 0); final npm audit --json PASS (0), npm audit --omit=dev --json PASS (0); package override focused smoke PASS (1 file, 8 tests); temporary PostgreSQL container removed.
Unverified paths and reason: Prisma 5/6은 override가 exact @prisma/config 7.10.0에만 적용되므로 재실행하지 않았다. upstream Prisma 자체의 deepmerge-ts bump는 아직 게시되지 않았다.
External PR/release evidence: Prisma upstream issue #30052는 2026-09-01 조회 시 open이고 Prisma 7.10.0 package는 deepmerge-ts 7.1.5를 exact pin한다. 현재 결과는 commit/PR/release 전 working tree다.
Next exact action: RBAC-M13A에서 역사 문서 배너와 canonical maintenance queue link를 추가한다.
```

### 2026-09-02 RBAC-M13A 인계

```text
Task: RBAC-M13A
State: DONE
Start ref / end ref: main@a51d33f / main@a51d33f + uncommitted RBAC-M13A/B working tree
Changed files: README.md, docs/prd.md, docs/spec.md, docs/spec-0.2.0.md, docs/superpowers/plans/2026-06-02-rbac-mvp-core.md, docs/superpowers/plans/2026-06-03-rbac-milestones-3-5.md, docs/superpowers/plans/2026-06-20-rbac-0-2-core.md, docs/2026-08-30-p0-p3-maintenance-work-plan.md
Contract decision: README와 현재 공개 docs, changelog, 이 maintenance queue가 현재 계약/작업 상태의 권위다. PRD/spec 3개와 과거 실행 계획 3개는 삭제·재작성하지 않고 historical/superseded 설계 기록으로 보존한다. 계획에 남은 미체크 176개는 완료 상태를 추적하는 backlog가 아니므로 체크 상태도 역사 그대로 유지한다. maintenance queue는 npm package files allowlist 밖에 있으므로 published README에서도 유효하도록 https://github.com/nestarc/rbac/blob/main/docs/2026-08-30-p0-p3-maintenance-work-plan.md absolute link를 사용한다.
Commands and exact results: historical inventory PASS (PRD/spec 3개, plan 3개; plan unchecked 65+77+34=176); documentation contract PASS (6 historical banners, checkbox preservation, absolute queue link, package exclusion); local Markdown target scan PASS (README와 top-level public docs 12개); npm run lint PASS; npm run typecheck PASS; npm test PASS (14 files, 313 tests); npm pack --dry-run --json PASS (77 files, 247665 bytes); git diff --check PASS. 최초 sandbox pack은 ~/.npm cache EPERM으로 실패했고 동일 명령을 허용된 환경에서 재실행해 통과했다.
Unverified paths and reason: historical 문서 본문의 오래된 예제/설계 주장을 현재 코드와 줄 단위로 갱신하지 않았다. 배너 목적은 본문을 현재 계약으로 오인하지 않게 하는 것이며, 본문 수정은 역사 기록을 훼손한다. 실제 GitHub 렌더링은 새 commit/PR이 없으므로 실행하지 않았다.
External PR/release evidence: 없음. 현재 결과는 commit/PR/release 전 working tree다.
Next exact action: RBAC-M13B에서 완료된 support matrix와 trust/default-strict 계약을 public README/docs에 동기화한다.
```

### 2026-09-02 RBAC-M13B 인계

```text
Task: RBAC-M13B
State: DONE
Start ref / end ref: main@a51d33f / main@a51d33f + uncommitted RBAC-M13A/B working tree
Changed files: README.md, docs/compatibility.md, docs/migration-0.2.0.md, docs/prisma.md, docs/2026-08-30-p0-p3-maintenance-work-plan.md
Contract decision: installable peer range와 exact automated evidence를 분리하고, Node 22/24 source/modern packed lanes, Nest 10.4.22/11.2.1 packed lanes, Prisma 5.22.0/6.19.3/7.10.0 PostgreSQL 16 lanes 및 release ancestry/publish dependencies만 현재 gate로 공개한다. 전체 Cartesian matrix, automated audit, pack-once/publish-same-tarball, 미래 release provenance는 보장하지 않는다. tenant/API-key source conflict와 effective storage-row validation은 plain/strict 모두 적용한다. strict helper는 별도 engine이 아니라 missing metadata/tenant와 write-validation default를 단계적으로 강화하며 explicit override를 보존한다. custom subject resolver와 custom storage는 각각 credential/identity 및 subject/revocation provenance를 책임지는 신뢰 경계로 명시한다.
Commands and exact results: documentation support/workflow parity contract PASS; local Markdown target scan PASS (12 docs); README formatting check PASS; npm run lint PASS; npm run typecheck PASS; npm test PASS (14 files, 313 tests); npm pack --dry-run --json PASS after build (77 files, 247665 bytes; README, compatibility, migration, Prisma docs 포함; maintenance queue 제외); git diff --check PASS. package dry-run 최초 시도는 sandbox npm cache EPERM 후 허용된 재실행에서 통과했다.
Unverified paths and reason: 문서 전용 변경이므로 PostgreSQL/packed consumer를 다시 실행하지 않았다. 공개한 exact matrix는 이미 자동화된 CI/release workflow와 기존 M09-M11 완료 증거를 대조했다. 실제 GitHub Actions release event와 npm publish는 새 release를 만들지 않아 실행하지 않았다.
External PR/release evidence: 없음. 현재 결과는 commit/PR/release 전 working tree다.
Next exact action: RBAC-M14에서 exported requirement reason, decision reason/detail, not-found error의 실제 생성/소비 상태를 표로 만들고 public decision/error 계약 ADR을 작성한다.
```

### 2026-09-02 RBAC-M14 인계

```text
Task: RBAC-M14
State: DONE
Start ref / end ref: main@44daec7 / main@44daec7 + uncommitted RBAC-M14 working tree
Changed files: README.md, changelog.md, docs/adr/0002-public-decision-error-contract.md, docs/testing.md, docs/2026-08-30-p0-p3-maintenance-work-plan.md, package.json, scripts/verify-modern-consumer.cjs, src/errors/rbac.error.ts, src/interfaces/decision.ts, src/interfaces/requirements.ts, src/rbac.guard.ts, src/rbac.service.ts, src/testing/expect-rbac-decision.ts, src/testing/rbac-scenario.ts, test/unit/public-decision-error-contract.spec.ts
Contract decision: RbacService.can()과 public testing helper가 실제 생성하는 8개 reason, required details/safeMessage/evaluationPath 및 생성되는 nested shape는 새 RbacServiceDecision 계열 타입으로 고정한다. 기존 RbacDecision/RbacDecisionReason/detail/step은 application-authored·older fixture용 broad compatibility envelope로 유지한다. 생성 경로가 없는 denied_resource_missing/denied_role_expired/denied_resource_mismatch는 RbacLegacyDecisionReason으로 격리하고, decorator reason과 unpopulated roleIds/bindingIds/missing.resource, package producer가 없는 RbacPermissionNotFoundError/RbacBindingNotFoundError는 deprecate한다. RbacRoleNotFoundError와 기존 legacy HTTP mapping은 유지한다. M14에서는 어떤 export나 runtime mapping도 제거하지 않으며 실제 제거는 breaking release 후보 RBAC-B07로 분리한다.
Commands and exact results: git fetch --prune --tags PASS; baseline npm run typecheck PASS, npm test PASS (14 files, 313 tests); final npm run lint PASS; npm run typecheck PASS; npm test PASS (15 files, 315 tests); fresh npm run test:coverage PASS (14 files, 305 tests; statements 93.97%, branches 87.24%, functions 96.67%, lines 95.1%); focused public/service/guard/helper/error tests PASS (5 files, 180 tests); npm run build PASS; npm run test:consumer:modern PASS with packed root/testing declaration fixture and exact Nest 11.2.1/Prisma 7.10.0/API Keys 0.3.2; npm run test:consumer:nest10 PASS with exact Nest 10.4.22; npm pack --dry-run --json PASS (78 files, 252227 bytes, ADR included); npm audit --omit=dev --json PASS (0); git diff --check PASS. Full npm audit snapshot reported 2 high dev-tool findings on Prisma -> mysql2<3.22.0; no production finding. The first sandbox modern-consumer attempt failed on ~/.npm cache EPERM, and the authorized rerun reached the new type fixture; its first revision exposed a CommonJS top-level-await fixture error, which was corrected to a type-only ReturnType contract before the final PASS.
Unverified paths and reason: storage/adapter/schema and HTTP runtime behavior did not change, so PostgreSQL integration and HTTP E2E were not rerun. The new mysql2 advisory is dependency/audit policy work outside M14 and is handed to M19A or a dedicated dependency task rather than mixed into this contract change. GitHub Release metadata lookup was unavailable from the sandbox; git fetch confirmed origin/main remains 69bf0e1 and no release/publish action was requested.
External PR/release evidence: 없음. 현재 결과는 commit/PR/release 전 working tree다.
Next exact action: RBAC-M15에서 strict assignRole()의 listRoles({}) 전체 scan call-count/perf RED test를 추가하고 optional findRoleById capability 계약을 시작한다.
```

### 2026-09-02 RBAC-M15 인계

```text
Task: RBAC-M15
State: DONE
Start ref / end ref: main@05838fc / main@05838fc + uncommitted RBAC-M15 working tree
Changed files: README.md, changelog.md, docs/integrations.md, docs/prisma.md, docs/2026-08-30-p0-p3-maintenance-work-plan.md, scripts/verify-modern-consumer.cjs, src/interfaces/role.ts, src/interfaces/storage.ts, src/rbac.service.ts, src/adapters/in-memory-rbac.storage.ts, src/adapters/prisma-rbac.storage.ts, test/contract/storage-contract.ts, test/unit/rbac-service.spec.ts, test/integration/prisma-role-lookup.integration-spec.ts
Contract decision: 0.2.x RbacStorage required surface는 유지하고 optional RbacStorage.findRoleById와 RbacStorageRoleLookupCapability를 추가한다. strict assignRole({ roleId })는 capability가 있으면 해당 단건 조회를 사용하며 built-in InMemory adapter는 role-ID Map, Prisma adapter는 primary-key predicate의 단건 role+해당 permission 조회를 사용한다. capability 없는 custom adapter는 source compatibility를 위해 listRoles({}) scan을 유지하지만 deprecated이며 adapter migration 뒤 0.3 이상에서만 required 전환/제거를 고려한다. role-ID boundary canonicalization과 missing role error는 기존 계약을 유지한다.
Commands and exact results: git fetch --prune --tags PASS after sandbox FETCH_HEAD permission retry; initial focused RED PASS as expected with 1 failed assertion showing listRoles({}) called once; final npm run lint PASS; npm run typecheck PASS; npm test PASS (15 files, 319 tests); fresh npm run test:coverage PASS (14 files, 309 tests; statements 94.04%, branches 87.23%, functions 96.71%, lines 95.16%); focused service/InMemory contract PASS (3 files, 121 tests before moving the Prisma query fixture to integration scope); Prisma query-shape integration PASS (1 file, 1 test; findFirst where id once, findMany zero); Prisma 7.10.0 generate/migration PASS; PostgreSQL 16 real-DB RBAC_PRISMA_CLIENT=modern npm run test:prisma PASS (1 file, 35 tests, skip 0); npm run build PASS; npm run test:consumer:modern PASS with packed root declaration fixture and exact Nest 11.2.1/Prisma 7.10.0/API Keys 0.3.2; targeted formatting checks PASS; git diff --check PASS. The first coverage layout imported the whole Prisma adapter from a unit-only query-shape test and failed global thresholds despite all 310 tests passing; moving that integration-specific evidence to the integration suite restored the intended fresh coverage scope. The first sandbox packed consumer failed on ~/.npm cache EPERM and the authorized rerun passed. The first sandbox migration failed on localhost restriction and the authorized rerun passed. The temporary PostgreSQL 16 container was removed without a persistent volume.
Unverified paths and reason: Prisma 5/6 real-DB lanes and Node 22 runner were not rerun. The capability is additive, uses the existing Prisma delegate surface, and was verified with Prisma 7 real DB plus packed public declarations; no Nest runtime, Guard, HTTP, schema, or migration behavior changed. Actual Node 22 and legacy Prisma lanes remain CI/release gates.
External PR/release evidence: 없음. git fetch 뒤 origin/main은 69bf0e1이며 현재 결과는 commit/PR/release 전 working tree다.
Next exact action: RBAC-M16에서 HTTP-only support 문서화와 transport-neutral carrier abstraction의 compatibility/semver/구현 범위를 ADR 표로 비교하고 하나를 결정한다.
```

### 2026-09-02 RBAC-M16 인계

```text
Task: RBAC-M16
State: DONE
Start ref / end ref: main@8052a9a / main@8052a9a + uncommitted RBAC-M16 working tree
Changed files: README.md, changelog.md, docs/adr/0003-http-transport-contract.md, docs/compatibility.md, docs/guards.md, docs/2026-08-30-p0-p3-maintenance-work-plan.md, package.json, src/decorators/current-rbac-subject.decorator.ts, src/interfaces/resolvers.ts, src/interfaces/resource.ts, src/rbac.guard.ts
Contract decision: 0.2.x RbacGuard, route/parameter decorator pipeline, built-in resource declarations, default/integration resolvers는 Nest HTTP request만 지원한다. custom resolver가 general ExecutionContext를 받더라도 Guard의 subject request 저장, HTTP tenant source reconciliation, built-in resource extraction, CurrentRbacSubject, HTTP exception mapping을 제거하지 않으므로 다른 transport opt-in으로 보지 않는다. RbacService.can()/assertCan()은 transport-neutral boundary로 유지하고 GraphQL/RPC/WS/background adapter는 application-owned extraction/error translation으로만 연결한다. future carrier abstraction은 subject read/write, per-adapter tenant source reconciliation, explicit resource semantics, transport error mapping, HTTP 보존과 광고하는 각 transport의 실제 E2E를 함께 갖춘 별도 feature/release에서만 고려한다.
Commands and exact results: git fetch --prune --tags PASS after sandbox FETCH_HEAD permission retry; origin/main 69bf0e1, start HEAD 8052a9a 확인; baseline/final npm run lint PASS, npm run typecheck PASS, npm test PASS (15 files, 319 tests); npm run test:e2e PASS (1 file, 10 tests); npm run build PASS; npm run test:consumer:modern PASS with exact Nest 11.2.1/Prisma 7.10.0/API Keys 0.3.2; npm run test:consumer:nest10 PASS with exact Nest 10.4.22; npm pack --dry-run --json PASS (79 files, 257366 bytes, ADR 0003 included); npm audit --omit=dev --json PASS (0); targeted Prettier check and git diff --check PASS. packed consumer와 pack의 최초 sandbox 실행은 ~/.npm cache 접근 EPERM으로 실패했고 동일 명령을 허용된 환경에서 재실행해 통과했다.
Unverified paths and reason: GraphQL/RPC/WS E2E는 지원을 선언하지 않기로 한 결정의 비범위이며 package adapter/dependency도 추가하지 않았다. runtime authorization/storage/schema를 변경하지 않았으므로 fresh coverage와 Prisma 5/6/7 real-DB lanes는 재실행하지 않았다. GitHub Release와 npm latest metadata 조회는 sandbox network에서 사용할 수 없었고, git fetch로 origin/tag만 갱신했다.
External PR/release evidence: 없음. 현재 결과는 commit/PR/release 전 working tree다.
Next exact action: RBAC-M17에서 shipped examples를 clean packed consumer로 typecheck해 첫 실패를 기록하고 Prisma 6/7 setup 문서를 실행 가능한 절차로 분리한다.
```

### 2026-09-02 RBAC-M17 인계

```text
Task: RBAC-M17
State: DONE
Start ref / end ref: main@c532472 / main@c532472 + uncommitted RBAC-M17 working tree
Changed files: .github/workflows/ci.yml, .github/workflows/release.yml, README.md, changelog.md, docs/compatibility.md, docs/prisma.md, docs/2026-08-30-p0-p3-maintenance-work-plan.md, scripts/verify-modern-consumer.cjs, test/unit/package-smoke.spec.ts
Contract decision: shipped example gate는 별도 중복 install lane을 만들지 않고 Node 22/24 CI와 release가 공유하는 strict modern packed-consumer에 포함한다. fixture는 repository source가 아니라 설치된 tarball의 examples를 clean consumer로 복사하고 모든 .ts source를 동적으로 찾아 zero-source를 실패시키며 strict NodeNext로 typecheck한다. Prisma 문서는 5/6 legacy client와 7 driver adapter를 generator, datasource, public import, constructor, CLI별로 분리한다. repository real-DB evidence는 두 URL을 같은 PostgreSQL 16 database로 지정한 URL→generate→migrate→test 전체 절차와 skip 0을 요구한다.
Commands and exact results: git fetch --prune --tags PASS after sandbox FETCH_HEAD permission retry; origin/main과 v0.2.1 commit 69bf0e1, GitHub Release v0.2.1, npm latest 0.2.1 재확인; 최초 packed example gate는 source failure 없이 7개 모두 PASS했고 첫 sandbox 시도만 ~/.npm cache EPERM으로 중단된 뒤 허용된 동일 실행 PASS; focused package smoke PASS (1 file, 9 tests); npm run lint PASS; npm run typecheck PASS; npm test PASS with HTTP permission (15 files, 320 tests); fresh npm run test:coverage PASS (14 files, 310 tests; statements 94.04%, branches 87.23%, functions 96.71%, lines 95.16%); PostgreSQL 16에서 Prisma 7.10.0 C2 PASS (2 files, 36 tests, skip 0); disposable checkout에서 Prisma 6.19.3 C3 PASS (2 files, 36 tests, skip 0); npm run test:consumer:modern PASS with 7 packed example sources, exact Nest 11.2.1/Prisma 7.10.0/API Keys 0.3.2; npm run test:consumer:nest10 PASS; npm pack --dry-run --json PASS (79 files, 258941 bytes); npm audit --omit=dev --json PASS (0); full npm audit snapshot은 Prisma dev-tool→mysql2<3.22.0 high 2건; targeted Prettier와 git diff --check PASS. 검증용 PostgreSQL container, Prisma 6 checkout, fresh coverage directory는 종료 후 제거했다.
Unverified paths and reason: Node 22 packed example runner와 Prisma 5.22.0 real-DB lane은 로컬에서 재실행하지 않았다. 두 경로는 기존 CI/release gate이며 M17은 runtime/storage/schema를 변경하지 않았다. Node 24 packed tarball과 Prisma 6/7 문서 대상 real-DB 절차를 직접 검증했다.
External PR/release evidence: 없음. 공개 기준은 계속 GitHub/npm v0.2.1이고 현재 결과는 commit/PR/release 전 working tree다.
Next exact action: RBAC-M18은 EXT-SECURITY-CHANNEL 전까지 BLOCKED로 유지하고, RBAC-M19A에서 production audit 0 자동 gate와 owner/review-date가 만료되면 실패하는 full-audit exception 형식을 먼저 작성한다.
```

### 2026-09-02 RBAC-M18 인계

```text
Task: RBAC-M18
State: DONE
Start ref / end ref: main@e11468b / main@e11468b + uncommitted RBAC-M18 working tree; GitHub settings updated in place
Changed files: SECURITY.md, docs/2026-08-30-p0-p3-maintenance-work-plan.md; external settings: GitHub private vulnerability reporting and main branch protection
Contract decision: pre-1.0 security support는 최신 published minor line 하나만 제공하므로 현재 v0.2.1이 속한 0.2.x만 지원하고 0.1.x 이하는 upgrade 대상이다. 우선 비공개 신고 경로는 이 저장소의 GitHub private vulnerability reporting이며, 같은 Nestarc 조직에서 이미 운영 중인 security@nestarc.dev를 실제 fallback으로 사용한다. 고정 acknowledgement/remediation SLA는 두지 않는다. main 보호는 현재 직접 push 운영을 보존하되 force-push와 deletion을 금지하고, required review/status gate는 M19B의 workflow hygiene 범위와 별도 결정으로 남긴다. SECURITY.md는 인증 전제, subject, tenant/request/header, canonical/legacy API-key carrier, custom storage를 명시적 신뢰 경계로 설명한다.
Commands and exact results: git fetch --prune --tags PASS; start HEAD e11468b, origin/main 69bf0e1, GitHub latest release v0.2.1 확인; initial GitHub GET은 private vulnerability reporting false와 main protection 404를 확인; 같은 조직 nestjs-tenancy SECURITY.md에서 security@nestarc.dev와 latest-published-minor 정책 확인; private vulnerability reporting PUT PASS 및 final GET enabled=true; main protection PUT PASS 및 final GET allow_force_pushes=false, allow_deletions=false, required status/review=null, enforce_admins=false; npx prettier --check SECURITY.md PASS; SECURITY.md local Markdown targets 3/3 PASS; RBAC-M18 plan markers 5/5 PASS; npm run lint PASS; npm run typecheck PASS; npm test PASS (15 files, 320 tests); git diff --check PASS. 최초 combined Prettier check는 새 SECURITY.md와 기존 대형 maintenance table 형식을 함께 지적했고, SECURITY.md만 포맷한 뒤 통과시켰으며 역사 문서 전체의 기계적 재포맷은 피했다. 최초 plan marker inline command는 shell backtick quoting 오류로 실패했고 single-quoted Node command로 재실행해 5/5 통과했다.
Unverified paths and reason: 실제 vulnerability report나 fallback email은 테스트하지 않았다. 전자는 불필요한 draft advisory를 만들고 후자는 외부 수신자에게 테스트 메일을 보내므로, 관리자 API 상태와 조직의 기존 공개 정책으로 확인했다. 보호 동작을 확인하기 위한 force-push/deletion도 파괴적이므로 실행하지 않고 GitHub branch-protection API를 재조회했다.
External PR/release evidence: GitHub repository settings는 즉시 적용됐고 private vulnerability reporting enabled=true와 main branch protection을 API로 재확인했다. SECURITY.md와 계획 문서 변경은 아직 commit/PR/release 전 working tree다.
Next exact action: RBAC-M19A에서 production audit 0 자동 gate와 owner/review-date가 만료되면 실패하는 full-audit exception 형식을 먼저 작성한다.
```

### 2026-09-02 RBAC-M19A 인계

```text
Task: RBAC-M19A
State: DONE
Start ref / end ref: main@e9f6a9d / main@e9f6a9d + uncommitted RBAC-M19A/B working tree
Changed files: .github/dependency-risk-register.json, .github/workflows/ci.yml, .github/workflows/release.yml, changelog.md, docs/compatibility.md, docs/dependency-security.md, docs/2026-08-30-p0-p3-maintenance-work-plan.md, package.json, scripts/verify-dependency-audit.cjs, test/unit/dependency-audit-policy.spec.ts, test/unit/package-smoke.spec.ts
Contract decision: PR과 release의 독립 Node 24 dependency-audit job은 production npm audit exit 0과 finding 0을 무조건 요구한다. full audit의 원래 JSON/exit code는 로그에 보존하되 package/severity/direct/range/advisory-or-dependency via/effects/node가 risk register와 정확히 일치할 때만 알려진 dev-only finding을 허용한다. 새 finding, 변경된 finding, 해결됐지만 남은 예외는 모두 실패한다. 모든 audit/override 예외는 owner/reason/removeWhen과 Asia/Seoul 기준 exclusive reviewBy를 가지며 deadline 당일부터 실패한다. 현재 허용은 Prisma 7.10.0 dev CLI의 prisma→mysql2<3.22.0 high 2건이고 reviewBy는 2026-10-02다. tsup→esbuild 0.28.2와 @prisma/config@7.10.0→deepmerge-ts 8.0.2 override도 같은 deadline으로 exact 추적하며 package.json의 미등록 override를 허용하지 않는다.
Commands and exact results: git fetch --prune --tags PASS; start HEAD e9f6a9d와 origin/main 69bf0e1 확인; focused dependency policy PASS (1 file, 6 tests); final npm run verify:dependency-audit PASS with production exit 0/findings 0, full original exit 1/high 2 exact match, audit exceptions 2 and tracked overrides 2; npm run lint PASS; npm run typecheck PASS; npm test PASS (16 files, 326 tests); fresh npm run test:coverage PASS (15 files, 316 tests; statements 94.04%, branches 87.23%, functions 96.71%, lines 95.16%); npm run build PASS; npm pack --dry-run --json PASS (79 files, 258888 bytes); YAML parse, targeted formatting, git diff --check PASS. 최초 combined audit는 sandbox DNS가 production 조회 뒤 full 조회를 막아 실패했고 network 허용 재실행과 최종 재실행은 모두 PASS했다. 최초 package dry-run은 ~/.npm cache EPERM으로 실패했고 허용된 재실행은 PASS했다.
Unverified paths and reason: 새 commit의 실제 PR/release event는 생성하지 않았으므로 GitHub-hosted Node 22/24 및 release dependency-audit job은 로컬 workflow/YAML/정적 계약으로만 확인했다. runtime/storage/schema는 변경하지 않아 Prisma real-DB lane을 재실행하지 않았다. 등록된 dev finding은 생산 의존성이 아니며 production audit 0을 별도 gate로 확인했다.
External PR/release evidence: 없음. 현재 workflow와 정책은 commit/PR/release 전 working tree다.
Next exact action: RBAC-M19B의 Actions full-SHA/permissions와 Dependabot stack grouping을 같은 workflow graph에서 검증한다.
```

### 2026-09-02 RBAC-M19B 인계

```text
Task: RBAC-M19B
State: DONE
Start ref / end ref: main@e9f6a9d / main@e9f6a9d + uncommitted RBAC-M19A/B working tree
Changed files: .github/dependabot.yml, .github/workflows/ci.yml, .github/workflows/release.yml, changelog.md, docs/dependency-security.md, docs/2026-08-30-p0-p3-maintenance-work-plan.md, test/unit/dependency-audit-policy.spec.ts, test/unit/package-smoke.spec.ts
Contract decision: actions/checkout v6는 d23441a48e516b6c34aea4fa41551a30e30af803, actions/setup-node v6는 249970729cb0ef3589644e2896645e5dc5ba9c38 full commit SHA로 고정하고 major comment를 남긴다. workflow 기본 권한은 contents: read이며 release publish job만 provenance/trusted publishing에 필요한 id-token: write를 받는다. Dependabot은 Asia/Seoul 월요일 weekly schedule로 npm의 NestJS, Prisma, development-only lint/test minor/patch를 별도 group으로 만들고 GitHub Actions dependency도 한 group으로 갱신한다. PostgreSQL version lane, 기존 provenance, M11 tag ancestry, M22 pack-once contract는 소유권을 변경하거나 중복 구현하지 않는다.
Commands and exact results: GitHub API에서 checkout/setup-node refs/tags/v6가 각각 위 full SHA를 가리킴을 확인; CI/release 12개 uses ref full-SHA 정적 검사 PASS; id-token: write가 release publish job에만 1회 존재하는 unit contract PASS; Dependabot Nest/Prisma/lint-test/Actions group contract PASS; CI/release/Dependabot 3개 YAML safe parse PASS; npm run lint PASS; npm run typecheck PASS; npm test PASS (16 files, 326 tests); fresh npm run test:coverage PASS (15 files, 316 tests; statements 94.04%, branches 87.23%, functions 96.71%, lines 95.16%); npm run build PASS; npm pack --dry-run --json PASS (79 files, 258888 bytes); git diff --check PASS.
Unverified paths and reason: Dependabot이 실제 update PR을 만드는 동작과 GitHub-hosted CI/release run은 default branch에 commit되지 않아 실행할 수 없다. workflow graph의 기존 Node/Nest/Prisma 검증 의미는 바꾸지 않았고 로컬 정적/단위/YAML/package gate로 구성 유효성을 확인했다.
External PR/release evidence: 없음. GitHub API는 upstream Action tag-to-SHA 조회에만 사용했고 저장소 설정, PR, release, publish는 변경하지 않았다.
Next exact action: RBAC-M20A에서 exact dependency 완료와 Guard public golden test를 확인한 뒤 source-resolution helper 하나를 move-only로 추출한다. RBAC-M21은 RBAC-M22 완료 전까지 BLOCKED다.
```
