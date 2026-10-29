import { expect, test } from '@playwright/test';
import { STORAGE_KEY } from '../src/session';

test('拖曳分頁後保留順序與選取，重新載入後還原', async ({ page }) => {
  const key = `${STORAGE_KEY}-demo`;
  await page.addInitScript((storageKey) => {
    if (localStorage.getItem(storageKey)) return;
    const paths = ['demo://a', 'demo://b', 'demo://c'];
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: 1,
        projects: paths.map((path, i) => ({ path, name: `專案 ${i + 1}`, pinned: false })),
        tabs: paths.map((path) => ({ path, selection: null, remotes: true, limit: 500 })),
        active: paths[0],
      }),
    );
  }, key);
  await page.goto('/?demo');
  const tabs = page.getByRole('tab');
  const first = (await tabs.nth(0).boundingBox())!;
  const last = (await tabs.nth(2).boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width - 5, last.y + last.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(tabs).toHaveText(['專案 2', '專案 3', '專案 1']);
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
  await expect
    .poll(() =>
      page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k)!).tabs.map((t: { path: string }) => t.path),
        key,
      ),
    )
    .toEqual(['demo://b', 'demo://c', 'demo://a']);
  await page.reload();
  await expect(tabs).toHaveText(['專案 2', '專案 3', '專案 1']);
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
});
