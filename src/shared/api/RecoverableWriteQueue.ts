export class RecoverableWriteQueue {
  private tail: Promise<void> = Promise.resolve();
  private firstFailure: unknown;
  private hasFailure = false;

  enqueue(write: () => Promise<unknown>) {
    const attempt = this.tail.then(write);
    this.tail = attempt.then(
      () => undefined,
      (error) => {
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
}
