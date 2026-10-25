import type { Advisor, Observation } from './agent.ts';

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

/** Extracts one allowed action from free-form model output, or throws. */
export function parseAction(output: unknown): string {
  const text = typeof output === 'string' ? output : JSON.stringify(output ?? '');
  try {
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (ALLOWED_ACTIONS.includes(parsed?.action)) return parsed.action;
  } catch {
    /* fall through to strict matching */
  }
  const found = ALLOWED_ACTIONS.filter(action => text.includes(action));
  if (found.length === 1) return found[0];
  throw new Error('adviser_output_invalid');
}

export interface WorkersAI {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

/** Cloudflare Workers AI (free daily allocation). Used automatically when the AI binding exists. */
export function workersAiAdvisor(ai: WorkersAI, model: string, timeoutMs = 15000): Advisor {
  const advise: Advisor = async (observation: Observation) => {
    const call = ai.run(model, {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(observation) },
      ],
      max_tokens: 40,
      temperature: 0,
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('adviser_timeout')), timeoutMs),
    );
    const result = (await Promise.race([call, timeout])) as { response?: unknown };
    return parseAction(result?.response ?? result);
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
  if (env.AI)
    return workersAiAdvisor(env.AI, env.WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct');
  if (env.OLLAMA_URL) return ollamaAdvisor(env.OLLAMA_URL, env.OLLAMA_MODEL || 'qwen2.5:0.5b');
  return undefined;
}
