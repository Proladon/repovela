import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { CommitDetail, Snapshot } from '../src/types';

const data = JSON.parse(
  readFileSync(new URL('../src/demo-data.json', import.meta.url), 'utf8'),
) as {
  snapshot: Snapshot;
  details: Record<string, CommitDetail>;
};

const head = data.snapshot.headOid!;
const headMessage = data.details[head].commit.message;

for (const viewport of [
  { width: 1360, height: 880 },
  { width: 1000, height: 640 },
]) {
  test(`${viewport.width}x${viewport.height} 畫面與完整瀏覽流程`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const capture = async (state: string) => {
      await expect(page).toHaveScreenshot(`${viewport.width}-${state}.png`);
    };
    await page.goto('/?demo');
    await capture('welcome');
    await page.getByRole('button', { name: '貼上專案路徑' }).click();
    await capture('add-project');
    await page.getByRole('textbox', { name: '專案路徑' }).fill('demo://keifu');
    await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
    await expect(page.getByRole('heading', { name: headMessage, exact: true })).toBeVisible();
    const author = page.locator(`#commit-${head} .commit-author`);
    await expect(page.getByText('作者', { exact: true })).toBeVisible();
    await expect(author).toHaveText(data.details[head].commit.author);
    await expect(author).toHaveAttribute(
      'title',
      `${data.details[head].commit.author} <${data.details[head].commit.email}>`,
    );
    await author.scrollIntoViewIfNeeded();
    await expect(author).toBeInViewport({ ratio: 1 });
    await page.locator('.history-scroll').evaluate((element) => {
      element.scrollLeft = 0;
    });
    await page.locator('.add-project').click();
    await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
    await page.getByRole('tab', { name: 'keifu', exact: true }).click();
    await expect(page.getByRole('heading', { name: headMessage, exact: true })).toBeVisible();
    await capture('history');

    await page.locator('.branch-picker > button').click();
    await capture('branches');
    await page.keyboard.press('Escape');
    await page.getByRole('textbox', { name: '搜尋 commit' }).fill('smooth');
    await capture('search');
    await page.getByRole('textbox', { name: '搜尋 commit' }).press('Enter');
    await expect(page.locator('.commit-row.selected')).toHaveClass(/search-match/);
    await page.getByRole('button', { name: '清除搜尋' }).click();
    await page.locator(`#commit-${head}`).click();
    await expect(page.getByRole('heading', { name: headMessage, exact: true })).toBeVisible();
    await page.locator('.detail-panel .file-row').first().click();
    await expect(page.locator('.diff-code')).toBeVisible();
    await capture('diff');
    await page.getByRole('button', { name: '返回檔案清單' }).click();
    await page.locator('#commit-worktree').click();
    await expect(page.getByRole('heading', { name: '尚未提交的變更' })).toBeVisible();
    await capture('worktree');
    await page.locator(`#commit-${head}`).click();
    await expect(page.getByRole('heading', { name: headMessage, exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'keifu 專案選單', exact: true }).click();
    await capture('project-menu');
    await page.getByRole('button', { name: '釘選專案', exact: true }).click();
    await page.getByRole('button', { name: 'keifu 專案選單', exact: true }).click();
    await page.getByRole('button', { name: '重新命名', exact: true }).click();
    await capture('rename');
    await page.getByRole('textbox', { name: '專案名稱', exact: true }).fill('Keifu 範例');
    await page.getByRole('button', { name: '儲存名稱', exact: true }).click();
    await page.getByRole('button', { name: '快捷鍵與關於', exact: true }).click();
    await capture('help');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Tab');
    await expect(page.getByRole('tab', { name: '另一個專案' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('Control+Shift+Tab');
    await expect(page.getByRole('tab', { name: 'Keifu 範例' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Keifu 範例' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('heading', { name: headMessage, exact: true })).toBeVisible();
  });
}
