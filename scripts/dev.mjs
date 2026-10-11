// Run the API and the web app together; stop both when either stops.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Each package's own bin, run with this node: no npx, which Windows can't spawn without a shell.
const bin = (path) => fileURLToPath(new URL(`../node_modules/${path}`, import.meta.url));

const run = (name, args) => {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
  child.on('exit', (code) => {
    console.log(`[${name}] stopped`);
    for (const c of children) if (c !== child) c.kill();
    process.exit(code ?? 0);
  });
  return child;
};

const children = [
  run('api', [bin('tsx/dist/cli.mjs'), 'watch', '--disable-warning=ExperimentalWarning', 'src/server/index.ts']),
  run('web', [bin('vite/bin/vite.js'), '--port', process.env.WEB_PORT ?? process.env.PORT ?? '5173', '--strictPort']),
];

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { for (const c of children) c.kill(); process.exit(0); });
