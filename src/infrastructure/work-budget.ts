export class WorkBudgetExceededError extends Error {
  public override readonly name = 'WorkBudgetExceededError';
}

/** A bounded FIFO. A slot is released only after the underlying work settles. */
export class WorkBudget {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  public constructor(
    private readonly concurrency: number,
    private readonly waiting: number,
  ) {
    if (
      !Number.isSafeInteger(concurrency) ||
      concurrency < 1 ||
      !Number.isSafeInteger(waiting) ||
      waiting < 0
    ) {
      throw new RangeError('Invalid work budget');
    }
  }

  public async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      if (this.queue.length >= this.waiting)
        throw new WorkBudgetExceededError('Work budget exhausted');
      await new Promise<void>((resolve): void => {
        this.queue.push(resolve);
      });
    } else {
      this.active += 1;
    }
    try {
      return await work();
    } finally {
      const next = this.queue.shift();
      if (next === undefined) this.active -= 1;
      else next();
    }
  }
}
