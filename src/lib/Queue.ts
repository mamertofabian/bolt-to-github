export class Queue {
  private queue: (() => Promise<void>)[] = [];
  private processing = false;
  private concurrency: number;

  constructor(concurrency = 1) {
    this.concurrency = concurrency;
  }

  async add(task: () => Promise<void>): Promise<void> {
    this.queue.push(task);
    if (!this.processing) {
      this.processing = true;
      await this.process();
    }
  }

  private async process(): Promise<void> {
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        await task();
      }
    }
    this.processing = false;
  }
}
