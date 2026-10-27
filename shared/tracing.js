// OpenTelemetry: records each request as spans and sends them to Jaeger,
// and sends every pino log line to Loki.
// Call it first in every service, before express, pg or pino are loaded, so it can hook into them.
const { NodeSDK } = require("@opentelemetry/sdk-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
const { OTLPLogExporter } = require("@opentelemetry/exporter-logs-otlp-http");
const { BatchLogRecordProcessor } = require("@opentelemetry/sdk-logs");
const { PinoInstrumentation } = require("@opentelemetry/instrumentation-pino");
const { HttpInstrumentation } = require("@opentelemetry/instrumentation-http");
const { ExpressInstrumentation } = require("@opentelemetry/instrumentation-express");
const { UndiciInstrumentation } = require("@opentelemetry/instrumentation-undici");
const { PgInstrumentation } = require("@opentelemetry/instrumentation-pg");
const { trace, SpanStatusCode } = require("@opentelemetry/api");

function startTracing(serviceName) {
  const sdk = new NodeSDK({
    serviceName, // shows up as the service name in Jaeger
    // Sends finished spans in a bundle about every 5 seconds to http://localhost:4318/v1/traces (Jaeger).
    traceExporter: new OTLPTraceExporter(),
    // Sends log lines in batches (about every second) to Loki. Each line keeps the trace ID of its request.
    logRecordProcessors: [
      new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: "http://localhost:3100/otlp/v1/logs" }) }),
    ],
    instrumentations: [
      // Incoming requests. Skip Prometheus reading /metrics every 3 seconds.
      new HttpInstrumentation({ ignoreIncomingRequestHook: (req) => req.url === "/metrics" }),
      // Uses the Express route in span names (POST /checkout). Skip Express's own extra spans.
      new ExpressInstrumentation({ ignoreLayersType: ["middleware", "router", "request_handler"] }),
      // fetch() calls to other services. Also adds the traceparent header that carries the trace ID.
      new UndiciInstrumentation(),
      // Database queries. Skip the "borrow a connection from the pool" spans.
      new PgInstrumentation({ ignoreConnectSpans: true }),
      // Every pino log line also goes to OpenTelemetry (and from there to Loki). Terminal output is unchanged.
      // logger.js already adds traceId/spanId itself, so don't add a second copy.
      new PinoInstrumentation({ disableLogCorrelation: true }),
    ],
  });
  sdk.start();

  // On Ctrl+C or stop, send the spans still waiting in the outbox before exiting.
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => sdk.shutdown().finally(() => process.exit(0)));
  }
}

// Attach an error to the current request's span, so Jaeger shows its message and stack trace.
function recordError(err) {
  const span = trace.getActiveSpan();
  if (!span) return;
  span.recordException(err);
  span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
}

module.exports = startTracing;
module.exports.recordError = recordError;
