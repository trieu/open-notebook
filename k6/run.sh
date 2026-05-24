#!/usr/bin/env bash
# Runs a k6 phase against the API. Native k6 if on PATH, else grafana/k6 Docker.
#
# Usage:
#   ./run.sh phase1
#   BASE_URL=http://localhost:5055 PASSWORD=secret ./run.sh phase2
#   CHAT_MODEL=model:abc LLM_VUS=2 ./run.sh phase4
#
# Any env var the scenarios read (BASE_URL, PASSWORD, CHAT_MODEL, SEARCH_TYPE,
# SYNC_INGEST, ASK_*_MODEL, PODCAST_*, ...) is passed straight through.
set -euo pipefail

phase="${1:?usage: run.sh <phase>  (phase1|phase1b|phase2|phase3|phase4|phase5)}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$(ls "$here/scenarios/${phase}"*.js 2>/dev/null | head -n1 || true)"
[ -n "$script" ] || { echo "No scenario matching '$phase' in $here/scenarios" >&2; exit 1; }

: "${BASE_URL:=http://localhost:5055}"
: "${PASSWORD:=${OPEN_NOTEBOOK_PASSWORD:-}}"

# Collect every var the scenarios might read into --env flags.
env_flags=()
for k in BASE_URL PASSWORD RUN_TAG SEARCH_TYPE EMBED_ITEM_TYPE SYNC_INGEST \
         CHAT_MODEL TRANSFORM_MODEL ASK_STRATEGY_MODEL ASK_ANSWER_MODEL ASK_FINAL_MODEL \
         LLM_VUS LLM_DURATION PODCAST_EPISODE_PROFILE PODCAST_SPEAKER_PROFILE PODCAST_JOB_ID; do
  v="${!k:-}"
  [ -n "$v" ] && env_flags+=(--env "$k=$v")
done

# k6 writes its built-in web-dashboard HTML here at end of run (local only).
mkdir -p "$here/reports"
report_name="$(basename "${script%.js}")-$(date +%Y%m%d-%H%M%S).html"

if command -v k6 >/dev/null 2>&1; then
  echo "Running native k6: $(basename "$script")"
  echo "HTML report -> $here/reports/$report_name"
  export K6_WEB_DASHBOARD=true
  export K6_WEB_DASHBOARD_EXPORT="$here/reports/$report_name"
  exec k6 run "${env_flags[@]}" "$script"
fi

# Docker fallback: rewrite localhost so the container can reach the host API.
echo "k6 not on PATH; using Docker grafana/k6"
docker_env=()
for f in "${env_flags[@]}"; do
  case "$f" in
    BASE_URL=*localhost*|BASE_URL=*127.0.0.1*)
      f="${f/localhost/host.docker.internal}"; f="${f/127.0.0.1/host.docker.internal}";;
  esac
  docker_env+=("$f")
done
echo "HTML report -> $here/reports/$report_name"
exec docker run --rm -i \
  --add-host host.docker.internal:host-gateway \
  -e K6_WEB_DASHBOARD=true \
  -e "K6_WEB_DASHBOARD_EXPORT=/k6/reports/$report_name" \
  -v "$here:/k6" -w /k6 \
  grafana/k6 run "${docker_env[@]}" "scenarios/$(basename "$script")"
