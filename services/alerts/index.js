// Alerts service: receives alerts from Grafana (a "webhook") and saves each one in the alerts table.
require('../../shared/tracing')('alerts'); // must stay first: starts tracing before express and pg load
const { recordError } = require('../../shared/tracing');
const log = require('../../shared/logger')('alerts');
const express = require('express');
const db = require('../../shared/db');

const PORT = process.env.PORT || 3004;
const app = express();
app.use(express.json());

// Grafana writes "0001-01-01T00:00:00Z" for "no end time yet" (the alert is still firing).
const toTime = (value) => (value && !value.startsWith('0001-') ? value : null);

// POST /alerts  <- Grafana sends { status, alerts: [ { status, labels, annotations, startsAt, endsAt, fingerprint } ] }
//               -> 204, one row saved per alert
app.post('/alerts', async (req, res) => {
  const alerts = req.body?.alerts ?? [];

  for (const alert of alerts) {
    await db.query(
      `INSERT INTO alerts (status, alert_name, severity, summary, description, started_at, ended_at, fingerprint, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        alert.status,
        alert.labels?.alertname ?? 'unknown',
        alert.labels?.severity ?? null,
        alert.annotations?.summary ?? null,
        alert.annotations?.description ?? null,
        toTime(alert.startsAt),
        toTime(alert.endsAt),
        alert.fingerprint ?? null,
        alert,
      ]
    );
    log.info({ status: alert.status, alertName: alert.labels?.alertname }, 'Alert saved');
  }

  res.status(204).end();
});

app.use((err, req, res, next) => {
  log.error({ err }, 'Saving the alert failed');
  recordError(err); // shows the error message and stack trace in Jaeger
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'internal error' });
});

app.listen(PORT, () => log.info({ port: PORT }, 'Alerts service started'));
