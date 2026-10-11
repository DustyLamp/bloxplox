import { expect, test, type Page } from '@playwright/test';
async function open(page: Page) { await page.goto('/blocks'); await expect(page.getByRole('button', { name: 'Add a block', exact: true })).toBeVisible(); }
async function addBlock(page: Page, name = 'Read', start = '08:00') {
  await page.getByRole('button', { name: 'Add a block', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Start time').fill(start);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function menu(page: Page, name: string) { await page.getByRole('button', { name: 'Menu', exact: true }).click(); await page.getByRole('navigation', { name: 'Main menu' }).getByRole('button', { name, exact: true }).click(); }
test('blocks persist across reload and a second tab, completion is immediate', async ({ page, context }) => {
  await open(page); await addBlock(page);
  await page.getByRole('button', { name: '08:00 Read 30m', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Completed' })).toBeVisible();
  await expect(page.getByText('1 / 1 done', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('img', { name: 'Completed' })).toBeVisible();
  const second = await context.newPage(); await second.goto('/blocks'); await expect(second.getByRole('img', { name: 'Completed' })).toBeVisible();
});
test('linked habit shares completion and one layout setting', async ({ page }) => {
  await open(page); await addBlock(page, 'German', '09:00');
  await page.getByRole('button', { name: 'Tracker', exact: true }).click();
  await page.getByRole('button', { name: 'Add habit', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('German'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'German', exact: true }).click(); await page.getByRole('button', { name: 'Schedule habit', exact: true }).click();
  await page.getByLabel('Placement').selectOption({ label: 'Link to German · 09:00' }); await page.getByRole('button', { name: 'Link habit', exact: true }).click();
  await expect(page.getByText('0 / 1 done', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle result for German', exact: true }).click(); await expect(page.getByText('1 / 1 done', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'List', exact: true }).click(); await page.getByRole('button', { name: 'Blocks', exact: true }).click();
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('img', { name: 'Completed' })).toBeVisible();
});
test('recurring occurrence moves without creating a duplicate; backlog works', async ({ page }) => {
  await open(page); await addBlock(page);
  await page.getByRole('button', { name: '08:00 Read 30m', exact: true }).click(); await page.getByRole('button', { name: 'Repeat block', exact: true }).click();
  await page.getByLabel('Repeat', { exact: true }).selectOption('daily'); await page.getByRole('button', { name: 'Save schedule', exact: true }).click();
  await page.getByRole('button', { name: '08:00 Read 30m', exact: true }).click(); await page.getByRole('button', { name: 'Add to backlog', exact: true }).click();
  await expect(page.getByRole('button', { name: '08:00 Read 30m', exact: true })).toHaveCount(0);
  await page.reload(); await expect(page.getByRole('button', { name: '08:00 Read 30m', exact: true })).toHaveCount(0);
  await menu(page, 'Backlog'); await expect(page.getByRole('button', { name: 'Read 30m', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ Today', exact: true }).click(); await expect(page.getByText('No blocks in the backlog.')).toBeVisible();
});
test('offline writes persist and account-local databases are isolated', async ({ page, context }) => {
  await open(page); await addBlock(page, 'Private task');
  await context.setOffline(true);
  await page.getByRole('button', { name: '08:00 Private task 30m', exact: true }).click(); await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Completed' })).toBeVisible();
  await context.setOffline(false); await page.reload(); await expect(page.getByRole('img', { name: 'Completed' })).toBeVisible();
  await page.goto('/blocks?user=another-user'); await expect(page.getByRole('button', { name: 'Add a block', exact: true })).toBeVisible();
  await expect(page.getByText('Private task', { exact: true })).toHaveCount(0);
});

test('swipes complete, mark not done and clear without opening the editor', async ({ page, context, isMobile }) => {
  await open(page); await addBlock(page, 'Swipe');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  const face = page.getByRole('button', { name: '08:00 Swipe 30m', exact: true });
  const cdp = isMobile ? await context.newCDPSession(page) : undefined;
  async function swipe(direction: number) {
    await expect(face).toBeVisible();
    const b = await face.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }), x = b.x + b.width * (direction > 0 ? .2 : .8), y = b.y + b.height * .65;
    const distance = Math.min(180, b.width * .6) * direction;
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + distance * i / 8, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + distance, y, { steps: 8 }); await page.mouse.up();
    }
    await expect(page.locator('.bp2-swipe-settling')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await swipe(1); await expect(page.getByRole('img', { name: 'Completed', exact: true })).toBeVisible();
  await swipe(1); await expect(page.getByRole('img', { name: 'Completed', exact: true })).toHaveCount(0);
  await swipe(-1); await expect(page.getByRole('img', { name: 'Not done', exact: true })).toBeVisible();
  await swipe(-1); await expect(page.getByRole('img', { name: 'Not done', exact: true })).toHaveCount(0);
  await swipe(-1); await expect(page.getByRole('img', { name: 'Not done', exact: true })).toBeVisible();
  await swipe(1); await expect(page.getByText('1 / 1 done', { exact: true })).toBeVisible();
});

test('keyboard resize and rearrangement preserve a later gap', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop grips support keyboard input; touch is covered separately.');
  await open(page); await addBlock(page, 'First'); await addBlock(page, 'Second', '09:00'); await addBlock(page, 'Later', '14:00');
  await page.getByRole('button', { name: 'Resize First; arrow keys adjust fifteen minutes', exact: true }).press('ArrowRight');
  await expect(page.getByRole('button', { name: '08:00 First 45m', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Move Second', exact: true }).press('ArrowLeft');
  await expect(page.getByRole('button', { name: '08:00 Second 30m', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '08:30 First 45m', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '14:00 Later 30m', exact: true })).toBeVisible();
});

test('hold-to-move shows preview and drops into a snapped gap; Escape cancels', async ({ page, context, isMobile }) => {
  await open(page); await addBlock(page, 'Move');
  const face = page.getByRole('button', { name: '08:00 Move 30m', exact: true });
  await expect(face).toBeVisible();
  const b = (await face.boundingBox())!;
  const gap = (await page.getByRole('button', { name: isMobile ? 'Available 08:30 1h 30m' : 'Available 08:30 3h 30m', exact: true }).boundingBox())!;
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  const targetX = gap.x + gap.width * .5, targetY = gap.y + gap.height / 2;
  if (isMobile) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await expect(page.locator('.bp2-dragpreview')).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: targetX, y: targetY }] });
    await expect(page.locator('.bp2-drop-before')).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(x, y); await page.mouse.down();
    await expect(page.locator('.bp2-dragpreview')).toBeVisible();
    await page.keyboard.press('Escape'); await page.mouse.up();
    await expect(page.locator('.bp2-dragpreview')).toHaveCount(0);
    await expect(face).toBeVisible();
    await page.mouse.move(x, y); await page.mouse.down();
    await expect(page.locator('.bp2-dragpreview')).toBeVisible();
    await page.mouse.move(targetX, targetY, { steps: 8 });
    await expect(page.locator('.bp2-drop-before')).toBeVisible(); await page.mouse.up();
  }
  await expect(page.locator('.bp2-dragpreview')).toHaveCount(0);
  await expect(page.getByRole('button', { name: isMobile ? '09:15 Move 30m' : '10:15 Move 30m', exact: true })).toBeVisible();
});

test('history extends in both directions without changing the selected day', async ({ page }) => {
  await open(page);
  const history = page.getByRole('navigation', { name: 'Combined Blocks and Tracker history' });
  const selected = await history.locator('[aria-pressed=true]').getAttribute('data-date');
  const first = await history.locator('[data-date]').first().getAttribute('data-date');
  await history.evaluate(el => { el.scrollLeft = 0; });
  await expect.poll(() => history.locator('[data-date]').first().getAttribute('data-date')).not.toBe(first);
  const last = await history.locator('[data-date]').last().getAttribute('data-date');
  await history.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await expect.poll(() => history.locator('[data-date]').last().getAttribute('data-date')).not.toBe(last);
  await expect(history.locator('[aria-pressed=true]')).toHaveAttribute('data-date', selected!);
});
