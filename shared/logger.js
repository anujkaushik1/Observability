// Structured JSON logger. Every line automatically gets a timestamp, the service name, and the
// trace and span IDs of the request being handled, so you can find the same request in Jaeger.
// Each line goes to the terminal and to a log file, logs/<service>.<date>.<n>.log,
// which Grafana Alloy reads and sends to Loki.
const path = require("path");
const pino = require("pino");
const { trace } = require("@opentelemetry/api");

function createLogger(service) {
  // The log file: a new one each day (logs/order.2026-10-28.1.log), only the last 7 days kept.
  const file = pino.transport({
    target: "pino-roll",
    options: {
      file: path.join(__dirname, "..", "logs", service), // project-root logs/, wherever the service is started from
      frequency: "daily",
      dateFormat: "yyyy-MM-dd",
      extension: ".log",
      mkdir: true,
      limit: { count: 7, removeOtherLogFiles: true }, // also clean up files from earlier runs (nodemon restarts)
    },
  });

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
  },
  // Send every line to both places: the terminal and the log file.
  pino.multistream([{ stream: process.stdout }, { stream: file }]));
}

module.exports = createLogger;
