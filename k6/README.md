# k6 performance tests

Load tests for the Open Notebook / LEO Agentic Notebook API, organized by
load-test priority. Each phase is a standalone k6 script under `scenarios/`.

## Layout

```
k6/
  lib/
    config.js       env-driven config (BASE_URL, PASSWORD, model IDs, toggles)
    http.js         authed request wrapper + per-endpoint tagging
    thresholds.js   pass/fail latency + error budgets per phase type
    data.js         setup()/teardown() seed + cleanup helpers
  scenarios/
    phase1_hot_reads.js       hot reads + CRUD (no LLM)
    phase1b_status_polling.js status-poll loops
    phase2_search.js          search + embed (+ ask, gated)
    phase3_ingestion.js       ingestion (low VU, blocking path)
    phase4_llm.js             chat / ask / transform (low VU, gated)
    phase5_async_submit.js    async submit + poll latency
  run.ps1 / run.sh            runner (native k6 or grafana/k6 Docker)
```

## Prerequisites

- The API running and reachable (default `http://localhost:5055`).
- Either the `k6` binary on PATH, **or** Docker (the runner falls back to the
  `grafana/k6` image automatically). On this machine k6 is not installed but
  Docker is, so runs go through the image by default.
- `PASSWORD` = the server's `OPEN_NOTEBOOK_PASSWORD`. If the server has no
  password set, leave it empty — auth is skipped server-side.

## Running

PowerShell (Windows):

```powershell
.\run.ps1 phase1
.\run.ps1 phase2 -Password "your-password"
.\run.ps1 phase4 -EnvVars @{ CHAT_MODEL='model:abc'; LLM_VUS='2' }
```

Bash:

```bash
./run.sh phase1
PASSWORD=your-password ./run.sh phase2
CHAT_MODEL=model:abc LLM_VUS=2 ./run.sh phase4
```

> Docker note: when running via the image, a `localhost` BASE_URL is rewritten
> to `host.docker.internal` so the container can reach the host's API.

## HTML report

Every run writes k6's built-in **web-dashboard** report (time-series charts:
HTTP rate, p95/p99, VUs, error rate) to `k6/reports/<phase>-<timestamp>.html`.
The runner sets `K6_WEB_DASHBOARD=true` + `K6_WEB_DASHBOARD_EXPORT` for you;
when running via Docker it exports to the mounted `/k6/reports` so the file
lands on the host. Reports are git-ignored. Requires k6 ≥ 0.49 (the
`grafana/k6` image satisfies this). Open the file in a browser after the run.

## How test data works

Every scenario is **hermetic**: `setup()` creates the records it needs
(notebook, source, note, chat sessions, transformation, example job) and
returns their IDs; `teardown()` deletes the notebook and its exclusive sources.
A run leaves the database as it found it. Seed records are tagged with a
`RUN_TAG` (e.g. `k6-1700000000000`) so any stragglers are easy to spot.

`setup()` also runs a **preflight** GET `/notebooks`: a 401 means `PASSWORD` is
wrong, a connection error means the API isn't up at `BASE_URL` — either way the
run fails loudly before generating load.

## Phases

| Phase | Script | Endpoints | Cost | Notes |
|-------|--------|-----------|------|-------|
| 1  | phase1_hot_reads     | GET notebooks/{id}, sources/{id}, notes, POST notebooks, POST notebooks/{id}/context, GET auth/status, config | none | Exercises SurrealDB pool + FastAPI concurrency. Ramps to 50 VUs. |
| 1b | phase1b_status_polling | GET sources/{id}/status, commands/jobs/{id}, podcasts/jobs/{id} | none | Tight poll loop, 40 VUs. Podcast poll only if `PODCAST_JOB_ID` set. |
| 2  | phase2_search        | POST search, embed, search/ask/simple | mid | `SEARCH_TYPE=text` (default) = no provider; `vector` hits embeddings (use Ollama). ask/simple runs only if `ASK_*_MODEL` set. |
| 3  | phase3_ingestion     | POST sources/json, sources/{id}/retry | mid | **Low VU (max 8)** by design — finds the blocking-ingestion stall point. `SYNC_INGEST=false` to test the async path. |
| 4  | phase4_llm           | POST chat/execute, source chat messages, transformations/execute, search/ask | high | **Low VU** (`LLM_VUS`, default 3). Point server default models at Ollama/stub. transform/ask sub-calls gated on model env. |
| 5  | phase5_async_submit  | POST commands/jobs (+poll), podcasts/generate | low submit / high job | Uses the no-LLM `process_text` example command. Podcast submit only if `PODCAST_*` profiles set — never mass-generated. |

## Environment variables

| Var | Default | Used by |
|-----|---------|---------|
| `BASE_URL` | `http://localhost:5055` | all |
| `PASSWORD` | empty (env `OPEN_NOTEBOOK_PASSWORD`) | all (omit if server has no password) |
| `RUN_TAG` | `k6-<timestamp>` | seed record naming |
| `SEARCH_TYPE` | `text` | phase2 (`text`\|`vector`) |
| `EMBED_ITEM_TYPE` | `source` | phase2 |
| `SYNC_INGEST` | `true` | phase3 (`false` = async path) |
| `CHAT_MODEL` | — | phase4 (optional; chat uses server default if unset) |
| `TRANSFORM_MODEL` | — | phase4 transformations/execute (skipped if unset) |
| `ASK_STRATEGY_MODEL`, `ASK_ANSWER_MODEL`, `ASK_FINAL_MODEL` | — | phase2 ask/simple, phase4 ask (all three required) |
| `LLM_VUS`, `LLM_DURATION` | `3`, `60s` | phase4 |
| `PODCAST_EPISODE_PROFILE`, `PODCAST_SPEAKER_PROFILE` | — | phase5 podcast submit (both required) |
| `PODCAST_JOB_ID` | — | phase1b podcast poll |

## Do NOT load-test

These fan out to live provider APIs (burn quota, 429 for reasons unrelated to
your system) and are **not** in any scenario — smoke-test by hand at most:
`POST /models/{id}/test`, `POST /models/sync`, `POST /credentials/{id}/test`,
`/credentials/{id}/discover`, `/register-models`, `/models/auto-assign`.
Admin/config routes (settings, episode/speaker-profiles, languages) are
low-frequency and intentionally skipped.

## Authentication

Auth is a single bearer token equal to the server password
(`Authorization: Bearer {OPEN_NOTEBOOK_PASSWORD}` — see `api/auth.py`). There is
no login/token exchange. Only `/api/auth/status`, `/api/config`, `/`, `/health`,
`/docs`, `/openapi.json`, `/redoc` are unauthenticated. If
`OPEN_NOTEBOOK_PASSWORD` is unset server-side, all auth is skipped.
