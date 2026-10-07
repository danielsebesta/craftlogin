import { createServer } from 'node:http';

import { describe, expect, it } from 'vitest';

import { fetchOptifineCape } from '../../src/avatars/cape-providers.js';
import { createPublicFetch } from '../../src/infrastructure/public-fetch.js';
import { InfrastructureReadinessCheck } from '../../src/infrastructure/readiness.js';
import { WorkBudget } from '../../src/infrastructure/work-budget.js';

describe('bounded work and upstream requests', (): void => {
  it('coalesces 800 readiness probes and recovers after failure', async (): Promise<void> => {
    const gate = Promise.withResolvers<undefined>();
    let queries = 0;
    let pings = 0;
    const readiness = new InfrastructureReadinessCheck(
      {
        $queryRaw: (): Promise<unknown> => {
          queries += 1;
          return gate.promise;
        },
      },
      {
        ping: (): Promise<'PONG'> => {
          pings += 1;
          return Promise.resolve('PONG');
        },
      },
    );
    const burst = Promise.all(Array.from({ length: 800 }, () => readiness.check()));
    expect(queries).toBe(1);
    expect(pings).toBe(1);
    gate.resolve(undefined);
    await burst;
    await readiness.check();
    expect(queries).toBe(1);
    let broken = true;
    const recovering = new InfrastructureReadinessCheck(
      {
        $queryRaw: (): Promise<unknown> =>
          broken ? Promise.reject(new Error('offline')) : Promise.resolve(1),
      },
      { ping: (): Promise<'PONG'> => Promise.resolve('PONG') },
    );
    await expect(recovering.check()).rejects.toThrow('offline');
    broken = false;
    await expect(recovering.check()).resolves.toBeUndefined();
  });

  it('bounds active and queued work under a burst of 800 requests', async (): Promise<void> => {
    const budget = new WorkBudget(8, 32);
    const gate = Promise.withResolvers<undefined>();
    let active = 0;
    let maximum = 0;
    const results = Promise.allSettled(
      Array.from({ length: 800 }, () =>
        budget.run(async (): Promise<void> => {
          active += 1;
          maximum = Math.max(maximum, active);
          await gate.promise;
          active -= 1;
        }),
      ),
    );
    expect(active).toBe(8);
    gate.resolve(undefined);
    const settled = await results;
    expect(maximum).toBe(8);
    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(40);
    expect(settled.filter((result) => result.status === 'rejected')).toHaveLength(760);
    await expect(budget.run(() => Promise.resolve('recovered'))).resolves.toBe('recovered');
  });

  it('coalesces public downloads and backs off on provider failure', async (): Promise<void> => {
    const gate = Promise.withResolvers<undefined>();
    let calls = 0;
    const fetcher = createPublicFetch(async (): Promise<Response> => {
      calls += 1;
      await gate.promise;
      return new Response('unavailable', { status: 503 });
    });
    const results = Promise.all(
      Array.from({ length: 100 }, () => fetcher('https://assets.example/skin')),
    );
    expect(calls).toBe(1);
    gate.resolve(undefined);
    const responses = await results;
    expect(await responses[0]?.text()).toBe('unavailable');
    expect(await responses[99]?.text()).toBe('unavailable');
    await expect(fetcher('https://assets.example/another')).rejects.toThrow('cooling down');
    expect(calls).toBe(1);
  });

  it('never follows an OptiFine redirect to an internal HTTP target', async (): Promise<void> => {
    let internalHits = 0;
    const server = createServer((request, response): void => {
      if (request.url === '/redirect') {
        response.writeHead(302, { location: '/internal' });
      } else {
        internalHits += 1;
      }
      response.end();
    });
    await new Promise<void>((resolve): void => {
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('Expected listener');
      const result = await fetchOptifineCape('Player', (_input, init) =>
        fetch(`http://127.0.0.1:${address.port.toString()}/redirect`, init),
      );
      expect(result).toBeUndefined();
      expect(internalHits).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject): void => {
        server.close((error): void => {
          if (error === undefined) resolve();
          else reject(error);
        });
      });
    }
  });
});
