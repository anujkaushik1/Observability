#!/bin/sh
# Starts Grafana with this project's settings (no Docker). Open http://localhost:3030
cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"

export GF_SERVER_HTTP_ADDR=127.0.0.1      # only reachable from this machine
export GF_SERVER_HTTP_PORT=3030           # 3000 is taken by the order service
export GF_AUTH_ANONYMOUS_ENABLED=true     # no login screen, fine for local learning
export GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
export GF_ANALYTICS_REPORTING_ENABLED=false
export GF_PLUGINS_PREINSTALL_SYNC=prometheus,jaeger  # Grafana 13 downloads these plugins; get them before starting
export GF_FEATURE_TOGGLES_ENABLE=jaegerEnableGrpcEndpoint  # use Jaeger's newer /api/v3 where the plugin supports it

# Where Grafana keeps its own files (git-ignored), and where it reads our setup from.
export GF_PATHS_DATA="$ROOT/grafana-data"
export GF_PATHS_LOGS="$ROOT/grafana-data/log"
export GF_PATHS_PLUGINS="$ROOT/grafana-data/plugins"
export GF_PATHS_PROVISIONING="$ROOT/grafana/provisioning"
export GRAFANA_DASHBOARDS="$ROOT/grafana/dashboards"

exec grafana server --homepath "$(brew --prefix grafana)/share/grafana"
