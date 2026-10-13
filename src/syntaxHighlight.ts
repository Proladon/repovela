import { createBundledHighlighter, type ThemedToken } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages, type BundledLanguage } from 'shiki/langs';
import { escapeHtml } from './markdown';
import type { PatchLine, PatchSource } from './types';

// 共用實例，使用 JS 引擎以符合桌面版 CSP；語言按需載入。
const createHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: { 'github-dark': () => import('shiki/themes/github-dark.mjs') },
  engine: () => createJavaScriptRegexEngine(),
});
let highlighterPromise: ReturnType<typeof createHighlighter> | undefined;
export function getHighlighter() {
  return (highlighterPromise ??= createHighlighter({
    themes: ['github-dark'],
    langs: [],
  }).catch((error) => {
    highlighterPromise = undefined;
    throw error;
  }));
}

const loadingLanguages = new Map<string, Promise<BundledLanguage | 'text'>>();
export async function loadLanguage(language = ''): Promise<BundledLanguage | 'text'> {
  const name = language.toLowerCase();
  if (!Object.hasOwn(bundledLanguages, name)) return 'text';
  const highlighter = await getHighlighter();
  if (highlighter.getLoadedLanguages().includes(name)) return name as BundledLanguage;
  let pending = loadingLanguages.get(name);
  if (!pending) {
    pending = highlighter
      .loadLanguage(bundledLanguages[name as BundledLanguage])
      .then(() => name as BundledLanguage)
      .catch(() => 'text' as const)
      .finally(() => loadingLanguages.delete(name));
    loadingLanguages.set(name, pending);
  }
  return pending;
}

export async function loadEmbeddedLanguages(language: string, content: string) {
  if (language !== 'vue') return;
  const languages = Array.from(
    content.matchAll(/<(?:script|style|template)\b[^>]*\blang\s*=\s*["']?([^\s"'>]+)/gi),
    (match) => match[1].toLowerCase(),
  );
  await Promise.all(
    [...new Set(languages)].map((lang) => loadLanguage(lang === 'postcss' ? 'css' : lang)),
  );
}

const extensions: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  vue: 'vue',
  svelte: 'svelte',
  astro: 'astro',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  json: 'json',
  jsonc: 'jsonc',
  json5: 'json5',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  md: 'markdown',
  mdx: 'mdx',
  xml: 'xml',
  svg: 'xml',
  py: 'python',
  pyi: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  fs: 'fsharp',
  fsx: 'fsharp',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  rb: 'ruby',
  php: 'php',
  dart: 'dart',
  lua: 'lua',
  ex: 'elixir',
  exs: 'elixir',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  fish: 'fish',
  ps1: 'powershell',
  psm1: 'powershell',
  psd1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'proto',
  tf: 'terraform',
  tfvars: 'terraform',
  ini: 'ini',
  conf: 'ini',
  diff: 'diff',
  patch: 'diff',
};
export function languageForPath(path: string) {
  const name = path.replaceAll('\\', '/').split('/').pop()!.toLowerCase();
  if (name === 'cargo.lock') return 'toml';
  if (/^(dockerfile|containerfile)(\.|$)/.test(name)) return 'dockerfile';
  if (['makefile', 'gnumakefile'].includes(name)) return 'makefile';
  if (name === 'cmakelists.txt' || name.endsWith('.cmake')) return 'cmake';
  if (/^\.env($|\.)/.test(name)) return 'dotenv';
  if (['.gitignore', '.gitattributes', '.gitmodules'].includes(name)) return 'ini';
  return extensions[name.split('.').pop()!] ?? 'text';
}

function reversePatch(source: string, lines: PatchLine[], side: 'old' | 'new') {
  const original = source.replaceAll('\r\n', '\n').split('\n');
  const restored: string[] = [];
  let cursor = 0;
  for (const line of lines) {
    if (['H', 'hunk'].includes(line.kind)) {
      const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line.text);
      if (!hunk) continue;
      const start = Number(hunk[side === 'old' ? 1 : 3]);
      const count = Number(hunk[side === 'old' ? 2 : 4] ?? 1);
      const offset = count === 0 ? start : start - 1;
      for (const text of original.slice(cursor, offset)) restored.push(text);
      cursor = offset;
    } else if (line.kind === (side === 'old' ? '+' : '-')) {
      restored.push(line.text);
    } else if (line.kind === (side === 'old' ? '-' : '+')) {
      cursor++;
    } else if (line.oldLine !== null && line.newLine !== null) {
      restored.push(original[cursor] ?? line.text);
      cursor++;
    }
  }
  for (const text of original.slice(cursor)) restored.push(text);
  return restored.join('\n');
}

function renderTokens(tokens: ThemedToken[]) {
  return (
    tokens
      .map((token) => {
        const styles = [`color:${token.color}`];
        if (token.fontStyle && token.fontStyle & 1) styles.push('font-style:italic');
        if (token.fontStyle && token.fontStyle & 2) styles.push('font-weight:bold');
        if (token.fontStyle && token.fontStyle & 4) styles.push('text-decoration:underline');
        return `<span style="${styles.join(';')}">${escapeHtml(token.content)}</span>`;
      })
      .join('') || ' '
  );
}

export async function highlightPatch(
  lines: PatchLine[],
  path: string,
  sources?: PatchSource | null,
): Promise<string[]> {
  const result = lines.map((line) => escapeHtml(line.text || ' '));
  const language = await loadLanguage(languageForPath(path));
  if (language === 'text') return result;
  const highlighter = await getHighlighter();
  if (sources && (sources.oldSource != null || sources.newSource != null)) {
    const oldSource = sources.oldSource ?? reversePatch(sources.newSource!, lines, 'new');
    const newSource = sources.newSource ?? reversePatch(sources.oldSource!, lines, 'old');
    await loadEmbeddedLanguages(language, `${oldSource}\n${newSource}`);
    const oldTokens = highlighter.codeToTokens(oldSource, {
      lang: language,
      theme: 'github-dark',
    }).tokens;
    const newTokens = highlighter.codeToTokens(newSource, {
      lang: language,
      theme: 'github-dark',
    }).tokens;
    lines.forEach((line, index) => {
      const tokens =
        line.kind === '-' ? oldTokens[(line.oldLine ?? 0) - 1] : newTokens[(line.newLine ?? 0) - 1];
      // 來源與 diff 若在讀取期間變更，該行保留原始文字，避免顯示錯誤程式碼。
      if (tokens && tokens.map((token) => token.content).join('') === line.text)
        result[index] = renderTokens(tokens);
    });
    return result;
  }
  await loadEmbeddedLanguages(language, lines.map((line) => line.text).join('\n'));
  // 每個 hunk 分別解析舊版與新版，避免刪除行污染新增行的多行語法狀態。
  let start = 0;
  while (start < lines.length) {
    if (['H', 'hunk', 'meta'].includes(lines[start].kind)) {
      start++;
      continue;
    }
    let end = start;
    while (end < lines.length && !['H', 'hunk', 'meta'].includes(lines[end].kind)) end++;
    for (const side of ['old', 'new']) {
      const indices = Array.from({ length: end - start }, (_, offset) => start + offset).filter(
        (index) => lines[index].kind !== (side === 'old' ? '+' : '-'),
      );
      if (!indices.length) continue;
      const { tokens } = highlighter.codeToTokens(
        indices.map((index) => lines[index].text).join('\n'),
        { lang: language, theme: 'github-dark' },
      );
      indices.forEach((index, offset) => {
        result[index] = renderTokens(tokens[offset]);
      });
    }
    start = end;
  }
  return result;
}
