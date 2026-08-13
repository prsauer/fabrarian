// Claude Code PostToolUse hook: rebuilds dist/ after edits to extension sources.
// Reads the hook payload from stdin, rebuilds only when a relevant file changed,
// and stays silent/exit-0 otherwise so unrelated edits aren't slowed down.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const stdin = await new Promise((resolve) => {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (data += c));
  process.stdin.on('end', () => resolve(data));
  process.stdin.on('error', () => resolve(''));
});

let filePath = '';
try {
  filePath = JSON.parse(stdin || '{}')?.tool_input?.file_path ?? '';
} catch {
  filePath = '';
}

const rel = filePath ? path.relative(root, filePath).replace(/\\/g, '/') : '';
const relevant =
  rel &&
  !rel.startsWith('..') &&
  (rel.startsWith('src/') ||
    rel.startsWith('public/') ||
    rel.startsWith('scripts/') ||
    rel === 'build.mjs' ||
    rel === 'tsconfig.json' ||
    rel === 'package.json');

if (!relevant) process.exit(0);

const result = spawnSync('npm', ['run', 'build'], {
  cwd: root,
  encoding: 'utf8',
  shell: true,
});

if (result.status !== 0) {
  // Surface the failure to Claude so it can fix the source.
  console.error(`[fabrarian] rebuild failed after editing ${rel}`);
  console.error(result.stdout || '');
  console.error(result.stderr || '');
  process.exit(2);
}

console.error(`[fabrarian] rebuilt dist/ after ${rel}`);
process.exit(0);
