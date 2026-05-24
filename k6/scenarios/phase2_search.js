// Phase 2 — search (the core read path of a NotebookLM clone).
//   POST /search        text mode = pure SurrealDB; vector mode hits embeddings
//   POST /embed         async submit of an embedding job for the seeded source
//   POST /search/ask/simple  full ask graph (LLM) — only when ASK_* models set
// Run vector/ask against local Ollama, never a paid provider.
import { sleep } from 'k6';
import { post } from '../lib/http.js';
import { createNotebook, createTextSource, deleteNotebook, preflight } from '../lib/data.js';
import { mid } from '../lib/thresholds.js';
import { SEARCH_TYPE, MODELS, EMBED_ITEM_TYPE } from '../lib/config.js';

export const options = {
  scenarios: {
    search: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '20s', target: 15 },
        { duration: '30s', target: 30 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: mid,
};

const QUERIES = ['lorem', 'fixture', 'research', 'summary', 'consectetur'];
const askEnabled = MODELS.askStrategy && MODELS.askAnswer && MODELS.askFinal;

export function setup() {
  preflight();
  const notebookId = createNotebook();
  const source = createTextSource(notebookId, false);
  return { notebookId, sourceId: source.id };
}

export default function (data) {
  const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];

  post('search', '/search', {
    query: q,
    type: SEARCH_TYPE, // text (default, no provider) or vector
    limit: 50,
    search_sources: true,
    search_notes: true,
    minimum_score: 0.2,
  });

  // async embed of the existing source — fast submit, exercises the embed route
  post('embed', '/embed', {
    item_id: data.sourceId,
    item_type: EMBED_ITEM_TYPE,
    async_processing: true,
  });

  // LLM-backed; self-skips unless the three ask models are configured
  if (askEnabled) {
    post('ask-simple', '/search/ask/simple', {
      question: `What does the text say about ${q}?`,
      strategy_model: MODELS.askStrategy,
      answer_model: MODELS.askAnswer,
      final_answer_model: MODELS.askFinal,
    });
  }

  sleep(1);
}

export function teardown(data) {
  deleteNotebook(data.notebookId, true);
}
