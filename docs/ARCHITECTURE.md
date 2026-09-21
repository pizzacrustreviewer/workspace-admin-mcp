# Architecture

## System Boundary

The server exposes a synthetic read-only stdio demo and an experimental authenticated
HTTP service. The service can retrieve Google Workspace data through a separate
credential; handlers normalize provider responses into structured MCP results.

```text
MCP client
  -> HTTP JWT verification + scope intersection (or synthetic stdio negotiation)
  -> tools/call span
  -> server-side tool policy span
  -> thin MCP handler
  -> WorkspaceAdminClient
  -> synthetic fixtures OR Google API client span
  -> Directory API / Reports API (HTTP service only)
```

## Control Flow

`serveStdio` creates one MCP server for the negotiated connection era. Startup policy determines which tools are registered. Every handler repeats the authorization check before calling the provider client.

HTTP creates a fresh server per request after validating the access token and
intersecting its scopes with configured policy. The Google factory sees only that
policy, never the inbound token. Tenant and delegated administrator are fixed by
service configuration. Per-investigation grants and durable principal audit remain
unimplemented. Stdio does not instantiate Google authentication.

## Provider Boundary

`WorkspaceAdminClient` owns Google behavior. MCP handlers do not construct Google requests or interpret raw provider schemas. This keeps authorization and protocol code separate from provider mapping and allows fixture-based tests to exercise pagination, event normalization, and tracing without live credentials.

All list calls return:

```text
items + resultCount + nextPageToken + complete
```

No sampled result is described as a domain-wide total.

## Privileged-User Review

The default `risk` profile exposes one composed investigation tool. It retrieves an exact user, that user's group memberships, and a bounded Admin audit window. The only current security finding is a reproducible conflict: a suspended or archived account that remains directly or delegated-admin privileged.

The server does not infer risk from group names, raw administrator counts, or broad event-name regular expressions.

## Trace Context

The server accepts W3C `traceparent` from MCP request metadata and starts nested tool, policy, and Google API spans. `tracestate` and baggage are dropped at the trust boundary. Prompts, arguments, Workspace records, emails, tokens, page tokens, and response bodies are never span attributes.

## Future Remote Layer

Before remote deployment or write operations, add:

- deployment verification of the implemented HTTP and JWT authorization boundary
- per-investigation target, field, time, and budget grants
- protected audit records and independently isolated Google credentials
- gateway policy on authenticated method and tool metadata
- bounded retries with deadlines
- durable operation and idempotency records
- exact-diff approval and post-change verification

See [Enterprise Runtime](ENTERPRISE_RUNTIME.md).
