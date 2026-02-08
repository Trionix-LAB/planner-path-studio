import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  console.log('Navigating to http://localhost:8080/...');
  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
  
  await page.waitForTimeout(2000);
  
  console.log('Clicking on Draft (Черновик) to open map workspace...');
  await page.click('text=Черновик');
  await page.waitForTimeout(3000);
  
  console.log('Enabling grid layer (Сетка)...');
  
  // Try clicking directly on the checkbox using JavaScript
  await page.evaluate(() => {
    // Find all checkboxes in the layer panel
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    for (const checkbox of checkboxes) {
      const label = checkbox.closest('label') || checkbox.parentElement;
      if (label && label.textContent.includes('Сетка')) {
        checkbox.click();
        return;
      }
    }
  });
  
  // Wait for grid to render
  await page.waitForTimeout(2000);
  
  console.log('Taking screenshot with grid enabled...');
  await page.screenshot({ 
    path: 'planner-path-studio-with-grid.png',
    fullPage: true 
  });
  
  console.log('Screenshot saved to planner-path-studio-with-grid.png');
  
  await browser.close();
})();
