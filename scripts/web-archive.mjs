import { rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export async function createWebArchive(directory = 'dist', destination = 'bloxplox-web.zip') {
  // CodePipeline additional inputs are symlinks. A relative ../ destination
  // would resolve beside the input artifact, rather than the source checkout.
  const archive = resolve(destination);
  await rm(archive, { force: true });
  execFileSync('zip', ['-qr', archive, '.'], { cwd: directory });
  return archive;
}
