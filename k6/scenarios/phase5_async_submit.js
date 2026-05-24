// Phase 5 — async submit. Submission returns fast; the job itself is the cost.
// We measure submit latency + the subsequent poll loop, NOT mass job execution.
//   POST /commands/jobs   submit a no-LLM example command, then poll its status
//   POST /podcasts/generate  submit only (off unless PODCAST_* profiles set),
//                            since the job runs TTS — never mass-generate.
import { sleep } from 'k6';
import { post, get, json } from '../lib/http.js';
import { preflight } from '../lib/data.js';
import { submit } from '../lib/thresholds.js';
import { RUN_TAG, PODCAST } from '../lib/config.js';

const podcastEnabled = PODCAST.episodeProfile && PODCAST.speakerProfile;

export const options = {
  scenarios: {
    async_submit: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '15s', target: 10 },
        { duration: '30s', target: 25 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: submit,
};

export function setup() {
  preflight();
}

export default function () {
  // submit a short example job (no LLM/TTS) — measures submit-path latency
  const res = post('command-submit', '/commands/jobs', {
    command: 'process_text',
    app: 'open_notebook',
    input: { text: `${RUN_TAG} ${__VU}-${__ITER}`, operation: 'reverse', delay_seconds: 2 },
  });
  const jobId = (json(res) || {}).job_id;

  // a couple of poll hits to mimic a client watching the job, no busy-wait
  if (jobId) {
    get('command-poll', `/commands/jobs/${jobId}`);
    sleep(1);
    get('command-poll', `/commands/jobs/${jobId}`);
  }

  // submission-latency only; the episode itself is never generated in bulk
  if (podcastEnabled) {
    post('podcast-submit', '/podcasts/generate', {
      episode_profile: PODCAST.episodeProfile,
      speaker_profile: PODCAST.speakerProfile,
      episode_name: `${RUN_TAG}-${__VU}-${__ITER}`,
      content: 'k6 submit-latency probe; not intended to complete.',
    });
  }

  sleep(1);
}
