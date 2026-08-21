# Architecture

## System Boundary

The server exposes a read-only MCP surface over stdio. It retrieves Google Workspace administration data, normalizes provider responses, and returns structured results to an MCP client.

```text
MCP client
  -> MCP 2026/2025 stdio negotiation
  -> tools/call span
  -> server-side tool policy span
  -> thin MCP handler
  -> WorkspaceAdminClient
  -> Google API client span
  -> Directory API / Reports API
```

## Control Flow

`serveStdio` creates one MCP server for the negotiated connection era. Startup policy determines which tools are registered. Every handler repeats the authorization check before calling the provider client.

The local process uses one configured delegated administrator. A future remote server must replace startup-only policy with per-request principal, tenant, audience, and scope checks.

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

- MCP 2026-07-28 stateless HTTP handling
- OAuth protected-resource metadata and bearer-token validation
- per-request tool authorization
- a separate Google workload, delegated, or on-behalf-of credential
- gateway policy on authenticated method and tool metadata
- bounded retries with deadlines
- durable operation and idempotency records
- exact-diff approval and post-change verification

See [Enterprise Runtime](ENTERPRISE_RUNTIME.md).
