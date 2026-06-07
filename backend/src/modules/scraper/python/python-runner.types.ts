/** Shape of every JSON line emitted by scrape_cli.py on stdout. */
export interface PythonResult<T = unknown> {
  ok: boolean;
  data?: T;
  errorCode?: number | null;
  error?: string;
}

export interface PythonRunOptions {
  /** Source key registered in scrape_cli.py SOURCE_REGISTRY. */
  source: string;
  /** Subcommand: search / metadata / chapters / chapter-images / ... */
  command: string;
  /** Positional args for the subcommand. */
  args: string[];
  /** Override the per-invocation timeout (ms). */
  timeoutMs?: number;
}

export class PythonRunnerError extends Error {
  constructor(
    message: string,
    public readonly errorCode: number | null = null,
    public readonly stderr: string = '',
  ) {
    super(message);
    this.name = 'PythonRunnerError';
  }
}
