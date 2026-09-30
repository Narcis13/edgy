// Run the API and the web app together; stop both when either stops.
import { spawn } from 'node:child_process';

const run = (name, args) => {
  const child = spawn('npx', args, { stdio: 'inherit', env: process.env });
  child.on('exit', (code) => {
    console.log(`[${name}] stopped`);
    for (const c of children) if (c !== child) c.kill();
    process.exit(code ?? 0);
  });
  return child;
};

const children = [
  run('api', ['tsx', 'watch', '--disable-warning=ExperimentalWarning', 'src/server/index.ts']),
  run('web', ['vite', '--port', process.env.WEB_PORT ?? process.env.PORT ?? '5173', '--strictPort']),
];

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { for (const c of children) c.kill(); process.exit(0); });
