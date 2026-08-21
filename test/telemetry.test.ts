import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../src/logger.js";
import { createMcpServer } from "../src/mcpServer.js";
import { resolveToolPolicy } from "../src/security/toolPolicy.js";
import { traceCarrierFromMeta } from "../src/telemetry.js";
import { WorkspaceAdminClient } from "../src/workspace/types.js";

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)]
});

const client: WorkspaceAdminClient = {
  listUsers: async () => [],
  listGroups: async () => [],
  listActivities: async () => []
};

beforeAll(() => provider.register());
beforeEach(() => exporter.reset());
afterAll(() => provider.shutdown());

describe("MCP trace propagation", () => {
  it("accepts traceparent but drops untrusted tracestate and baggage", () => {
    expect(
      traceCarrierFromMeta({
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        tracestate: "vendor=value",
        baggage: "user.email=sensitive@example.com"
      })
    ).toEqual({
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
    });
  });

  it("continues the parent trace through tool and policy spans without recording inputs", async () => {
    const server = createMcpServer(
      client,
      createLogger("error"),
      resolveToolPolicy({ profile: "inventory" })
    );
    const handler = registeredToolHandler(server, "workspace_users_list");

    await handler(
      { maxResults: 1, query: "email=sensitive@example.com" },
      {
        mcpReq: {
          _meta: {
            traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
          }
        }
      }
    );

    const spans = exporter.getFinishedSpans();
    const toolSpan = spans.find((span) => span.name === "tools/call workspace_users_list");
    const policySpan = spans.find((span) => span.name === "policy.evaluate");

    expect(toolSpan?.spanContext().traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(policySpan?.parentSpanContext?.spanId).toBe(toolSpan?.spanContext().spanId);
    expect(JSON.stringify(spans.map((span) => span.attributes))).not.toContain("sensitive@example.com");
  });
});

function registeredToolHandler(
  server: unknown,
  name: string
): (input: unknown, context: unknown) => Promise<unknown> {
  const registeredTools = (server as {
    _registeredTools: Record<string, { handler: (input: unknown, context: unknown) => Promise<unknown> }>;
  })._registeredTools;

  return registeredTools[name].handler;
}
