// The production server: the API, the built app and the docs in one process (run `npm run build` first).
// A script rather than `NODE_ENV=production tsx …` in package.json, which Windows' shell can't run.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
if (!existsSync(new URL('../dist/index.html', import.meta.url))) {
  console.error('edgy: no build in dist/ — run npm run build first');
  process.exit(1);
}

const tsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
const child = spawn(process.execPath, [tsx, '--disable-warning=ExperimentalWarning', 'src/server/index.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
// The server stops itself cleanly on these: pass them on and wait for it. On Windows Ctrl+C reaches it already,
// and kill() there would end it at once instead of letting it close the database.
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { if (process.platform !== 'win32') child.kill(sig); });
