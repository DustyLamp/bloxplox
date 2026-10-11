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
