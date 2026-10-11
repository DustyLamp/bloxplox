import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
const { server, url } = await startServer(0);
const available = ['completion', 'reveal', 'rearrange', 'touch', 'rearrange-regression', 'recurring', 'screens'];
const suites = process.argv.length > 2 ? process.argv.slice(2) : available;
try {
  if (suites.some(suite => !available.includes(suite))) throw new Error(`Choose suites from: ${available.join(', ')}`);
  for (const suite of suites) {
    console.log(`\nRunning ${suite}`);
    const code = await new Promise((accept, reject) => {
      const child = spawn(process.execPath, [`tests/${suite}.cjs`], { cwd: root, stdio: 'inherit', env: { ...process.env, BLOXPLOX_TEST_URL: url } });
      const timer = setTimeout(() => child.kill('SIGTERM'), 180_000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', (code, signal) => { clearTimeout(timer); accept(signal ? 1 : code); });
    });
    if (code !== 0) throw new Error(`${suite} failed`);
  }
  console.log('\nAll prototype interaction suites passed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await new Promise(resolve => server.close(resolve));
}
