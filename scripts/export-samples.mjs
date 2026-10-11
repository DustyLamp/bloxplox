import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../apps/prototype/app.js', import.meta.url), 'utf8');
const names = ['categories', 'days', 'backlog', 'habits', 'habitResults'];
const declarations = names.map(name => {
  const match = source.match(new RegExp(`const ${name}=([\\s\\S]*?);`));
  if (!match) throw new Error(`Sample declaration missing: ${name}`);
  return match[0];
}).join('\n');
// Execute only these checked-in literal fixture declarations, never external input.
const data = vm.runInNewContext(`${declarations}\nJSON.stringify({today:'2026-10-11',${names.join(',')},schedules:[]},null,2)`, {}, { timeout: 1000 });
await writeFile(new URL('../samples/initial-state.json', import.meta.url), data + '\n');
console.log('Exported the prototype sample state.');
