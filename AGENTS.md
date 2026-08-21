# Project Agent Guide

This repository implements a narrowly scoped Google Workspace MCP tool boundary.

## Architecture Contract

Keep these responsibilities distinct:

```text
OAuth/OIDC        authority and delegated identity
A2A               agent-to-agent interoperability
MCP               agent-to-tool interoperability
Gateway           routing, quotas, and coarse policy
OpenTelemetry     cross-boundary observability
```

- Do not add A2A unless this server becomes an independently discoverable agent.
- Gateway authorization is defense in depth. Every tool must enforce policy inside the server.
- Trace context is correlation data, never an authorization input.
- Never pass an inbound MCP token through to Google.
- Derive outbound Google scopes from the final exposed tool set.
- Stateless transport does not make an operation safe to retry.

## Privileged Changes

Do not add direct mutation tools. Use:

```text
inspect -> propose structured diff -> policy check -> approve exact diff -> execute -> verify
```

Approval must bind the principal, tenant, exact diff hash, operation ID, and expiry. Execution must reject changed, replayed, or expired proposals.

## Current Boundary

Version 0.2 is a local read-only stdio server. It supports modern MCP negotiation, scoped discovery, structured page results, deterministic privileged-user review, redacted logs, and OpenTelemetry spans through the Google adapter.

Remote HTTP, inbound OAuth verification, protected-resource metadata, gateway configuration, token exchange, durable idempotency, and approval-gated writes are not implemented.

## Engineering Rules

- Keep MCP handlers thin and Google behavior behind `WorkspaceAdminClient`.
- Register every tool in `src/security/toolPolicy.ts`.
- Keep `risk` as the restricted default profile.
- Keep telemetry content-free and drop inbound baggage and tracestate.
- Prefer deterministic provider evidence over model judgment.
- Preserve pagination and completeness markers in every list result.
- Add tests for policy denial, scope boundaries, mapping, trace propagation, redaction, retries, and idempotency as those features evolve.
- Keep implementation claims aligned with `docs/ENTERPRISE_RUNTIME.md` and `docs/ROADMAP.md`.

Before completing a change, run:

```bash
npm run typecheck
npm test
npm run build
```
