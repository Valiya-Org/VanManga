// Stand-in for scrape_cli.py, run with `node` as the "python" executable.
// argv: <script> --source <src> <command> -- ...args
// The command picks the behaviour under test.
const [, , , source, command, , ...args] = process.argv;

let stdin = '';
process.stdin.on('data', (d) => (stdin += d));
process.stdin.on('end', () => {
  const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');
  switch (command) {
    case 'echo':
      // noisy legacy prints go to stderr; earlier stdout lines are ignored
      process.stderr.write('debug: scraping...\n');
      process.stdout.write('stray line\n');
      emit({ ok: true, data: { source, args, stdin: JSON.parse(stdin) } });
      break;
    case 'fail':
      emit({ ok: false, errorCode: 457, error: 'Source returned status 457' });
      break;
    case 'silent':
      process.exit(1);
      break;
    case 'garbage':
      process.stdout.write('not json\n');
      break;
    case 'hang':
      setTimeout(() => {}, 60_000);
      break;
  }
});
