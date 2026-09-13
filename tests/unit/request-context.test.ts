import { describe, expect, it } from 'vitest';
import { getCurrentRequestId, runWithRequestId } from '@/lib/server/request-context';

describe('request-context (TASK-1.3.4)', () => {
  it('is undefined outside of runWithRequestId', () => {
    expect(getCurrentRequestId()).toBeUndefined();
  });

  it('returns the same id everywhere inside the callback, including nested async calls', async () => {
    async function deeplyNested() {
      async function evenDeeper() {
        return getCurrentRequestId();
      }
      return evenDeeper();
    }

    const seen = await runWithRequestId(() => deeplyNested(), 'fixed-id-123');
    expect(seen).toBe('fixed-id-123');
  });

  it('generates a fresh id when none is passed', async () => {
    const idA = await runWithRequestId(() => Promise.resolve(getCurrentRequestId()));
    const idB = await runWithRequestId(() => Promise.resolve(getCurrentRequestId()));

    expect(idA).toBeDefined();
    expect(idB).toBeDefined();
    expect(idA).not.toBe(idB);
  });

  it('does not leak between two concurrent, interleaved runs', async () => {
    async function delayedRead(id: string) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return getCurrentRequestId() === id;
    }

    const [resultA, resultB] = await Promise.all([
      runWithRequestId(() => delayedRead('run-a'), 'run-a'),
      runWithRequestId(() => delayedRead('run-b'), 'run-b'),
    ]);

    expect(resultA).toBe(true);
    expect(resultB).toBe(true);
  });
});
