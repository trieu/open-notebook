// Phase 1 — hot reads + CRUD. No LLM, no provider cost. Hammers the
// SurrealDB-connection / FastAPI-concurrency path (the suspected first
// bottleneck). setup() seeds a notebook + source + note to read against.
import { sleep } from 'k6';
import { get, post, json } from '../lib/http.js';
import { createNotebook, createTextSource, deleteNotebook, preflight } from '../lib/data.js';
import { reads } from '../lib/thresholds.js';
import { RUN_TAG } from '../lib/config.js';

export const options = {
  scenarios: {
    hot_reads: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '20s', target: 20 },
        { duration: '40s', target: 50 },
        { duration: '20s', target: 0 },
      ],
    },
  },
  thresholds: reads,
};

export function setup() {
  preflight();
  const notebookId = createNotebook();
  const source = createTextSource(notebookId, false);
  // one note so GET /notes?notebook_id has a row
  post('seed:note', '/notes', {
    title: `${RUN_TAG} note`,
    content: 'k6 fixture note',
    notebook_id: notebookId,
  });
  return { notebookId, sourceId: source.id };
}

export default function (data) {
  // unauthenticated, cheapest possible — config/auth surface
  get('auth-status', '/auth/status');
  get('config', '/config');

  // hot reads
  get('notebooks-list', '/notebooks');
  get('notebook-get', `/notebooks/${data.notebookId}`);
  get('sources-list', `/sources?notebook_id=${data.notebookId}&limit=50`);
  get('source-get', `/sources/${data.sourceId}`);
  get('notes-list', `/notes?notebook_id=${data.notebookId}`);

  // context assembly (no LLM — just gathers source/note text + token count)
  post('notebook-context', `/notebooks/${data.notebookId}/context`, {
    notebook_id: data.notebookId,
  });

  // a CRUD write every iteration, cleaned up immediately to avoid unbounded growth
  const created = post('notebook-create', '/notebooks', {
    name: `${RUN_TAG} ephemeral`,
    description: 'created+deleted each iteration',
  });
  const body = json(created);
  if (body && body.id) deleteNotebook(body.id, false);

  sleep(0.5);
}

export function teardown(data) {
  deleteNotebook(data.notebookId, true);
}
