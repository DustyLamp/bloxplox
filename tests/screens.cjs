const { chromium, launchOptions, url, screenshotPath } = require('./helpers.cjs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1056, height: 1600 }, colorScheme: 'light' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack));
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.fonts.check('700 16px Poppins')), true);
  assert.ok(await page.locator('svg.lucide').count() > 0);
  await page.evaluate(() => {
    const previousHistory = document.querySelector('.rt-history');
    document.querySelector('[data-tracker]').click();
    previousHistory.dispatchEvent(new Event('scroll'));
  });
  await page.locator('[data-tracker]').click();
  await page.locator('[data-layout="list"]').click();
  await page.locator('.bp2-switch [data-page="schedule"]').click();
  assert.equal(await page.locator('.bp2-list').count(), 1);
  await page.locator('[data-layout="grid"]').click();
  await page.locator('[data-tracker]').click();
  assert.equal(await page.locator('.rt-grid').count(), 1);
  await page.locator('[data-habitvalue="3"]').click();
  await page.locator('#rt-result').fill('25');
  await page.locator('[data-submitresult]').click();
  assert.match(await page.locator('[data-habitrow="3"]').getAttribute('class'), /rt-done/);
  await page.locator('#bp2-scenes').selectOption('4');
  await page.locator('#bp2-addname').fill('Sample overlap');
  await page.locator('#bp2-addtime').fill('10:00');
  await page.locator('[data-saveadd]').click();
  assert.equal(await page.locator('.bp2-dialog h2').innerText(), 'Overlap');
  await page.locator('[data-resolve="merge"]').click();
  assert.ok((await page.locator('.bp2-name').allTextContents()).some(name => name.includes('Sample overlap')));
  // Reload to keep scene captures on the shipped sample dataset.
  await page.reload();
  const sceneCount = await page.locator('#bp2-scenes option').count();
  for (const width of [1056, 768, 392, 352]) {
    await page.setViewportSize({ width, height: 1600 });
    for (let scene = 0; scene < sceneCount; scene++) {
      await page.locator('#bp2-scenes').selectOption(String(scene));
      const overflow = await page.evaluate(() => [...document.querySelectorAll('#bloxplox-v2 button, #bloxplox-v2 input, #bloxplox-v2 select, .bp2-block, .rt-row')].filter(element => {
        if (element.closest('.rt-history')) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -2 || rect.right > document.documentElement.clientWidth + 2);
      }).map(element => element.className));
      assert.deepEqual(overflow, [], `Overflow at ${width}px, scene ${scene}`);
      if ([1056, 392].includes(width)) await page.screenshot({ path: screenshotPath(`scene-${scene}-${width}.png`), fullPage: true });
    }
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.locator('#bp2-scenes').selectOption('0');
  await page.screenshot({ path: screenshotPath('blocks-dark-current.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`PASS global layout, numeric habit result, overlap merge, all ${sceneCount} scenes at four widths, local fonts/icons, dark mode.`);
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
