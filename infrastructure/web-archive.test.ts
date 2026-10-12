import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createWebArchive } from '../scripts/web-archive.mjs';

it('packages a linked CodePipeline build artifact into the source checkout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bloxplox-archive-'));
  try {
    await mkdir(join(root, 'source'));
    await mkdir(join(root, 'artifact'));
    await writeFile(join(root, 'artifact', 'index.html'), '<main>BloxPlox</main>');
    await symlink(join(root, 'artifact'), join(root, 'source', 'dist'));
    const archive = await createWebArchive(join(root, 'source', 'dist'), join(root, 'source', 'web.zip'));
    expect((await readFile(archive)).length).toBeGreaterThan(0);
    expect(execFileSync('unzip', ['-p', archive, 'index.html'], { encoding: 'utf8' })).toBe('<main>BloxPlox</main>');
  } finally { await rm(root, { recursive: true, force: true }); }
});
