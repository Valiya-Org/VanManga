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

    // --- dgmanga-shaped commands for the e2e suite (test/*.e2e-spec.ts)
    case 'search':
      if (args[0] === 'nothing') {
        // scrape_cli.py reports "no results" as source status 457
        emit({ ok: false, errorCode: 457, error: 'Source returned status 457' });
        break;
      }
      emit({
        ok: true,
        data: [
          { manga_id: '-e2e1', manga_name: 'E2E Manga', artist_name: 'Tester', newest_epi: '第1话', thumbnail: Buffer.from('jpeg-1').toString('base64') },
          { manga_id: '-e2e2', manga_name: 'E2E Manga!', artist_name: 'Tester', newest_epi: '第2话', thumbnail: Buffer.from('jpeg-2').toString('base64') },
        ],
      });
      break;
    case 'metadata':
      emit({ ok: true, data: { chapterCount: 1, serialization: 1 } });
      break;
    case 'chapters':
      // No chapters: a full download completes without fetching images.
      emit({ ok: true, data: { chapters: [] } });
      break;
  }
});
