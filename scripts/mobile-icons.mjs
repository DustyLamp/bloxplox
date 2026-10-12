import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
const logo = (await readFile('apps/web/public/logo.svg', 'utf8')).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
await mkdir('apps/mobile/assets', { recursive: true });
for (const [file, background, inset, scale] of [['icon.png', '#fafaf8', 128, 12], ['adaptive-icon.png', 'transparent', 240, 8.5]]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${background}"/><g transform="translate(${inset} ${inset}) scale(${scale})">${logo}</g></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`apps/mobile/assets/${file}`);
}
