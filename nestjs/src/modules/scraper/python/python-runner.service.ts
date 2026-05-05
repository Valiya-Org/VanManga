import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import type { AppConfig } from '../../../config/configuration';
import { CloudflareService } from '../../cloudflare/cloudflare.service';
import {
  PythonResult,
  PythonRunOptions,
  PythonRunnerError,
} from './python-runner.types';

/** Spawns scrape_cli.py and parses its single-line JSON result.
 *
 *  Why spawn (not exec): scrape jobs can stream long stderr (debug
 *  prints from existing Python code). spawn avoids buffer overflow
 *  and lets us pipe Cloudflare state in via stdin.
 *
 *  Source-agnostic: the runner only knows how to invoke scrape_cli.py;
 *  every concrete IMangaSource implementation calls run() with a
 *  different `source` and `command`. */
@Injectable()
export class PythonRunnerService {
  private readonly logger = new Logger(PythonRunnerService.name);

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly cloudflare: CloudflareService,
  ) {}

  async run<T>(options: PythonRunOptions): Promise<T> {
    const executable = this.config.get('python.executable', { infer: true });
    const cliScript = this.config.get('python.cliScript', { infer: true });
    const cwd = this.config.get('python.workingDir', { infer: true });
    const timeoutMs =
      options.timeoutMs ??
      this.config.get('python.timeoutMs', { infer: true });

    const argv = [
      cliScript,
      '--source',
      options.source,
      options.command,
      ...options.args,
    ];

    this.logger.debug(
      `spawn ${executable} ${argv.join(' ')} (cwd=${cwd}, timeout=${timeoutMs}ms)`,
    );

    return new Promise<T>((resolve, reject) => {
      const child = spawn(executable, argv, {
        cwd,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        windowsHide: true,
      });

      let stdoutBuf = '';
      let stderrBuf = '';
      let timedOut = false;
      let settled = false;

      const settle = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString('utf8');
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString('utf8');
      });

      child.on('error', (err) => {
        settle(() =>
          reject(
            new PythonRunnerError(
              `Failed to spawn python: ${err.message}`,
              null,
              stderrBuf,
            ),
          ),
        );
      });

      child.on('close', (code) => {
        if (timedOut) {
          return settle(() =>
            reject(
              new PythonRunnerError(
                `Python CLI timed out after ${timeoutMs}ms`,
                null,
                stderrBuf,
              ),
            ),
          );
        }

        if (stderrBuf.trim().length > 0) {
          this.logger.verbose(
            `[${options.source}/${options.command}] stderr:\n${stderrBuf.trim()}`,
          );
        }

        const lastLine = stdoutBuf.trim().split(/\r?\n/).pop() ?? '';
        if (!lastLine) {
          return settle(() =>
            reject(
              new PythonRunnerError(
                `Python CLI produced no result line (exit=${code})`,
                null,
                stderrBuf,
              ),
            ),
          );
        }

        let parsed: PythonResult<T>;
        try {
          parsed = JSON.parse(lastLine) as PythonResult<T>;
        } catch (err) {
          return settle(() =>
            reject(
              new PythonRunnerError(
                `Could not parse Python CLI result: ${(err as Error).message}\nLine: ${lastLine}`,
                null,
                stderrBuf,
              ),
            ),
          );
        }

        if (!parsed.ok) {
          return settle(() =>
            reject(
              new PythonRunnerError(
                parsed.error ?? 'Python CLI reported failure',
                parsed.errorCode ?? null,
                stderrBuf,
              ),
            ),
          );
        }

        settle(() => resolve(parsed.data as T));
      });

      // Pipe current Cloudflare state via stdin so the CLI can
      // reproduce the legacy CF_dict shape inside Python.
      const cfState = this.cloudflare.getState();
      child.stdin.write(
        JSON.stringify({
          active: cfState.active,
          cfClearance: cfState.cfClearance,
          userAgent: cfState.userAgent,
        }),
      );
      child.stdin.end();
    });
  }
}
