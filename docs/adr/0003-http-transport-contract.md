# ADR 0003: HTTP transport contract

- Status: Accepted
- Date: 2026-09-02
- Task: `RBAC-M16`

## Context

`RbacService` accepts plain authorization inputs and has no Nest transport
dependency. The decorator and Guard path is different: its default carriers and
error behavior are built around a Nest HTTP request. Although custom subject,
tenant, and resource resolvers receive an `ExecutionContext`, replacing those
resolvers does not remove every HTTP dependency from `RbacGuard`.

The current non-HTTP breakpoints are:

| Surface                           | HTTP dependency                                                                                        | Effect outside an HTTP request                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `RbacGuard.canActivate()`         | Writes the resolved subject through `switchToHttp().getRequest()`                                      | A custom subject resolver alone cannot make the Guard transport-neutral.                         |
| Tenant reconciliation             | Always reads the subject, request tenant fields, and HTTP header sources for tenant-aware requirements | A custom tenant resolver is still reconciled against an HTTP request carrier.                    |
| Built-in resource declarations    | `idParam`, `idQuery`, and `idHeader` read HTTP request fields                                          | These declarations have no defined GraphQL, RPC, or WebSocket meaning.                           |
| `@CurrentRbacSubject()`           | Reads the subject from the HTTP request                                                                | The parameter decorator does not read GraphQL context, RPC data, or a WebSocket client.          |
| Guard errors                      | Converts RBAC errors to Nest HTTP exceptions                                                           | The package does not define transport-specific RPC or WebSocket error serialization.             |
| Default and integration resolvers | Read `request.user`, API-key records, tenant fields, headers, params, and query                        | They are HTTP adapters even though their callback type uses the general Nest `ExecutionContext`. |

Nest handler/class metadata and custom resource resolver functions can be reused in
more than one context, but those isolated capabilities are not evidence that the
complete Guard pipeline supports another transport.

## Options

| Option                                         | Compatibility and scope                                                                                                                                      | Verification required                                              | Decision                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------- |
| Document the existing HTTP-only Guard contract | Documentation and declaration comments only; no 0.2.x runtime or public type change                                                                          | Existing unit, HTTP E2E, build, and packed documentation checks    | **Adopt for 0.2.x.**                          |
| Add a transport-neutral carrier abstraction    | New public adapter lifecycle for subject read/write, tenant sources, resource extraction, and error mapping; preserve an HTTP adapter and migration behavior | HTTP regression plus real GraphQL, RPC, and WebSocket E2E fixtures | Defer to a separate feature task and release. |

## Decision

In 0.2.x, `RbacGuard`, its route/parameter decorators, the built-in resource
declarations, and the exported default/integration resolvers support Nest HTTP
request handling only. Custom resolvers customize trusted values within that HTTP
Guard pipeline; they are not a switch that enables another transport.

`RbacService` remains transport-neutral and is the supported authorization boundary
for application-owned GraphQL, RPC, WebSocket, background-job, or other adapters.
An application can extract its own carrier values, call `RbacService.can()` or
`assertCan()`, and translate the result for its transport. That application-owned
wiring is not a package claim of GraphQL, RPC, or WebSocket Guard support.

The package will not advertise those transports until it contains a carrier
abstraction that:

1. reads and stores a subject without an unconditional HTTP request access;
2. defines trusted tenant-source reconciliation for each adapter;
3. gives resource declarations explicit transport semantics;
4. maps denials to the transport's error model; and
5. passes real end-to-end tests for every advertised transport while preserving
   the current HTTP adapter.

This future work is a feature, not a documentation-only patch. Its API and semver
are decided with those fixtures rather than being inferred from the existing
resolver callback types.

## Consequences

- The documented support claim now matches the only existing end-to-end transport
  evidence.
- Existing HTTP consumers and custom resolver signatures are unchanged.
- Consumers are not led to interpret `ExecutionContext` as a complete
  transport-neutral contract.
- A future carrier abstraction has explicit acceptance criteria and must retain the
  HTTP behavior instead of silently redefining it.
