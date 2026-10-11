const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const output = path.resolve(__dirname, '../test-results');
fs.mkdirSync(output, { recursive: true });
module.exports = {
  chromium,
  launchOptions: {
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  },
  url: process.env.BLOXPLOX_TEST_URL ?? 'http://127.0.0.1:4173',
  screenshotPath: name => path.join(output, name),
};
