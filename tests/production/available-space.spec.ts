import { expect, test, type Locator, type Page } from '@playwright/test';

async function activateAt(space: Locator, layout: 'Grid' | 'List', fraction: number, touch: boolean) {
  await space.scrollIntoViewIfNeeded();
  const bounds = (await space.boundingBox())!;
  const position = { x: bounds.width * (layout === 'Grid' ? fraction : .75), y: bounds.height * (layout === 'List' ? fraction : .5) };
  if (touch) await space.tap({ position }); else await space.click({ position });
}
async function addAnchor(page: Page, name: string, time: string) {
  await page.getByRole('button', { name: 'Add a block', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Start time', { exact: true }).fill(time);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

for (const layout of ['Grid', 'List'] as const) test(`${layout}: an available-space click chooses its time and saves an hour without moving another block`, async ({ page, isMobile }) => {
  await page.goto('/blocks');
  await page.getByRole('button', { name: layout, exact: true }).click();
  await addAnchor(page, 'Later', '10:00');
  await activateAt(page.getByRole('button', { name: 'Available 08:00 2h', exact: true }), layout, .25, isMobile);
  await expect(page.getByLabel('Start time', { exact: true })).toHaveValue('08:30');
  await expect(page.getByLabel('Duration (minutes)', { exact: true })).toHaveValue('60');
  await page.getByLabel('Name', { exact: true }).fill('From empty space');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: '08:30 From empty space 1h', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '10:00 Later 30m', exact: true })).toBeVisible();

  // A click at the trailing edge stays in the gap. A short gap still defaults
  // to an hour, and saving requires the existing overlap choice.
  await activateAt(page.getByRole('button', { name: 'Available 09:30 30m', exact: true }), layout, .96, isMobile);
  await expect(page.getByLabel('Start time', { exact: true })).toHaveValue('09:45');
  await expect(page.getByLabel('Duration (minutes)', { exact: true })).toHaveValue('60');
  await page.getByLabel('Name', { exact: true }).fill('Needs room');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Overlap' })).toContainText('Later');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: '10:00 Later 30m', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Needs room/ })).toHaveCount(0);
});

test('available space supports keyboard activation and fits a late block before midnight', async ({ page, isMobile }) => {
  await page.goto('/blocks');
  const first = page.getByRole('button', { name: /^Available 08:00/ });
  await first.focus(); await first.press('Enter');
  await expect(page.getByLabel('Start time', { exact: true })).toHaveValue('08:00');
  await expect(page.getByLabel('Duration (minutes)', { exact: true })).toHaveValue('60');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await addAnchor(page, 'Evening', '22:00');
  await activateAt(page.getByRole('button', { name: 'Available 22:30 1h 30m', exact: true }), 'Grid', .99, isMobile);
  await expect(page.getByLabel('Start time', { exact: true })).toHaveValue('23:45');
  await expect(page.getByLabel('Duration (minutes)', { exact: true })).toHaveValue('15');
  await page.getByLabel('Name', { exact: true }).fill('End of day');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: '23:45 End of day 15m', exact: true })).toBeVisible();
});
