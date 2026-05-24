// Phase 3 — ingestion (known risk: content processing is sync/blocking).
// Deliberately LOW VU: the goal is to find how many concurrent ingestions
// stall the whole API, not to push throughput. Each VU creates a source and
// (synchronously) waits, so a small VU count reveals head-of-line blocking.
//
// SYNC_INGEST=true (default) uses async_processing:false to measure the
// blocking path. Set SYNC_INGEST=false to submit async and measure queue time.
import { sleep } from 'k6';
import { post, json } from '../lib/http.js';
import { createNotebook, deleteSource, deleteNotebook, preflight } from '../lib/data.js';
import { mid } from '../lib/thresholds.js';
import { RUN_TAG } from '../lib/config.js';

const SYNC = (__ENV.SYNC_INGEST || 'true') !== 'false';

export const options = {
  scenarios: {
    ingestion: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '15s', target: 3 },
        { duration: '30s', target: 8 }, // low ceiling on purpose
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: mid,
};

export function setup() {
  preflight();
  return { notebookId: createNotebook() };
}

export default function (data) {
  // create text source — the core ingestion path
  const res = post('source-create', '/sources/json', {
    type: 'text',
    content: `${RUN_TAG} ingest ${__VU}-${__ITER}. Lorem ipsum dolor sit amet.`,
    title: `${RUN_TAG} ingest`,
    notebooks: [data.notebookId],
    embed: false,
    async_processing: !SYNC,
  });
  const body = json(res);

  if (body && body.id) {
    // retry re-runs the processing pipeline on the same source
    post('source-retry', `/sources/${body.id}/retry`, {});
    deleteSource(body.id); // keep the DB from growing across iterations
  }

  sleep(1);
}

export function teardown(data) {
  deleteNotebook(data.notebookId, true);
}
