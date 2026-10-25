import type { Advisor, Observation } from './agent.ts';

/** Default Workers AI model (supports JSON mode). Override with the WORKERS_AI_MODEL variable. */
export const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/** The only answers an adviser may give. Anything else counts as no answer. */
export const ALLOWED_ACTIONS = ['restore_catalog', 'resume_adapter', 'escalate'] as const;

export const SYSTEM_PROMPT = [
  'You are the second-opinion reasoner for an on-call agent.',
  'You receive three booleans describing a reservation service.',
  'Choose exactly one action:',
  '- restore_catalog: the slot catalog is unavailable and nothing else is wrong.',
  '- resume_adapter: the reservation adapter is paused and nothing else is wrong.',
  '- escalate: anything else, including an unknown dependency failure.',
  'Answer only with JSON: {"action":"<one action>"}. Never suggest code or other actions.',
].join('\n');

/** JSON Schema used with Workers AI JSON mode: exactly one allowlisted action. */
export const ACTION_SCHEMA = {
  type: 'object',
  properties: { action: { type: 'string', enum: [...ALLOWED_ACTIONS] } },
  required: ['action'],
};

/** Extracts one allowed action from model output, or throws. Reasoning blocks are ignored. */
export function parseAction(output: unknown): string {
  const raw = typeof output === 'string' ? output : JSON.stringify(output ?? '');
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const keyed = [...text.matchAll(/"action"\s*:\s*"([a-z_]+)"/g)].map(m => m[1]);
  const last = keyed.at(-1);
  if (last && (ALLOWED_ACTIONS as readonly string[]).includes(last)) return last;
  const found = ALLOWED_ACTIONS.filter(action => text.includes(action));
  if (found.length === 1) return found[0];
  throw new Error('adviser_output_invalid');
}

/**
 * Extracts the answer text from the response shapes Workers AI models use: `{ response }` or the
 * OpenAI-compatible `{ choices: [{ message: { content } }] }`. Reasoning traces are ignored.
 */
export function modelText(result: unknown): unknown {
  const r = result as {
    response?: unknown;
    choices?: { message?: { content?: unknown } }[];
  } | null;
  if (r && typeof r === 'object') {
    if (r.response !== undefined && r.response !== null) return r.response;
    const content = r.choices?.[0]?.message?.content;
    if (content !== undefined && content !== null) return content;
  }
  return result;
}

export interface WorkersAI {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

/** Cloudflare Workers AI (free daily allocation). Used automatically when the AI binding exists. */
export function workersAiAdvisor(ai: WorkersAI, model: string, timeoutMs = 15000): Advisor {
  const advise: Advisor = async (observation: Observation) => {
    const request = {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(observation) },
      ],
      max_tokens: 256,
      temperature: 0,
    };
    const timed = (call: Promise<unknown>) =>
      Promise.race([
        call,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('adviser_timeout')), timeoutMs),
        ),
      ]);
    let result: unknown;
    try {
      // JSON mode constrains the answer to the action schema on models that support it.
      result = await timed(
        ai.run(model, {
          ...request,
          response_format: { type: 'json_schema', json_schema: ACTION_SCHEMA },
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'adviser_timeout') throw error;
      result = await timed(ai.run(model, request)); // model without JSON mode support
    }
    return parseAction(modelText(result));
  };
  advise.label = `Workers AI ${model}`;
  return advise;
}

/** A local Ollama server, for running the adviser without any cloud account. */
export function ollamaAdvisor(baseUrl: string, model: string, timeoutMs = 20000): Advisor {
  const advise: Advisor = async (observation: Observation) => {
    const response = await fetch(new URL('/api/chat', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        stream: false,
        format: 'json',
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(observation) },
        ],
      }),
    });
    if (!response.ok) throw new Error('adviser_unavailable');
    const output = (await response.json()) as { message?: { content?: string } };
    return parseAction(output.message?.content);
  };
  advise.label = `Ollama ${model}`;
  return advise;
}

export interface AdviserSettings {
  AI?: WorkersAI;
  WORKERS_AI_MODEL?: string;
  OLLAMA_URL?: string;
  OLLAMA_MODEL?: string;
}

/** Workers AI in the cloud, Ollama when configured locally, otherwise the deterministic policy alone. */
export function selectAdvisor(env: AdviserSettings): Advisor | undefined {
  if (env.AI) return workersAiAdvisor(env.AI, env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL);
  if (env.OLLAMA_URL) return ollamaAdvisor(env.OLLAMA_URL, env.OLLAMA_MODEL || 'qwen2.5:0.5b');
  return undefined;
}
