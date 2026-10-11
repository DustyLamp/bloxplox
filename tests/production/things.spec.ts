import { expect, test, type Page } from '@playwright/test';

async function addThing(page: Page, name: string) {
  await page.getByLabel('New thing', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Add thing', exact: true }).click();
  await expect(page.getByRole('button', { name: `Edit ${name}`, exact: true })).toBeVisible();
}
async function open(page: Page) {
  await page.goto('/things'); await expect(page.getByLabel('New thing', { exact: true })).toBeVisible();
}

test('Things schedule together, preserve separate completion and share the global layout', async ({ page }) => {
  await open(page); await addThing(page, 'Renew passport'); await addThing(page, 'Book dentist');
  await page.getByRole('button', { name: 'Edit Renew passport', exact: true }).click();
  await page.getByLabel('Estimate (minutes)').fill('30'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Plan a block', exact: true }).click();
  await page.getByLabel('Select Renew passport', { exact: true }).check(); await page.getByLabel('Select Book dentist', { exact: true }).check();
  await page.getByRole('button', { name: 'Schedule 2 things', exact: true }).click();
  await page.getByRole('button', { name: 'Choose time and duration', exact: true }).click();
  await expect(page.getByLabel('Duration (minutes)')).toHaveValue('45');
  await page.getByLabel('Name', { exact: true }).fill('Admin'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click(); await page.getByRole('button', { name: 'Blocks', exact: true }).click();
  await expect(page.locator('.bp2-list')).toBeVisible();
  await page.getByRole('button', { name: '08:00 Admin 45m', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Things', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open 2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Blocks', exact: true }).click();
  await page.getByRole('button', { name: '08:00 Admin 45m', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Complete Renew passport', exact: true }).check();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Things', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Done 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Renew passport', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reopen Renew passport', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open 2', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('button', { name: 'Open 2', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.things-grid')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('existing sessions share Things across tabs and deleting a block retains its tasks', async ({ page, context }) => {
  await page.goto('/blocks'); await page.getByRole('button', { name: 'Add a block', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Admin'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Things', exact: true }).click(); await addThing(page, 'Pay invoice');
  await page.getByRole('button', { name: 'Edit Pay invoice', exact: true }).click(); await page.getByRole('button', { name: 'Schedule thing', exact: true }).click();
  await page.getByLabel('Block', { exact: true }).selectOption({ label: 'Admin · 08:00' }); await page.getByRole('button', { name: 'Add to block', exact: true }).click();
  const second = await context.newPage(); await second.goto('/blocks');
  await second.getByRole('button', { name: '08:00 Admin 30m', exact: true }).click();
  await second.getByRole('checkbox', { name: 'Complete Pay invoice', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Done 1', exact: true })).toBeVisible();
  await second.getByRole('button', { name: 'Delete this block', exact: true }).click();
  await page.getByRole('button', { name: 'Done 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Pay invoice', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Admin ·/ })).toHaveCount(0);
});

test('repeating a Things session retains its original checklist without repeating one-off tasks', async ({ page }) => {
  await page.goto('/blocks'); await page.getByRole('button', { name: 'Add a block', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Admin'); await page.getByText('Add things', { exact: true }).click();
  await page.getByLabel('Find or add a thing').fill('Send form'); await page.getByRole('button', { name: 'Create “Send form”', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Complete Send form', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: '08:00 Admin 30m', exact: true }).click(); await page.getByRole('button', { name: 'Repeat block', exact: true }).click();
  await page.getByLabel('Repeat', { exact: true }).selectOption('daily'); await page.getByRole('button', { name: 'Save schedule', exact: true }).click();
  await page.getByRole('button', { name: '08:00 Admin 30m', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Complete Send form', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Next day', exact: true }).click();
  await page.getByRole('button', { name: '08:00 Admin 30m', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Complete Send form', exact: true })).toHaveCount(0);
});
