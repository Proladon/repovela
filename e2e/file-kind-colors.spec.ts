import { expect, test } from '@playwright/test';

test('commit 檔案變更類型的顏色各不相同', async ({ page }) => {
  await page.goto('/?demo');
  await page.getByRole('button', { name: '貼上專案路徑' }).click();
  await page.getByRole('textbox', { name: '專案路徑' }).fill('demo://keifu');
  await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
  await page.locator('.detail-panel .file-row').first().waitFor();

  const kinds = ['added', 'modified', 'deleted', 'renamed', 'copied', 'typechange', 'conflicted'];
  const colors = await page
    .locator('.detail-panel .file-row')
    .first()
    .evaluate((row, list) => {
      return list.map((kind) => {
        const el = document.createElement('span');
        el.className = `file-kind kind-${kind}`;
        row.appendChild(el);
        const color = getComputedStyle(el).color;
        el.remove();
        return color;
      });
    }, kinds);

  expect(new Set(colors).size).toBe(kinds.length);
  expect(colors[0]).toBe('rgb(136, 199, 160)');
  expect(colors[1]).toBe('rgb(224, 182, 111)');
  expect(colors[2]).toBe('rgb(217, 133, 145)');
  expect(colors[3]).toBe('rgb(127, 180, 232)');
});
