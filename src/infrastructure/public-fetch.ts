import { readBoundedResponseBody } from '../mojang/bounded-body.js';
import { WorkBudget, WorkBudgetExceededError } from './work-budget.js';

/** Public, credential-free assets only. Deduplication never touches token-bearing traffic. */
export function createPublicFetch(fetchImplementation: typeof fetch = fetch): typeof fetch {
  const providers = new Map<string, { budget: WorkBudget; retryAt: number }>();
  interface BufferedResponse {
    body: Uint8Array | null;
    init: ResponseInit;
  }
  const pending = new Map<string, Promise<BufferedResponse>>();
  return async (input, init): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (init?.method !== undefined && init.method !== 'GET')
      throw new TypeError('Public GET required');
    let provider = providers.get(url.origin);
    if (provider === undefined) {
      if (providers.size >= 16) throw new WorkBudgetExceededError('Upstream budget exhausted');
      provider = { budget: new WorkBudget(8, 32), retryAt: 0 };
      providers.set(url.origin, provider);
    }
    if (provider.retryAt > Date.now()) throw new WorkBudgetExceededError('Upstream cooling down');
    const key = url.href;
    const existing = pending.get(key);
    if (existing !== undefined) {
      const result = await existing;
      return new Response(result.body, result.init);
    }
    const state = provider;
    const operation = state.budget.run(async (): Promise<BufferedResponse> => {
      try {
        const response = await fetchImplementation(input, {
          ...init,
          redirect: 'error',
          signal:
            init?.signal === undefined || init.signal === null
              ? AbortSignal.timeout(5000)
              : AbortSignal.any([init.signal, AbortSignal.timeout(5000)]),
        });
        if (response.status === 429 || response.status >= 500) state.retryAt = Date.now() + 5000;
        const body = await readBoundedResponseBody(response, 2 * 1024 * 1024, 'Public upstream');
        return {
          body: [204, 205, 304].includes(response.status) ? null : new Uint8Array(body),
          init: {
            headers: response.headers,
            status: response.status,
            statusText: response.statusText,
          },
        };
      } catch (error: unknown) {
        state.retryAt = Date.now() + 5000;
        throw error;
      }
    });
    pending.set(key, operation);
    try {
      const result = await operation;
      return new Response(result.body, result.init);
    } finally {
      pending.delete(key);
    }
  };
}
