// Phase 2 contract only. No remote execution adapter is installed in Phase 1.
export interface GenerationAdapter<Input, Output> {
  validate(input: Input): Promise<string[]>;
  estimate(
    input: Input,
  ): Promise<{ amount: string; currency: string; source: string; checkedAt: string } | null>;
  submit(input: Input, signal: AbortSignal): Promise<{ taskId: string }>;
  poll(taskId: string): Promise<{
    status: 'queued' | 'running' | 'failed' | 'completed';
    progress: number | null;
    error?: string;
  }>;
  cancel(taskId: string): Promise<void>;
  collect(taskId: string): Promise<Output>;
}
