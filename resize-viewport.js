const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connect('http://localhost:9222');
  const contexts = browser.contexts();
  const page = contexts[0].pages()[0];
  await page.setViewportSize({ width: 1920, height: 1080 });
  console.log('Viewport set to 1920x1080');
  await browser.close();
})();
