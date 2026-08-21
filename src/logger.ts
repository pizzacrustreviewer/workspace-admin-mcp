import { isSpanContextValid, trace } from "@opentelemetry/api";

type LogLevel = "debug" | "info" | "warn" | "error";

const levelRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export function createLogger(minLevel: LogLevel): Logger {
  function write(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
    if (levelRank[level] < levelRank[minLevel]) {
      return;
    }

    const payload = redact({
      ts: new Date().toISOString(),
      level,
      event,
      ...activeTraceFields(),
      ...fields
    });

    process.stderr.write(`${JSON.stringify(payload)}\n`);
  }

  return {
    debug: (event, fields) => write("debug", event, fields),
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields)
  };
}

function activeTraceFields(): Record<string, string> {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (!spanContext || !isSpanContextValid(spanContext)) {
    return {};
  }

  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId
  };
}

export function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, redactSensitiveKey(key, child)])
    );
  }

  return value;
}

function redactSensitiveKey(key: string, value: unknown): unknown {
  if (/private.*key|credential|token|secret|password/i.test(key)) {
    return "[REDACTED]";
  }

  return redact(value);
}

function redactString(value: string): string {
  return value
    .replace(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
}
