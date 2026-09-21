# Roadmap

These are release acceptance criteria, not claims of completed work.

## Release Contract

Target: an open-source, read-only, single-tenant Google Workspace investigation
service that a Workspace administrator can connect to an MCP client, operate with
bounded authority, and independently test. Its first workflow reviews a privileged
account, its memberships, and actions performed by that account. It must identify
missing evidence rather than imply a complete compromise assessment.

The release is not complete when a few defects are fixed or a demo runs. It is
complete only when the six milestones below have recorded evidence. Until then,
describe the project as an experimental prototype. Do not claim production readiness.

| Order | Deliverable | Current status | Completion evidence |
| --- | --- | --- | --- |
| 1 | Correct scope and evidence contract | In progress | Canonical subject resolution, fail-closed config, policy-controlled sensitive fields, explicit unknown/partial evidence, regression tests |
| 2 | Reliable bounded reads | In progress: page continuation fixed | Deadlines, classified bounded retries, concurrency/result budgets, timeout and partial-failure tests |
| 3 | Credential-free demo and adversarial fixtures | Not started | Documented command works from a clean checkout; normal, incomplete, and denied cases are reproducible without Google or a paid model |
| 4 | Authenticated, credential-isolated deployment | Not started | One real identity-provider flow, per-request grants, isolated Google identity, negative authorization/credential-access tests, protected audit records, trace example |
| 5 | Real Workspace verification | Blocked on test tenant | Dummy-account fixtures; actual scope denial, actor semantics, pagination, membership and error checks; reproducible integration report |
| 6 | Open-source release packaging | Not started | Fresh-install and client smoke tests, supported runtime CI, secret/dependency checks, contribution/security guidance, deployment and incident runbooks, changelog, reviewed merge and tagged release |

Milestones 1-4 do not depend on a real tenant. Start milestone 5 as soon as the
tenant is available and repeat it against the release candidate. Build release
documentation alongside implementation rather than treating it as a final rewrite.

### Next Implementation Batch

Finish milestone 1 before adding new tools:

1. Reject malformed explicit tool/scope configuration; distinguish omitted defaults
   from an intentionally empty deny-all configuration.
2. Move audit-parameter permission into server policy. Caller opt-in alone must not
   grant access to fields that the configured policy prohibits.
3. Resolve the review subject once before dependent provider calls, with provider-
   supported canonical identifiers and tests for aliases and immutable IDs.
4. Return explicit evidence windows and unavailable/unknown states. Preserve usable
   evidence on partial failure without producing a false clean assessment.

Acceptance: tests demonstrate denied requests do not reach Google, missing fields
cannot turn into a safe verdict, and each result identifies its evidence coverage.
Keep all fixtures synthetic. Update the milestone status and remaining gaps after
each batch; an implementation closeout is not a declaration that the product is done.

## Retain the Current Foundation

Keep TypeScript as the supported runtime and preserve `python-v0.1` as history.
Retain `WorkspaceAdminClient`, the central tool policy, restricted `risk` profile,
structured results, deterministic findings, and content-free tracing. Do not merge
the old Python mutation or deployment paths into the current runtime wholesale.

Version 0.2 is a local read-only stdio prototype. Passing unit tests does not prove
agent containment, Google integration, or remote authorization.

## Gate 1 - Trustworthy Read-Only Investigation

Implemented: aggregate actor rejection, sanitized tool failures
including output validation, independent review page tokens, and JSON-RPC/stdio
regressions for both supported protocol eras. The remaining items below are still
required to complete this gate; live Google integration remains unverified.

Deliver one reliable workflow: inspect a privileged account and its own admin
activity over a bounded window. Do not call this a complete compromise assessment.

- Resolve the subject once, then use provider-supported canonical identifiers.
- Distinguish actions performed by the subject from actions affecting the subject.
- Reject aggregate selectors in tools advertised as single-user reads.
- Make sensitive-field disclosure a server policy decision, not just a caller flag.
- Reject malformed explicit policy configuration instead of broadening defaults.
- Provide bounded continuation under the default profile, without enabling inventory.
- Report evidence window, page coverage, source failures, and unknown privilege
  fields explicitly. No findings must not imply that an account is safe.
- Map provider failures to stable, sanitized errors; impose request deadlines and
  bounded retry budgets. Verify underlying SDK retry behavior rather than assume it.

Acceptance: actual MCP client/transport tests cover discovery and denied calls,
invalid inputs, multi-page results, output validation, and sanitized provider
failures. Provider fixtures cover aliases, missing fields, and partial failures.
Typecheck, tests, and build must pass from a clean checkout.

## Gate 2 - Reproducible Portfolio Demonstration

Ship a synthetic provider mode requiring no Google credentials. Include a normal
investigation, incomplete evidence, denied disclosure, and malicious instructions
embedded in returned Workspace data.

- Assert deterministic policy outcomes and provider call counts independently of
  what a model says. Exercise both discovery and direct invocation.
- Publish a small evidence report: expected/observed outcomes, denied operations,
  result coverage, latency, and test environment. Do not invent benchmark scores.
- Add a minimal reference agent runner for a successful case and a hostile case.
  Keep any live-model evaluation optional and separate from deterministic CI.
- Demonstrate trace correlation from the reference runner through MCP and the
  provider adapter. Label synthetic spans and manual instrumentation honestly.

Acceptance: another engineer can reproduce the demo without an employer tenant,
private dataset, or paid model call. Optional live-model runs disclose their setup.

## Gate 3 - A Real Credential Boundary

Deploy one single-tenant read-only MCP service under an identity the agent host
cannot impersonate. Use one existing identity provider and one proven Google
authorization flow; do not build a general identity broker or OAuth issuer.

- Validate MCP access-token issuer, audience/resource, expiry, principal, and
  scopes per request. Do not accept an OIDC ID token as an API access token.
- Bind the caller to a server-held investigation grant: tenant, subject, allowed
  tools and fields, time window, expiry, and atomic call/result budgets.
- Intersect that grant with server policy at discovery and invocation. Recheck
  continuation requests; model arguments cannot create or widen a grant.
- Keep Google credentials and signing authority outside the agent's filesystem,
  environment, and workload identity. Keyless signing alone is not containment.
- Use a separate Google credential, never token pass-through. Choose delegated
  user OAuth where suitable; use domain-wide delegation only with explicit need.
- Use the pinned SDK's documented HTTP transport. Test its negotiated versions;
  do not infer business retry safety from stateless protocol operation.
- Enforce deadlines, concurrency limits, and egress restrictions at deployment.
  An existing gateway is optional defense in depth, not the sole policy authority.
- Record authorization and operation outcomes in a protected audit sink independent
  of sampled traces. Generate trusted operation IDs on the server.

Acceptance: wrong-audience, expired, cross-subject, grant-escalation, budget,
direct-call, credential-access, and telemetry-failure tests demonstrate the boundary.
Run Google integration tests only in a separately authorized test tenant.

## Later - One Approval-Gated Write

Only after the read boundary is demonstrated: an exact group-membership change.
Bind approval to principal, tenant, immutable diff hash, operation ID, and expiry.
Recheck policy and provider preconditions immediately before execution. Use durable
operation records, reject replay, and reconcile ambiguous provider outcomes before
retrying. An idempotency key does not guarantee exactly-once Google execution.

Do not add user suspension, broad tenant automation, A2A, a policy language, or a
general multi-agent platform to this milestone. A2A remains unnecessary unless
this service becomes an independently discoverable agent.

## Current Assumptions and Dependencies

- A dedicated Workspace test tenant is required for live integration verification.
  Synthetic development can continue without it. Employer tenants and data are not
  authorized substitutes.
- Privileged-account investigation is the selected first workflow. Offboarding
  mutations remain outside this release unless explicitly reprioritized.
