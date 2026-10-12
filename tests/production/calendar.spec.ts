import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('calendar clashes stack in Grid, split in List, hide across reloads and merge locally', async ({ page }) => {
  await page.goto('/logo.svg');
  await page.evaluate(async root => {
    const dbModule = `${root}/packages/sync/src/database.ts`, domainModule = `${root}/packages/domain/src/index.ts`, actionModule = `${root}/packages/domain/src/actions.ts`;
    const { openDatabase, writeRecord } = await import(dbModule), { defaultSettings, localDate } = await import(domainModule), { blankBlock } = await import(actionModule);
    const db = await openDatabase('local:local-user'), date = localDate('UTC');
    await writeRecord(db, 'settings', 'settings', { ...defaultSettings(), timezone: 'UTC' });
    const {id, ...data} = { ...blankBlock(date, 540), name: 'Admin', timing: { date, start: 540, duration: 60 } };
    await writeRecord(db, id, 'block', data);
    await writeRecord(db, 'calendar-work', 'calendarSource', { name: 'Work calendar', color:'#70b4ff', accountId:'google-account', accountEmail:'demo@example.com', timezone:'UTC', enabled:true });
    await writeRecord(db, 'calendar-call', 'calendarEvent', { sourceId:'calendar-work', externalId:'call', name:'Team call', start:`${date}T09:15:00Z`, end:`${date}T09:45:00Z`, allDay:false, busy:true, notes:'Agenda', location:'Office', htmlUrl:'', seriesId:null });
    await db.close();
  }, `/@fs${resolve('.')}`);
  await page.goto('/blocks');
  const window = page.locator('.calendar-window[data-window-start="555"]');
  await expect(window.locator('[data-calendar-event="calendar-call"]')).toBeVisible();
  const stacked = await window.locator(':scope > .bp2-block').evaluateAll(cards => cards.map(c => { const r = c.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; }));
  expect(stacked).toHaveLength(2); expect(Math.abs(stacked[0].x-stacked[1].x)).toBeLessThan(2); expect(Math.abs(stacked[0].y-stacked[1].y)).toBeGreaterThan(60);
  await page.getByRole('button',{name:'List',exact:true}).click();
  const split = await window.locator(':scope > .bp2-block').evaluateAll(cards => cards.map(c => { const r = c.getBoundingClientRect(); return {x:r.x,y:r.y}; }));
  expect(Math.abs(split[0].y-split[1].y)).toBeLessThan(2); expect(Math.abs(split[0].x-split[1].x)).toBeGreaterThan(80);
  await page.getByRole('button',{name:'Team call · 09:15 · Work calendar',exact:true}).click(); await page.getByRole('button',{name:'Hide this event',exact:true}).click();
  await expect(page.locator('[data-calendar-event]')).toHaveCount(0); await page.reload(); await expect(page.locator('[data-calendar-event]')).toHaveCount(0);
  await page.getByRole('button',{name:'Menu',exact:true}).click(); await page.getByRole('navigation',{name:'Main menu'}).getByRole('button',{name:'Calendars',exact:true}).click();
  await expect(page.getByText('Hidden events', {exact:true})).toBeVisible(); await page.getByRole('button',{name:'Show again',exact:true}).click();
  await page.getByRole('button',{name:'Blocks',exact:true}).click(); await page.getByRole('button',{name:'Team call · 09:15 · Work calendar',exact:true}).click();
  await page.getByLabel('Merge into block',{exact:true}).selectOption({label:'Admin · 09:00'}); await page.getByRole('button',{name:'Merge',exact:true}).click();
  await expect(page.locator('[data-calendar-event]')).toHaveCount(0); await page.getByRole('button',{name:'09:00 Admin + Team call 1h',exact:true}).click();
  await page.getByRole('button',{name:'Show merged calendar events separately',exact:true}).click(); await expect(page.locator('[data-calendar-event]')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Things assigned to one block can be scheduled separately without losing completion', async ({page}) => {
  await page.goto('/blocks'); await page.getByRole('button',{name:'Add a block',exact:true}).click(); await page.getByLabel('Name',{exact:true}).fill('Admin session');
  await page.getByText('Add things',{exact:true}).click();
  for (const name of ['Pay bill', 'Renew permit']) { await page.getByLabel('Find or add a thing').fill(name); await page.getByRole('button',{name:`Create “${name}”`,exact:true}).click(); }
  await page.getByRole('button',{name:'Save',exact:true}).click(); await page.getByRole('button',{name:'08:00 Admin session 30m',exact:true}).click();
  await page.getByRole('checkbox',{name:'Complete Pay bill',exact:true}).check();
  await page.getByRole('button',{name:'Schedule things separately',exact:true}).click();
  await page.getByRole('checkbox',{name:'Pay bill',exact:true}).check(); await page.getByRole('checkbox',{name:'Renew permit',exact:true}).check();
  await page.getByRole('button',{name:'Schedule separately',exact:true}).click();
  await expect(page.getByRole('button',{name:'08:30 Pay bill 15m',exact:true})).toBeVisible(); await expect(page.getByRole('button',{name:'08:45 Renew permit 15m',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'08:30 Pay bill 15m',exact:true}).click(); await expect(page.getByRole('checkbox',{name:'Complete Pay bill',exact:true})).toBeChecked();
});
