# Design Review - 2026-09-09

Reviewed baseline: `a8aba10`. Two independent Astra High reviewers covered security
and protocol/provider correctness. The lead reconciled their findings and revised
the roadmap. This is not a penetration test or a live Google integration assessment.

## Follow-up Implementation

The three P2 defects below are now fixed locally: aggregate audit actors are rejected,
review evidence has independent page tokens, and tool/provider/output-validation
failures are sanitized with correlated reference IDs. New stdio tests exercise both
2025-11-25 and 2026-07-28 messages through the actual SDK. They reproduced the defects
before the source fixes. The direct-handler window assertion was replaced by wire
coverage; the narrower unit tests remain.

The findings below describe the reviewed baseline, so their line references are
historical. Credential isolation, remaining roadmap work, and live Google validation
are still outstanding. These fixes do not make the runtime enterprise-ready.

## Findings

### P2 - Single-user audit accepts all users

`src/mcpServer.ts:47` accepts `userKey: "all"`, which the adapter forwards at
`src/workspace/googleWorkspaceAdminClient.ts:123`. A reviewer reproduced acceptance
over the MCP wire with an injected provider. Google documents `all` as an aggregate
selector. This widens the advertised single-user operation within the credential's
existing authority; the default `risk` profile does not expose the standalone tool.
Reject aggregate selectors before provider invocation and add a wire regression.
[Google API contract](https://developers.google.com/workspace/admin/reports/reference/rest/v1/activities/list)

Also clarify that the user selects the actor: Bob's activity is not a history of
changes Alice made to Bob. A target-based investigation needs an explicit event
filter design, not a renamed field.
[Google Admin audit semantics](https://developers.google.com/workspace/admin/reports/v1/guides/manage-audit-admin)

### P2 - Provider errors bypass output disclosure controls

`src/mcpServer.ts:317` calls the provider without sanitizing failures;
`src/telemetry.ts:46` rethrows unchanged. The installed SDK exposes the exception's
message as tool error text. The protocol reviewer observed this with an injected
error. Logger redaction does not cover this response path. No real credential leak
was demonstrated. Return a stable public error code and server-generated correlation
ID; test with synthetic sensitive markers in provider errors and malformed outputs.

### P2 - Restricted reviews cannot continue incomplete evidence

`src/mcpServer.ts:57` defines no review continuation inputs; calls at line 343
always fetch first pages. Standalone paging tools are not exposed under `risk`.
The protocol reviewer observed unknown continuation fields being stripped, followed
by another page-one request. Add independent membership/activity continuation within
the same restricted workflow, with bounded request and result budgets.

### Test gap - Direct handlers are not the protocol contract

`test/mcpServerPolicy.test.ts:99` invokes private handlers. Over stdio, invalid tool
arguments yield an error result rather than the raw exception asserted at line 78.
The existing tests also miss SDK output-validation failures and provider-message
disclosure. Add a small real client/stdio suite; keep focused unit tests too.
Reviewer wire probes were exploratory, not committed regression tests.

## Architecture Decision

Keep TypeScript, the provider interface, central scope derivation, restricted
discovery, structured evidence, and deterministic findings. Archive the Python
runtime rather than combine its direct mutations with the current security model.

The major deployment limitation is shared credential authority. `src/config.ts:28`
loads the Google key from the environment and `src/workspace/googleAuth.ts:13`
uses it to sign delegated requests. A shell-capable agent sharing access to that
credential can bypass MCP altogether. Remote HTTP alone does not fix this: separate
the agent's filesystem and workload identity from the service's credential/signing
authority. Google warns that domain-wide delegation permits service-account
impersonation across Workspace users; a configured subject is not key containment.
[Google service-account guidance](https://docs.cloud.google.com/iam/docs/best-practices-service-accounts)

The Hugging Face incident involved file disclosure, code execution, and stolen
credentials across infrastructure boundaries. Our design inference is to isolate
credentials and restrict runtime/network authority, not claim that prompt rules
or MCP discovery prevent an agent escape.
[Hugging Face technical disclosure](https://huggingface.co/blog/agent-intrusion-technical-timeline)

Use the existing stack as responsibility boundaries, not a shopping list. A2A and
a custom gateway remain deferred. Sampled traces explain execution; a separate,
protected audit record must establish who was authorized and what happened.

## Next Work and Verification

Follow [the revised roadmap](ROADMAP.md): trustworthy reads, a synthetic adversarial
demo, then one credential-isolated single-tenant service. Writes come later.
Start with wire regressions, then the audit selector, error mapping, and continuation.

Baseline verification on this review: typecheck passed, 18 tests passed across six
files, build passed. No live Google API calls or runtime source changes were made.
The original review changed documentation and durable agent guidance only. See the
follow-up status above for subsequent source fixes. No merge, push, or release was
performed in the original review.
