// OpenTelemetry tracing: records each request as spans and sends them to Jaeger.
// Call it first in every service, before express or pg are loaded, so it can hook into them.
const { NodeSDK } = require("@opentelemetry/sdk-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
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
    instrumentations: [
      // Incoming requests. Skip Prometheus reading /metrics every 3 seconds.
      new HttpInstrumentation({ ignoreIncomingRequestHook: (req) => req.url === "/metrics" }),
      // Uses the Express route in span names (POST /checkout). Skip Express's own extra spans.
      new ExpressInstrumentation({ ignoreLayersType: ["middleware", "router", "request_handler"] }),
      // fetch() calls to other services. Also adds the traceparent header that carries the trace ID.
      new UndiciInstrumentation(),
      // Database queries. Skip the "borrow a connection from the pool" spans.
      new PgInstrumentation({ ignoreConnectSpans: true }),
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
