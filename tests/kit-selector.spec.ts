import { test, expect, Page } from '@playwright/test';
import { waitForPage, assertNoHorizontalOverflow, requireHandle } from './helpers/store';
import { HANDLES } from './config';

/** Enabled (pickable) fragrance rows in the picker list. */
function pickableOptions(page: Page) {
  return page.locator('.kit-picker__list .kit-option:not([aria-disabled="true"]):not(.kit-option--empty)');
}

/**
 * The kit add-to-cart button. The section renders the kit product form twice
 * (visible + hidden fallback) with the same id, so target the first (visible)
 * one — it's the one the kit-selector JS enables and listens on.
 */
function kitAddToCart(page: Page) {
  return page.locator('#kit-add-to-cart-button').first();
}

/** Open the picker panel (closed by default) if it isn't open yet. */
async function openPicker(page: Page) {
  const toggle = page.locator('[data-kit-toggle]');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await expect(page.locator('[data-kit-panel]')).toBeVisible();
}

/** Check the first `count` pickable rows; skips the test if there aren't enough in stock. */
async function pickSamples(page: Page, count: number) {
  await openPicker(page);
  for (let i = 0; i < count; i++) {
    const unselected = page.locator(
      '.kit-picker__list .kit-option:not([aria-disabled="true"]):not(.kit-option--empty):not(.kit-option--selected)',
    );
    if (await unselected.count() === 0) {
      test.skip(true, `Fewer than ${count} in-stock samples available on the test product`);
      return;
    }
    await unselected.first().click();
  }
  await expect(page.locator('.kit-picker__list .kit-option--selected')).toHaveCount(count);
}

test.describe('Kit selector page (build-your-own kit)', () => {
  test.beforeEach(async ({ page }) => {
    requireHandle(HANDLES.kitSelector, 'kitSelector');
    await page.goto(`/products/${HANDLES.kitSelector}`);
    await waitForPage(page);
  });

  // ── Core rendering ──────────────────────────────────────────────────────────

  test('picker renders closed by default and opens with fragrance options', async ({ page }) => {
    await expect(page.locator('#kit-selector .kit-picker')).toBeVisible();
    await expect(page.locator('[data-kit-count]')).toContainText('0/5');
    await expect(page.locator('[data-kit-panel]')).toBeHidden();
    await openPicker(page);
    await expect(pickableOptions(page).first()).toBeVisible();
  });

  // ── Selection flow ──────────────────────────────────────────────────────────

  test('selecting 5 fragrances fills the counter and enables add to cart', async ({ page }) => {
    const addBtn = kitAddToCart(page);
    await expect(addBtn).toBeDisabled();

    await pickSamples(page, 5);

    await expect(page.locator('[data-kit-count]')).toContainText('5/5');
    await expect(page.locator('.kit-dot--filled')).toHaveCount(5);
    await expect(addBtn).toBeEnabled();
  });

  test('a 6th selection is blocked once 5 are chosen', async ({ page }) => {
    await pickSamples(page, 5);
    const unselected = page.locator(
      '.kit-picker__list .kit-option:not(.kit-option--empty):not(.kit-option--selected)',
    );
    if (await unselected.count() === 0) {
      test.skip(true, 'Test product has exactly 5 in-stock samples — nothing left to block');
      return;
    }
    await expect(unselected.first()).toHaveAttribute('aria-disabled', 'true');
  });

  test('unchecking a selected fragrance frees up the slot', async ({ page }) => {
    await pickSamples(page, 5);
    await page.locator('.kit-option--selected').first().click();
    await expect(page.locator('[data-kit-count]')).toContainText('4/5');
    await expect(kitAddToCart(page)).toBeDisabled();
  });

  // ── Search ──────────────────────────────────────────────────────────────────

  test('search narrows the list to matching fragrances', async ({ page }) => {
    await openPicker(page);
    const first = pickableOptions(page).first();
    await expect(first).toBeVisible();
    const title = (await first.locator('.kit-option__title').textContent()) ?? '';
    const query = title.trim().slice(0, 6);

    await page.locator('[data-kit-search]').fill(query);

    const titles = page.locator('.kit-picker__list .kit-option__title');
    await expect(titles.first()).toBeVisible();
    for (const text of await titles.allTextContents()) {
      expect(text.toLowerCase()).toContain(query.toLowerCase());
    }
  });

  test('search with no matches shows the empty state', async ({ page }) => {
    await openPicker(page);
    await page.locator('[data-kit-search]').fill('zzzznotafragrance');
    await expect(page.locator('.kit-option--empty')).toBeVisible();
  });

  // ── Cart contract: one kit line item + "דוגמית 1..5" properties ─────────────

  test('add to cart posts one kit line item with דוגמית 1..5 properties', async ({ page }) => {
    await pickSamples(page, 5);

    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/cart/add') && req.method() === 'POST'),
      kitAddToCart(page).click(),
    ]);

    const payload = request.postDataJSON() as {
      items: Array<{ id: number; quantity: number; properties: Record<string, string> }>;
    };
    expect(payload.items).toHaveLength(1);
    const props = payload.items[0].properties;
    for (let i = 1; i <= 5; i++) {
      expect(props[`דוגמית ${i}`], `דוגמית ${i} property missing or empty`).toBeTruthy();
      // the fulfillment contract has no size suffix — guard against one sneaking in
      expect(props[`דוגמית ${i}`]).not.toMatch(/ - \d+(?:[.,]\d+)?ml$/);
    }
    await page.waitForURL(/\/cart/);
  });

  // ── Mobile-specific ─────────────────────────────────────────────────────────

  test('[mobile] no horizontal overflow with the picker open', async ({ page, isMobile }) => {
    if (!isMobile) test.skip();
    await openPicker(page);
    await assertNoHorizontalOverflow(page);
  });

  test('[mobile] picker list scrolls vertically inside its panel', async ({ page, isMobile }) => {
    if (!isMobile) test.skip();
    await openPicker(page);
    const list = page.locator('.kit-picker__list');
    await expect(list).toBeVisible();
    const overflowY = await list.evaluate((el) => window.getComputedStyle(el).overflowY);
    expect(overflowY).toBe('auto');
  });
});
