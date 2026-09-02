# ADR 0002: Public decision and error contract

- Status: Accepted
- Date: 2026-09-02
- Task: `RBAC-M14`

## Context

The 0.2.x public types contain more states than the package produces. Decorator
options accept a free-form `reason`, `RbacDecisionReason` contains three denial
reasons with no `RbacService.can()` producer, some detail fields and evaluation
steps are never populated, and all three not-found error classes are exported even
though package operations only throw the role variant.

Removing those names from the compatibility types in a patch would break consumers
that create typed fixtures or explicitly map the exported errors. Leaving the
service return type equally broad, however, encourages consumers to handle states
that cannot occur and implies behavior the authorization engine does not provide.

## Producer and consumer inventory

| Public item                                                                                                    | Package producer                                                                                    | Package consumer                                                                               | Decision                                                                          |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `RbacRequirementOptions.reason`                                                                                | Decorators copy it into requirement metadata                                                        | No Guard, service, audit, decision, or HTTP path reads it                                      | **Deprecate**; keep metadata round-trip compatibility only                        |
| `RbacServiceDecisionReason`                                                                                    | `RbacService.can()` produces the eight values listed below                                          | Guard HTTP mapping, audit metadata, testing helpers, application callers                       | **Implement** as the producer-accurate return contract                            |
| `RbacDecisionReason` / `RbacDecision`                                                                          | Applications, tests, older package versions may construct the broader shape                         | Compatibility fixtures and custom code                                                         | **Keep** as a compatibility envelope                                              |
| `denied_resource_missing`, `denied_role_expired`, `denied_resource_mismatch`                                   | No `RbacService.can()` path                                                                         | Legacy Guard mapping accepts `denied_resource_missing`; older fixtures may construct all three | **Deprecate** through `RbacLegacyDecisionReason`; exclude from service results    |
| `RbacServiceDecision.details`                                                                                  | Every service decision gets details                                                                 | Guard audit metadata and `assertCan()` safe error details; HTTP responses omit it              | **Keep** and make required on the service-produced type                           |
| `details.requirement`                                                                                          | Role and permission checks                                                                          | Audit/application callers                                                                      | **Keep**                                                                          |
| `details.matched.roleKeys` / `permissions`                                                                     | Effective role/permission evaluation                                                                | Audit/application callers                                                                      | **Keep**                                                                          |
| `details.matched.roleIds` / `bindingIds`                                                                       | No package path                                                                                     | Compatibility fixtures only                                                                    | **Deprecate**; do not claim provenance the current decision builder does not emit |
| `details.missing.subject` / `tenant` / `permissions` / `roleKeys`                                              | Corresponding service denials                                                                       | Audit/application callers                                                                      | **Keep**                                                                          |
| `details.missing.resource`                                                                                     | No service decision path; Guard rejects missing declared resources before `can()`                   | Compatibility fixtures only                                                                    | **Deprecate**                                                                     |
| `details.evaluationPath` / `safeMessage`                                                                       | Every service decision gets one terminal step and its stable reason                                 | Audit/application callers                                                                      | **Keep** and make required on service-produced details                            |
| `resource_missing`, `resource_mismatch`, `roles_loaded`, `permissions_loaded` steps and `skip`/`info` outcomes | No package path                                                                                     | Compatibility fixtures only                                                                    | **Keep** in the broad envelope for now; exclude from `RbacServiceEvaluationStep`  |
| `RbacRoleNotFoundError`                                                                                        | Missing service `updateRole()` and role resolution for `assignRole()`; in-memory legacy update path | Application callers and HTTP mapper                                                            | **Keep**                                                                          |
| `RbacPermissionNotFoundError`                                                                                  | No package operation                                                                                | Direct construction and HTTP mapper only                                                       | **Deprecate**                                                                     |
| `RbacBindingNotFoundError`                                                                                     | No package operation                                                                                | Direct construction and HTTP mapper only                                                       | **Deprecate**                                                                     |

The eight service-produced reasons are:

- `allowed_by_role`
- `allowed_by_role_permission`
- `denied_subject_missing`
- `denied_tenant_missing`
- `denied_tenant_conflict`
- `denied_no_matching_role`
- `denied_no_matching_permission`
- `denied_storage_error`

Resource declaration failures are Guard errors, not service decisions. Expired,
wrong-resource, and otherwise ineligible effective rows are filtered before
matching and therefore end in the ordinary no-matching-role or
no-matching-permission decision. This preserves the defense-in-depth contract and
does not reveal why an individual storage row was ineligible.

## Decision

`RbacService.can()` returns `RbacServiceDecision`. Its reason is limited to
`RbacServiceDecisionReason`; its `details`, `evaluationPath`, and `safeMessage` are
required because the service always creates them. The package testing helpers use
the same return and reason types, so inferred consumer code cannot depend on an
unreachable result.

The existing `RbacDecision` and `RbacDecisionReason` names remain wider
compatibility envelopes. The three unproduced reasons are isolated in the
deprecated `RbacLegacyDecisionReason` alias. The broad detail and evaluation-step
interfaces likewise remain constructible for existing fixtures, while
`RbacServiceDecisionDetails` and `RbacServiceEvaluationStep` describe actual
service output.

`RbacRequirementOptions.reason`, `RbacPermissionNotFoundError`, and
`RbacBindingNotFoundError` receive source-level deprecation notices. The decorators
continue copying `reason`; both error classes, their codes, and their HTTP mappings
remain unchanged. No new runtime behavior is attached to these dormant APIs in a
patch release.

Decision details are safe server-side diagnostic data, not a public HTTP error
body. `mapRbacErrorToHttpException()` continues serializing only the stable message
and code. Applications must not expose decision details or subject data to clients
without their own review.

## Compatibility and removal

M14 removes no exported symbol, runtime error mapping, or accepted decorator
option. The narrower types are used only where the package itself is the producer.
Code that manually creates legacy decisions can continue to type them as
`RbacDecision` during migration.

Physical removal of deprecated requirement metadata, legacy reason/detail states,
the two dormant error classes, or their error codes requires a separate breaking
release task. That task must provide migration notes and search published consumer
usage before changing the compatibility envelope; it is not part of M14.

## Consequences

- Service callers and testing-helper users see only states the package can return.
- Existing hand-written fixtures and explicit error mappings remain source and
  runtime compatible.
- Guard resource failures stay distinct HTTP errors without pretending they are
  `RbacService.can()` results.
- Future producers must update the producer-accurate types and public contract tests
  in the same change instead of adding an unreachable public state.
