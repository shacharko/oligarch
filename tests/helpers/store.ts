import { Page, expect } from '@playwright/test';

/**
 * Wait for the page to fully settle (DOM + subresources).
 * Note: 'networkidle' can never be reached under `shopify theme dev` — its hot-reload
 * client keeps a long-lived EventSource request open — so we wait for 'load' instead
 * and rely on Playwright's auto-waiting assertions for anything dynamic.
 */
export async function waitForPage(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('load');
}

/**
 * Click the primary add-to-cart button and wait for the quick-cart drawer to open.
 * Returns after the drawer is visible.
 */
export async function addToCart(page: Page) {
  const addBtn = page.locator('.product-form__cart-submit').first();
  await expect(addBtn).toBeEnabled({ timeout: 5000 });
  await addBtn.click();
  await expect(page.locator('.quick-cart__container')).toBeVisible({ timeout: 8000 });
}

/**
 * Assert there is no horizontal scroll on the page (no content wider than viewport).
 * This is the key mobile overflow regression check. The store is RTL, so overflow
 * can leak to either side — scrollWidth catches both.
 */
export async function assertNoHorizontalOverflow(page: Page) {
  const overflows = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  expect(overflows, 'Page has unexpected horizontal overflow (content wider than viewport)').toBe(false);
}

/**
 * Scroll down by a given number of pixels and wait for layout to settle.
 */
export async function scrollDown(page: Page, pixels = 600) {
  await page.evaluate((px) => window.scrollBy(0, px), pixels);
  await page.waitForTimeout(400);
}

/**
 * Skip the test if a config handle is a placeholder.
 */
export function requireHandle(handle: string, label: string): void {
  if (handle.startsWith('FILL_IN_')) {
    throw new Error(
      `tests/config.ts: ${label} is not set. Replace the placeholder with a real handle.`,
    );
  }
}
