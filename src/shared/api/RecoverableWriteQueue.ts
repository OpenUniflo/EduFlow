export class RecoverableWriteQueue {
  private tail: Promise<void> = Promise.resolve();
  private firstFailure: unknown;
  private hasFailure = false;
  private generation = 0;

  enqueue(write: () => Promise<unknown>) {
    const generation = this.generation;
    const attempt = this.tail.then(() => generation === this.generation ? write() : undefined);
    this.tail = attempt.then(
      () => undefined,
      (error) => {
        if (generation !== this.generation) return;
        if (!this.hasFailure) {
          this.firstFailure = error;
          this.hasFailure = true;
        }
      }
    );
  }

  async flush() {
    await this.tail;
    if (!this.hasFailure) return;

    const failure = this.firstFailure;
    this.firstFailure = undefined;
    this.hasFailure = false;
    throw failure;
  }

  cancel() {
    this.generation += 1;
    this.tail = Promise.resolve();
    this.firstFailure = undefined;
    this.hasFailure = false;
  }
}
