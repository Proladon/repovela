import { describe, expect, it } from 'vitest';
import { defaultPreferences, fontStack, restorePreferences, toastPositions } from './preferences';

describe('偏好設定保存與還原', () => {
  it('toast 六種位置與倒數秒數可還原，舊資料和非法值使用預設', () => {
    for (const position of Object.keys(toastPositions))
      expect(
        restorePreferences(
          JSON.stringify({ version: 1, toastPosition: position, toastDuration: 8 }),
        ),
      ).toMatchObject({ toastPosition: position, toastDuration: 8 });
    for (const saved of [
      {},
      { toastPosition: 'unknown', toastDuration: -1 },
      { toastPosition: 'toString', toastDuration: '5' },
    ])
      expect(restorePreferences(JSON.stringify({ version: 1, ...saved }))).toMatchObject({
        toastPosition: 'bottom-right',
        toastDuration: 5,
      });
  });
  it('Changes 清單獨立保存寬度，缺少或無效設定沿用自動寬度', () => {
    for (const [saved, expected] of [
      [320, 320],
      [5000, 1000],
      [100, 170],
      [240.7, 241],
    ]) {
      const restored = restorePreferences(
        JSON.stringify({ version: 1, changesListWidth: saved, requestListWidth: 400 }),
      );
      expect(restored.changesListWidth).toBe(expected);
      expect(restored.requestListWidth).toBe(400);
    }
    for (const data of [{}, { changesListWidth: null }, { changesListWidth: '320' }])
      expect(
        restorePreferences(JSON.stringify({ version: 1, ...data })).changesListWidth,
      ).toBeNull();
  });
  it('PR／MR 清單寬度可保存，舊設定與重設保留自動寬度', () => {
    expect(restorePreferences('{"version":1,"requestListWidth":320}').requestListWidth).toBe(320);
    expect(restorePreferences('{"version":1,"requestListWidth":5000}').requestListWidth).toBe(1000);
    expect(restorePreferences('{"version":1,"requestListWidth":100}').requestListWidth).toBe(210);
    for (const data of [{}, { requestListWidth: null }, { requestListWidth: '320' }])
      expect(
        restorePreferences(JSON.stringify({ version: 1, ...data })).requestListWidth,
      ).toBeNull();
  });
  it('側邊欄寬度會保存、限制範圍，舊設定沿用 216px', () => {
    for (const [saved, expected] of [
      [320, 320],
      [100, 180],
      [900, 480],
      [240.7, 241],
    ]) {
      expect(
        restorePreferences(JSON.stringify({ version: 1, sidebarWidth: saved })).sidebarWidth,
      ).toBe(expected);
    }
    expect(restorePreferences('{"version":1}').sidebarWidth).toBe(216);
  });
  it('損壞、缺少或舊版設定使用預設值', () => {
    for (const raw of [null, '{', 'null', '[]', '{"version":2}', '{"fontSize":18}']) {
      expect(restorePreferences(raw)).toEqual(defaultPreferences);
    }
  });
  it('保留有效設定，忽略不合法欄位，限制字體大小與字體名稱', () => {
    expect(
      restorePreferences(
        JSON.stringify({
          version: 1,
          followBranchColor: true,
          fontSize: 100,
          fontFamily: '  Consolas\n  ',
          defaultCommitLimit: 123,
          density: 'unknown',
          use24HourTime: 'false',
          highlightSelectedLine: 'false',
        }),
      ),
    ).toEqual({
      ...defaultPreferences,
      followBranchColor: true,
      fontSize: 20,
      fontFamily: 'Consolas',
    });
    expect(restorePreferences('{"version":1,"fontSize":-10}').fontSize).toBe(11);
  });
  it('設定重開後完整還原', () => {
    const settings = {
      ...defaultPreferences,
      followBranchColor: true,
      followTagColor: true,
      highlightHead: false,
      highlightSelectedLine: false,
      fontFamily: 'Microsoft JhengHei',
      codeFontFamily: 'Consolas',
      fontSize: 18,
      density: 'compact' as const,
      dateFormat: 'full' as const,
      use24HourTime: false,
      showColumnDividers: false,
      defaultRemotes: false,
      defaultCommitLimit: 1000,
    };
    expect(restorePreferences(JSON.stringify(settings))).toEqual(settings);
  });
  it('自訂字體名稱以單一字體處理，保留後備字體', () => {
    expect(fontStack('', 'sans-serif')).toBe('sans-serif');
    expect(fontStack('Name, With "Quotes"', 'sans-serif')).toBe(
      '"Name, With \\"Quotes\\"", sans-serif',
    );
  });
  it('既有設定缺少高亮開關時預設開啟，儲存的關閉設定仍會還原', () => {
    expect(restorePreferences('{"version":1}').highlightSelectedLine).toBe(true);
    expect(
      restorePreferences('{"version":1,"highlightSelectedLine":false}').highlightSelectedLine,
    ).toBe(false);
  });
});
