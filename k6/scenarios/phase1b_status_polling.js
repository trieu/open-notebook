// Phase 1b — status polling. Clients poll these in tight loops while jobs run;
// under N concurrent ingestions this is often the real-world hot path.
// setup() submits a delayed example command + an async source ingestion so the
// poll targets actually exist and transition state during the run.
import { sleep } from 'k6';
import { get } from '../lib/http.js';
import {
  createNotebook,
  createTextSource,
  submitProcessText,
  deleteNotebook,
  preflight,
} from '../lib/data.js';
import { reads } from '../lib/thresholds.js';
import { PODCAST_JOB_ID } from '../lib/config.js';

export const options = {
  scenarios: {
    polling: {
      executor: 'constant-vus',
      vus: 40,
      duration: '60s',
    },
  },
  thresholds: reads,
};

export function setup() {
  preflight();
  const notebookId = createNotebook();
  // async ingestion → source row carries a command id and a status that moves
  const source = createTextSource(notebookId, true);
  // a long-ish example job so its status stays pollable for the whole run
  const jobId = submitProcessText(90);
  return { notebookId, sourceId: source.id, jobId, podcastJobId: PODCAST_JOB_ID };
}

export default function (data) {
  get('source-status', `/sources/${data.sourceId}/status`);
  get('command-job', `/commands/jobs/${data.jobId}`);
  // podcast job polling only when a real job id was supplied (generation needs TTS)
  if (data.podcastJobId) get('podcast-job', `/podcasts/jobs/${data.podcastJobId}`);
  sleep(0.2); // tight poll cadence
}

export function teardown(data) {
  deleteNotebook(data.notebookId, true);
}
