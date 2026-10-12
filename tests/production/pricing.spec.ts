import { expect, test } from '@playwright/test';
test('preview has no paywall or checkout', async ({page}) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading',{name:'Free access',exact:true})).toBeVisible();
  await expect(page.getByText('All features are free during the preview. No payment details needed.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Choose Plus',exact:true})).toHaveCount(0);
});
test('day templates copy reusable blocks without copying one-off tasks or completion', async ({page}) => {
  await page.goto('/blocks'); await page.getByRole('button',{name:'Add a block',exact:true}).click();
  await page.getByLabel('Name',{exact:true}).fill('Admin');
  await page.getByText('Add things',{exact:true}).click(); await page.getByLabel('Find or add a thing').fill('Pay bill'); await page.getByRole('button',{name:'Create “Pay bill”',exact:true}).click();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('button',{name:'Menu',exact:true}).click(); await page.getByRole('navigation',{name:'Main menu'}).getByRole('button',{name:'Templates',exact:true}).click();
  await page.getByLabel('Template name',{exact:true}).fill('Admin day'); await page.getByRole('button',{name:'Save day as template',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Admin day',exact:true})).toBeVisible();
  const source = await page.getByLabel('Copy day',{exact:true}).inputValue(); const next = new Date(`${source}T12:00:00Z`); next.setUTCDate(next.getUTCDate()+1);
  await page.getByLabel('Apply to day',{exact:true}).fill(next.toISOString().slice(0,10)); await page.getByRole('button',{name:'Apply Admin day',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Template applied'})).toBeVisible();
  await page.getByRole('button',{name:'Blocks',exact:true}).click(); await page.getByRole('button',{name:'Next day',exact:true}).click();
  await page.getByRole('button',{name:'08:00 Admin 30m',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'Complete Pay bill',exact:true})).toHaveCount(0);
});
