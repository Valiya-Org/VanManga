import { join } from 'path';
import { PythonRunnerService } from './python-runner.service';
import { PythonRunnerError } from './python-runner.types';

const FAKE_CLI = join(__dirname, '__fixtures__', 'fake-cli.cjs');

function runner(executable = process.execPath, timeoutMs = 10_000) {
  const cfg: Record<string, unknown> = {
    'python.executable': executable,
    'python.cliScript': FAKE_CLI,
    'python.workingDir': __dirname,
    'python.timeoutMs': timeoutMs,
  };
  const cloudflare = {
    getState: () => ({ active: true, cfClearance: 'CLR', userAgent: 'UA/1' }),
  };
  return new PythonRunnerService(
    { get: (k: string) => cfg[k] } as never,
    cloudflare as never,
  );
}

const run = (cmd: string, args: string[] = [], r = runner()) =>
  r.run<Record<string, unknown>>({ source: 'dgmanga', command: cmd, args });

describe('PythonRunnerService', () => {
  it('resolves the last stdout JSON line and passes args after "--"', async () => {
    // ids starting with "-" must arrive as positionals, not flags
    const data = await run('echo', ['-LoL2tSY', 'two words']);
    expect(data.source).toBe('dgmanga');
    expect(data.args).toEqual(['-LoL2tSY', 'two words']);
  });

  it('pipes the current Cloudflare state through stdin', async () => {
    const data = await run('echo');
    expect(data.stdin).toEqual({ active: true, cfClearance: 'CLR', userAgent: 'UA/1' });
  });

  it('rejects with the CLI errorCode when it reports ok:false', async () => {
    const err = await run('fail').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PythonRunnerError);
    expect((err as PythonRunnerError).errorCode).toBe(457);
  });

  it('rejects when the CLI exits without a result line', async () => {
    await expect(run('silent')).rejects.toThrow(/no result line \(exit=1\)/);
  });

  it('rejects when the result line is not JSON', async () => {
    await expect(run('garbage')).rejects.toThrow(/Could not parse/);
  });

  it('kills the process and rejects on timeout', async () => {
    await expect(run('hang', [], runner(process.execPath, 300))).rejects.toThrow(
      /timed out after 300ms/,
    );
  });

  it('rejects when the interpreter cannot be spawned', async () => {
    await expect(
      run('echo', [], runner(join(__dirname, 'no-such-python'))),
    ).rejects.toThrow(/Failed to spawn python/);
  });
});
