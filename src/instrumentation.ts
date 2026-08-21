import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
  ATTR_SERVICE_VERSION
} from "@opentelemetry/semantic-conventions";

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "google-workspace-admin-mcp",
    [ATTR_SERVICE_NAMESPACE]: "enterprise-agents",
    [ATTR_SERVICE_VERSION]: "0.2.0"
  }),
  traceExporter: new OTLPTraceExporter()
});

sdk.start();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void sdk.shutdown().finally(() => process.exit(0));
  });
}
