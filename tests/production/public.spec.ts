import { test, expect } from '@playwright/test';

test('privacy and product information remain available without authentication services', async ({ page }) => {
  let configRequests = 0;
  await page.route('**/config.json', async route => { configRequests++; await route.abort(); });
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'iamjeza@gmail.com', exact: true }).first()).toHaveAttribute('href', 'mailto:iamjeza@gmail.com');
  await expect(page.getByRole('link', { name: 'Google API Services User Data Policy', exact: true })).toHaveAttribute('href', 'https://developers.google.com/terms/api-services-user-data-policy');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'About BloxPlox', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A day with room for things.', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open BloxPlox', exact: true })).toHaveAttribute('href', '/blocks');
  expect(configRequests).toBe(0);
});
