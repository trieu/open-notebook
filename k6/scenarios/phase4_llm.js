// Phase 4 — LLM workflows. Blocking, seconds-to-minutes, no server timeout.
// LOW VU on purpose: measuring the concurrency limit and timeout behavior, not
// throughput. Point the server's default models at Ollama/a stub before running.
//   POST /chat/execute                      uses the server default chat model
//   POST /sources/{id}/chat/.../messages    source-scoped chat (SSE)
//   POST /transformations/execute           needs TRANSFORM_MODEL
//   POST /search/ask                        needs ASK_* models (SSE stream)
// Each sub-call self-skips when its required model env is absent.
import { sleep } from 'k6';
import { post } from '../lib/http.js';
import {
  createNotebook,
  createTextSource,
  createChatSession,
  createSourceChatSession,
  createTransformation,
  deleteNotebook,
  deleteTransformation,
  preflight,
} from '../lib/data.js';
import { llm } from '../lib/thresholds.js';
import { MODELS } from '../lib/config.js';

export const options = {
  scenarios: {
    llm_workflows: {
      executor: 'constant-vus',
      vus: Number(__ENV.LLM_VUS || 3), // keep tiny
      duration: __ENV.LLM_DURATION || '60s',
    },
  },
  thresholds: llm,
};

const askEnabled = MODELS.askStrategy && MODELS.askAnswer && MODELS.askFinal;

export function setup() {
  preflight();
  const notebookId = createNotebook();
  const source = createTextSource(notebookId, false);
  const chatSessionId = createChatSession(notebookId);
  const sourceChatSessionId = createSourceChatSession(source.id);
  const transformationId = createTransformation();
  return { notebookId, sourceId: source.id, chatSessionId, sourceChatSessionId, transformationId };
}

export default function (data) {
  // notebook chat — empty context is valid; uses default chat model
  post('chat-execute', '/chat/execute', {
    session_id: data.chatSessionId,
    message: 'Summarize what you know in one sentence.',
    context: {},
  });

  // source-scoped chat (streaming response)
  post(
    'source-chat-message',
    `/sources/${data.sourceId}/chat/sessions/${data.sourceChatSessionId}/messages`,
    { message: 'What is this source about?' },
  );

  if (MODELS.transform) {
    post('transformation-execute', '/transformations/execute', {
      transformation_id: data.transformationId,
      input_text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      model_id: MODELS.transform,
    });
  }

  if (askEnabled) {
    post('ask-stream', '/search/ask', {
      question: 'Give a short overview of the indexed material.',
      strategy_model: MODELS.askStrategy,
      answer_model: MODELS.askAnswer,
      final_answer_model: MODELS.askFinal,
    });
  }

  sleep(1);
}

export function teardown(data) {
  deleteTransformation(data.transformationId);
  deleteNotebook(data.notebookId, true);
}
