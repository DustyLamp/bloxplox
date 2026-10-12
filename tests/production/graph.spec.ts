import { expect, test, type Page } from '@playwright/test';

async function create(page: Page, name: string) {
  await page.getByLabel('New thing', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Add thing', exact: true }).click();
  await expect(page.getByRole('button', { name: `Edit ${name}`, exact: true })).toBeVisible();
}
test('prerequisite graph focuses a thing, flows left to right and works through touch-sized controls', async ({ page }) => {
  await page.goto('/things');
  for (const name of ['Submit form', 'Gather documents', 'Get photograph']) await create(page, name);
  await page.getByRole('button', { name: 'Edit Submit form', exact: true }).click();
  await page.getByRole('button', { name: 'View prerequisites', exact: true }).click();
  for (const name of ['Gather documents','Get photograph']) {
    await page.getByLabel('Prerequisite', { exact: true }).selectOption({ label: name });
    await page.getByRole('button', { name: 'Add prerequisite', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Direct prerequisites' }).getByText(name, { exact: true })).toBeVisible();
  }
  await expect(page.locator('.graph-detail')).toContainText('Waiting on 2');
  const positions = await page.locator('.react-flow__node').evaluateAll(nodes => nodes.map(n => ({ name: n.textContent, x: Number((n as HTMLElement).style.transform.match(/translate\(([-\d.]+)/)?.[1]) })));
  expect(positions.find(p => p.name?.startsWith('Submit form'))!.x).toBeGreaterThan(positions.find(p => p.name?.startsWith('Gather documents'))!.x);
  await page.getByRole('button', { name: 'Complete Gather documents', exact: true }).click();
  await expect(page.locator('.graph-detail')).toContainText('Waiting on 1');
  await page.getByLabel('Focus thing', { exact: true }).selectOption({ label: 'Gather documents' });
  await expect(page.getByLabel('Prerequisite', { exact: true }).locator('option').filter({ hasText: 'Submit form' })).toHaveCount(0);
  await page.getByLabel('New prerequisite', { exact: true }).fill('Find folder');
  await page.getByRole('button', { name: 'Create prerequisite', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Direct prerequisites' })).toContainText('Find folder');
  await page.getByLabel('Focus thing', { exact: true }).selectOption({ label: 'Submit form' });
  await expect(page.getByRole('list', { name: 'Further prerequisites' })).toContainText('Find folder');
  await page.getByRole('button', { name: 'Remove prerequisite Get photograph', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Direct prerequisites' })).not.toContainText('Get photograph');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'Graph for Submit form', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Direct prerequisites' })).toContainText('Gather documents');
  await expect(page.getByRole('list', { name: 'Further prerequisites' })).toContainText('Find folder');
});

test('graph links and completion follow changes from another tab and deleting a thing removes dangling links', async ({ page, context }) => {
  await page.goto('/things'); await create(page, 'Send invoice'); await create(page, 'Get address');
  await page.getByRole('button', { name: 'Graph for Send invoice', exact: true }).click();
  const second = await context.newPage(); await second.goto('/things');
  await second.getByRole('button', { name: 'Graph for Send invoice', exact: true }).click();
  await second.getByLabel('Prerequisite', { exact: true }).selectOption({ label: 'Get address' });
  await second.getByRole('button', { name: 'Add prerequisite', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Direct prerequisites' })).toContainText('Get address');
  await second.getByRole('button', { name: 'Complete Get address', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reopen Get address', exact: true })).toBeVisible();
  await second.getByRole('button', { name: 'Things', exact: true }).first().click();
  await second.getByRole('button', { name: 'Blocks', exact: true }).click();
  await second.getByRole('button', { name: 'Things', exact: true }).click();
  await second.getByRole('button', { name: 'Done 1', exact: true }).click();
  await second.getByRole('button', { name: 'Edit Get address', exact: true }).click();
  await second.getByRole('button', { name: 'Delete thing', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Direct prerequisites' })).toBeEmpty();
});
