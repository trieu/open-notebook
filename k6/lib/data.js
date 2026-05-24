// Hermetic test-data helpers used by scenario setup()/teardown().
// setup() seeds the records a phase needs and returns their IDs; teardown()
// removes them so a run leaves the database as it found it.
import { fail } from 'k6';
import { post, del, get, json } from './http.js';
import { RUN_TAG } from './config.js';

export function createNotebook() {
  const res = post('seed:notebook', '/notebooks', {
    name: `${RUN_TAG} notebook`,
    description: 'k6 load-test fixture',
  });
  if (res.status !== 200) fail(`seed notebook failed: ${res.status} ${res.body}`);
  return json(res).id;
}

// type:text source via the JSON path. async=true returns immediately with a
// command id (the row to poll); async=false blocks until processed.
export function createTextSource(notebookId, async_processing) {
  const res = post('seed:source', '/sources/json', {
    type: 'text',
    content: `${RUN_TAG} fixture body. Lorem ipsum dolor sit amet, consectetur.`,
    title: `${RUN_TAG} source`,
    notebooks: notebookId ? [notebookId] : [],
    embed: false,
    async_processing: !!async_processing,
  });
  if (res.status !== 200) fail(`seed source failed: ${res.status} ${res.body}`);
  const body = json(res);
  return { id: body.id, commandId: body.command_id };
}

export function createTransformation() {
  const res = post('seed:transformation', '/transformations', {
    name: `${RUN_TAG}_summary`,
    title: `${RUN_TAG} Summary`,
    description: 'k6 fixture transformation',
    prompt: 'Summarize the following text in one sentence.',
    apply_default: false,
  });
  if (res.status !== 200) fail(`seed transformation failed: ${res.status} ${res.body}`);
  return json(res).id;
}

export function createChatSession(notebookId) {
  const res = post('seed:chat-session', '/chat/sessions', { notebook_id: notebookId });
  if (res.status !== 200) fail(`seed chat session failed: ${res.status} ${res.body}`);
  return json(res).id;
}

export function createSourceChatSession(sourceId) {
  const res = post('seed:source-chat-session', `/sources/${sourceId}/chat/sessions`, {
    source_id: sourceId,
  });
  if (res.status !== 200) fail(`seed source chat session failed: ${res.status} ${res.body}`);
  return json(res).id;
}

// Submit a no-LLM example command that sleeps `delay`s, giving a job id whose
// status transitions over time — ideal for exercising poll loops.
export function submitProcessText(delay) {
  const res = post('seed:command', '/commands/jobs', {
    command: 'process_text',
    app: 'open_notebook',
    input: { text: `${RUN_TAG} payload`, operation: 'uppercase', delay_seconds: delay || 0 },
  });
  if (res.status !== 200) fail(`seed command failed: ${res.status} ${res.body}`);
  return json(res).job_id;
}

export function deleteNotebook(notebookId, deleteSources) {
  if (!notebookId) return;
  const q = deleteSources ? '?delete_exclusive_sources=true' : '';
  del('cleanup:notebook', `/notebooks/${notebookId}${q}`);
}

export function deleteSource(sourceId) {
  if (sourceId) del('cleanup:source', `/sources/${sourceId}`);
}

export function deleteTransformation(id) {
  if (id) del('cleanup:transformation', `/transformations/${id}`);
}

// Verify the API is reachable + auth is correct before a run starts, so a
// misconfigured PASSWORD fails loudly in setup() rather than as 401 noise.
export function preflight() {
  const res = get('preflight:notebooks', '/notebooks');
  if (res.status === 401) fail('preflight 401: set PASSWORD to the server OPEN_NOTEBOOK_PASSWORD');
  if (res.status >= 400) fail(`preflight failed: ${res.status} ${res.body} (is the API up at the BASE_URL?)`);
}
