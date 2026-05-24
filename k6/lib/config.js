// Shared configuration for all k6 scenarios.
// Everything is driven by environment variables (k6 reads them via __ENV).
//
// Required for most phases:
//   BASE_URL   - API root, no trailing slash. Default http://localhost:5055
//   PASSWORD   - value of OPEN_NOTEBOOK_PASSWORD on the server. If the server
//                has no password set, leave this empty and auth is skipped.
//
// Optional model IDs (only needed by LLM phases; sub-scenarios self-skip when absent):
//   CHAT_MODEL, TRANSFORM_MODEL,
//   ASK_STRATEGY_MODEL, ASK_ANSWER_MODEL, ASK_FINAL_MODEL,
//   EMBED_ITEM_TYPE (source|note, default source)
//
// Search tuning:
//   SEARCH_TYPE  - text | vector (default text; vector hits the embedding provider)
//
// Phase 5 podcast (off by default; needs configured profiles + TTS):
//   PODCAST_EPISODE_PROFILE, PODCAST_SPEAKER_PROFILE
//
// Phase 1b optional external job to poll:
//   PODCAST_JOB_ID - an existing podcast job id to poll (skipped if unset)

function env(name, fallback) {
  const v = __ENV[name];
  return v === undefined || v === '' ? fallback : v;
}

export const BASE_URL = env('BASE_URL', 'http://localhost:5055').replace(/\/+$/, '');
export const API = `${BASE_URL}/api`;

// The bearer token IS the server password (api/auth.py). Empty => no header.
export const PASSWORD = env('PASSWORD', '');

export const HEADERS = (() => {
  const h = { 'Content-Type': 'application/json' };
  if (PASSWORD) h['Authorization'] = `Bearer ${PASSWORD}`;
  return h;
})();

export const SEARCH_TYPE = env('SEARCH_TYPE', 'text'); // text = no embedding provider

export const MODELS = {
  chat: env('CHAT_MODEL', ''),
  transform: env('TRANSFORM_MODEL', ''),
  askStrategy: env('ASK_STRATEGY_MODEL', ''),
  askAnswer: env('ASK_ANSWER_MODEL', ''),
  askFinal: env('ASK_FINAL_MODEL', ''),
};

export const EMBED_ITEM_TYPE = env('EMBED_ITEM_TYPE', 'source');

export const PODCAST = {
  episodeProfile: env('PODCAST_EPISODE_PROFILE', ''),
  speakerProfile: env('PODCAST_SPEAKER_PROFILE', ''),
};

export const PODCAST_JOB_ID = env('PODCAST_JOB_ID', '');

// A small unique tag so seeded test records are easy to spot / clean up.
export const RUN_TAG = env('RUN_TAG', `k6-${Date.now()}`);
