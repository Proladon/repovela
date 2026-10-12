import type {
  ChangeRequestPage,
  Forge,
  RequestState,
  RequestDetail,
  RequestChanges,
} from './types';

export function demoRequestDetail(provider: Forge, number: number): RequestDetail {
  return {
    request: demoChangeRequests(provider, 'all').items.find((item) => item.number === number)!,
    headOid: 'a'.repeat(40),
    mergeStatus: 'clean',
  };
}
export function demoRequestChanges(): RequestChanges {
  return {
    headOid: 'a'.repeat(40),
    nextCursor: null,
    files: [
      {
        path: 'src/search.ts',
        previousPath: null,
        kind: 'modified',
        additions: 2,
        deletions: 1,
        patch:
          '@@ -1,3 +1,4 @@\n export function search(query: string) {\n-  return query;\n+  const normalized = query.trim();\n+  return normalized.toLowerCase();\n }',
        truncated: false,
      },
      {
        path: 'README.md',
        previousPath: 'docs/README.md',
        kind: 'renamed',
        additions: 1,
        deletions: 0,
        patch: '@@ -1 +1,2 @@\n # Repovela\n+支援專案 PR／MR 瀏覽。',
        truncated: false,
      },
      {
        path: 'assets/icon.png',
        previousPath: null,
        kind: 'added',
        additions: 0,
        deletions: 0,
        patch: null,
        truncated: false,
      },
    ],
  };
}

export function demoChangeRequests(provider: Forge, state: RequestState): ChangeRequestPage {
  return {
    items: (
      [
        { number: 42, title: '新增專案 PR／MR 瀏覽', state: 'open', draft: false },
        { number: 41, title: '改善遠端分支切換流程', state: 'merged', draft: false },
        { number: 40, title: '調整歷史列表顯示', state: 'closed', draft: false },
        { number: 39, title: '支援更多搜尋條件', state: 'open', draft: true },
      ] as const
    )
      .filter((item) => state === 'all' || item.state === state)
      .map((item) => ({
        ...item,
        body: '在 Repovela 內瀏覽專案的變更請求。\n\n這是展示資料，包含標題、作者、狀態、分支與說明。',
        author: 'demo-author',
        sourceBranch: `feature/request-${item.number}`,
        targetBranch: 'main',
        updatedAt: '2026-10-12T08:00:00Z',
        url:
          provider === 'github'
            ? `https://github.com/trasta298/keifu/pull/${item.number}`
            : `https://gitlab.com/demo/keifu/-/merge_requests/${item.number}`,
        labels: ['enhancement'],
      })),
    nextCursor: null,
  };
}
