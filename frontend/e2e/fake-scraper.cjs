// Test-only stand-in for scrape_cli.py, used by the Playwright suite.
//
// The backend runs it through its existing configuration point:
//   PYTHON_EXECUTABLE=<node>  PYTHON_CLI_SCRIPT=<this file>
// argv: <script> --source <src> <command> -- ...args
// It answers with scrape_cli.py's single-line JSON result.
const [, , , , command, , ...args] = process.argv;

// A 1×1 PNG; browsers sniff it even when served as image/jpeg.
const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const CANDIDATES = [
  { manga_id: '-ui1', manga_name: '测试漫画一', artist_name: '测试作者', newest_epi: '第12话' },
  { manga_id: 'ui2', manga_name: '星之彼端', artist_name: '某某', newest_epi: '第88话 归途' },
  { manga_id: 'ui3', manga_name: '一个名字非常非常长的测试漫画用来检查截断效果', artist_name: '作者三', newest_epi: '番外篇' },
];

process.stdin.resume();
process.stdin.on('data', () => {});
process.stdin.on('end', () => {
  const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');
  switch (command) {
    case 'search':
      if (args[0] === 'nothing') {
        // scrape_cli.py reports "no results" as source status 457.
        emit({ ok: false, errorCode: 457, error: 'Source returned status 457' });
        break;
      }
      emit({ ok: true, data: CANDIDATES.map((c) => ({ ...c, thumbnail: PIXEL })) });
      break;
    case 'metadata':
      emit({ ok: true, data: { chapterCount: 0, serialization: 0 } });
      break;
    case 'chapters':
      // No chapters: a full download finishes at once without fetching images.
      emit({ ok: true, data: { chapters: [] } });
      break;
    default:
      emit({ ok: false, errorCode: null, error: `fake scraper: unsupported command ${command}` });
  }
});
