import { expect, test } from '@playwright/test';
test('returns an existing session to Blocks after an expired social callback', async ({ page }) => {
  await page.goto('/auth/callback?error=access_denied');
  await expect(page).toHaveURL(/\/blocks$/);
  await expect(page.getByRole('button', {name:'Add a block',exact:true})).toBeVisible();
});
