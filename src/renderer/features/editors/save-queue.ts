export class SaveQueue<T> {
  pending: T | undefined;
  private running: Promise<boolean> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private save: (value: T) => Promise<void>,
    private state: (s: 'dirty' | 'saving' | 'saved' | 'error') => void,
  ) {}
  put(value: T) {
    this.pending = value;
    this.state('dirty');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 300);
  }
  cancelPending() {
    clearTimeout(this.timer);
    this.pending = undefined;
  }
  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.running) {
      const success = await this.running;
      if (!success) return false;
      if (this.pending !== undefined) return this.flush();
      return true;
    }
    this.running = this.drain();
    try {
      return await this.running;
    } finally {
      this.running = undefined;
    }
  }
  private async drain() {
    while (this.pending !== undefined) {
      const value = this.pending;
      this.pending = undefined;
      this.state('saving');
      try {
        await this.save(value);
      } catch {
        if (this.pending === undefined) this.pending = value;
        this.state('error');
        return false;
      }
    }
    this.state('saved');
    return true;
  }
}
