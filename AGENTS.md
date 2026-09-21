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
- Tool allowlists are not a sandbox. Never claim agent containment when the agent
  host can read Google credentials or invoke their signing identity.
- A single-user audit selector identifies the actor, not necessarily the affected
  user. Preserve that distinction in tool names, outputs, and findings.
- Treat missing evidence as unknown, not safe. Traces are not a durable audit log.
- Use synthetic data by default until a separate test tenant is explicitly available.

## Privileged Changes

Do not add direct mutation tools. Use:

```text
inspect -> propose structured diff -> policy check -> approve exact diff -> execute -> verify
```

Approval must bind the principal, tenant, exact diff hash, operation ID, and expiry. Execution must reject changed, replayed, or expired proposals.

## Current Boundary

Version 0.2 provides synthetic-only local stdio and an experimental authenticated
HTTP service. It supports scoped discovery, structured pages, deterministic review,
redacted logs, and OpenTelemetry spans through the Google adapter. HTTP verifies
JWT access tokens per request and intersects scopes with static server policy.

Protected-resource metadata is implemented. Real IdP/Google integration and isolated
deployment remain unverified. Per-investigation grants, durable principal audit,
gateway configuration, token exchange, durable idempotency, and writes are absent.
Never restore Google credentials to the stdio/client setup.

## Engineering Rules

- Keep public documentation reader-facing: supported behavior, setup, limitations,
  validation evidence, and release criteria. Keep brainstorming, agent coordination,
  personal timelines, and raw review transcripts in local untracked notes, not the
  README or published docs. Preserve accurate security limitations and AI-use disclosure.
- Do not add AI tools or vendors as commit authors or co-authors, or append generated-
  by branding to commit messages or pull requests. Preserve real human attribution
  and factual AI-use disclosures in project documentation. Use the configured human
  Git identity; never invent a replacement identity.
- Keep MCP handlers thin and Google behavior behind `WorkspaceAdminClient`.
- Register every tool in `src/security/toolPolicy.ts`.
- Keep `risk` as the restricted default profile.
- Keep telemetry content-free and drop inbound baggage and tracestate.
- Prefer deterministic provider evidence over model judgment.
- Preserve pagination and completeness markers in every list result.
- Add tests for policy denial, scope boundaries, mapping, trace propagation, redaction, retries, and idempotency as those features evolve.
- Keep implementation claims aligned with `docs/ENTERPRISE_RUNTIME.md` and `docs/ROADMAP.md`.
- Use the release contract and milestone table in `docs/ROADMAP.md` as the execution
  plan. Update milestone progress after implementation; completing a batch does not
  mean the product is finished. Real Google verification is blocked until the
  separate test tenant is available, but synthetic development can continue.

Before completing a change, run:

```bash
npm run typecheck
npm test
npm run build
```
