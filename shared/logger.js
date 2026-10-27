// Structured JSON logger. Every line automatically gets a timestamp, the service name, and the
// trace and span IDs of the request being handled, so you can find the same request in Jaeger.
const pino = require("pino");
const { trace } = require("@opentelemetry/api");

function createLogger(service) {
  return pino({
    base: { service }, // added to every line
    messageKey: "message", // "message" instead of pino's default "msg"
    timestamp: pino.stdTimeFunctions.isoTime, // "time": "2026-10-27T04:30:00.000Z"
    formatters: {
      level: (label) => ({ level: label }), // "level": "info" instead of pino's number (30)
    },
    // Runs for every log line: copy the current request's trace and span IDs from OpenTelemetry.
    mixin() {
      const span = trace.getActiveSpan();
      if (!span) return {};
      const { traceId, spanId } = span.spanContext();
      return { traceId, spanId };
    },
  });
}

module.exports = createLogger;
