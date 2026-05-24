// Threshold presets. p95 latency budgets differ wildly by phase: a notebook
// list should be fast, an LLM call should not be held to the same bar.
export const reads = {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p95<400', 'p99<1000'],
};

export const writes = {
  http_req_failed: ['rate<0.02'],
  http_req_duration: ['p95<1500'],
};

// Ingestion/search hit content extraction or the embedding provider.
export const mid = {
  http_req_failed: ['rate<0.05'],
  http_req_duration: ['p95<5000'],
};

// LLM workflows block for seconds-to-minutes; we measure that they complete
// and don't error out, not raw latency. Failure budget only.
export const llm = {
  http_req_failed: ['rate<0.10'],
};

// Async submit must return fast even though the job runs for a while.
export const submit = {
  http_req_failed: ['rate<0.02'],
  http_req_duration: ['p95<800'],
};
