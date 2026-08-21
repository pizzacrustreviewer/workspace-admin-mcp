# Enterprise Runtime

## Responsibility Stack

```text
OAuth/OIDC        authority and delegated identity
A2A               agent-to-agent interoperability
MCP               agent-to-tool interoperability
Gateway           routing, quotas, and coarse policy
OpenTelemetry     cross-boundary observability
```

This repository owns the MCP tool boundary. It does not need A2A unless it becomes an independently discoverable agent that accepts or delegates tasks.

## Target Trace

```text
human request
  -> agent orchestration
  -> model invocation
  -> gateway authorization
  -> MCP tools/call
       -> policy.evaluate
       -> google.workspace provider operation
  -> structured result
```

The current server implements the spans from `tools/call` through the Google adapter. Inbound `traceparent` connects them to an upstream trace. Structured logs include active trace and span IDs. Trace metadata is never an authorization input.

## Current Versus Target

| Concern | Current local server | Target remote deployment |
| --- | --- | --- |
| Transport | MCP 2026/2025-compatible stdio | MCP 2026-07-28 stateless HTTP |
| Inbound identity | Local process boundary | OAuth/OIDC token validated per request |
| Tool authorization | Startup profile plus repeated handler check | Gateway policy plus per-principal server policy |
| Google identity | Service account with domain-wide delegation | Separate workload, user-delegated, or OBO credential |
| Trace | MCP, policy, and Google adapter spans | One trace across human, agent, model, gateway, MCP, and provider |
| Retries | None | Bounded read retries with deadlines and provider error classification |
| Writes | None | Durable proposal, approval, idempotency, execution, and verification records |

The current repository does not provide HTTP OAuth, protected-resource metadata, gateway configuration, token exchange, durable idempotency, or writes.

## Identity Boundary

Remote MCP is an OAuth resource server. It must validate issuer, audience/resource, expiry, tenant, principal, and scopes before dispatch. An inbound token intended for this MCP server must never be forwarded to Google.

Outbound Google access uses a separate credential:

| Mode | Use case | Principal evidence |
| --- | --- | --- |
| Workload identity | Scheduled organization inspection | Calling service identity |
| User delegated | User explicitly authorizes a bounded action | User identity and consent |
| On-behalf-of | User invokes an agent across service boundaries | User plus calling workload |

Private-key JWT with a managed signing service can keep confidential-client keys outside the agent process. It is a deployment option, not a reason to place keys in model context.

## Stateless HTTP

MCP 2026-07-28 modern HTTP requests do not depend on a protocol session or initialization handshake. Each request can land on any instance. Business state must live in an explicit durable record, not hidden process affinity.

Stateless transport does not make a business operation safe to retry:

- reads may use bounded retries for classified transient failures
- retries require deadlines and attempt caps
- writes require an operation ID and idempotency record
- approval binds principal, tenant, exact diff hash, operation ID, and expiry
- execution rejects changed, replayed, or expired proposals
- verification attaches provider evidence to the same operation and trace

## Gateway Contract

A gateway can route, rate-limit, and apply coarse policy using authenticated MCP method and tool metadata. The MCP server must repeat authorization because gateway policy and tool annotations are not enforcement inside the tool boundary.

Recommended policy inputs:

- authenticated principal and tenant
- token issuer and audience/resource
- granted scopes
- MCP method and tool name
- request deadline
- approved operation ID for a write

Prompt text, model output, trace IDs, and baggage are not policy inputs.

## Privileged Changes

```text
inspect -> propose structured diff -> policy check -> approve exact diff -> execute -> verify
```

The first future write should be an exact group-membership diff. User suspension should remain out of scope until the lower-risk approval path is proven.

## References

- [MCP TypeScript SDK: protocol versions](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions)
- [MCP TypeScript SDK: 2026-07-28 support](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28)
- [MCP authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [A2A protocol specification](https://a2a-protocol.org/latest/specification/)
- [OpenTelemetry JavaScript exporters](https://opentelemetry.io/docs/languages/js/exporters/)
