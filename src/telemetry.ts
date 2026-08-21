import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
  type Span
} from "@opentelemetry/api";
import {
  TRACEPARENT_META_KEY,
  TRACESTATE_META_KEY,
  type RequestMeta
} from "@modelcontextprotocol/server";

const tracer = trace.getTracer("com.anthony.workspace-admin", "0.1.0");

export interface SpanOptions {
  attributes?: Attributes;
  kind?: SpanKind;
  parentContext?: Context;
}

export async function withSpan<T>(
  name: string,
  options: SpanOptions,
  operation: (span: Span) => Promise<T>
): Promise<T> {
  const parentContext = options.parentContext ?? context.active();

  return tracer.startActiveSpan(
    name,
    {
      attributes: options.attributes,
      kind: options.kind ?? SpanKind.INTERNAL
    },
    parentContext,
    async (span) => {
      try {
        const result = await operation(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setAttribute("error.type", errorType(error));
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

export function mcpParentContext(meta: RequestMeta | undefined): Context {
  return propagation.extract(context.active(), traceCarrierFromMeta(meta));
}

export function traceCarrierFromMeta(meta: RequestMeta | undefined): Record<string, string> {
  const carrier: Record<string, string> = {};
  copyString(meta, carrier, TRACEPARENT_META_KEY);
  copyString(meta, carrier, TRACESTATE_META_KEY);
  return carrier;
}

function copyString(
  source: RequestMeta | undefined,
  target: Record<string, string>,
  key: string
): void {
  const value = source?.[key];
  if (typeof value === "string") {
    target[key] = value;
  }
}

function errorType(error: unknown): string {
  if (error instanceof Error && error.name) {
    return error.name;
  }

  return "UnknownError";
}
