import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import footnote from 'markdown-it-footnote';

export const escapeHtml = new MarkdownIt().utils.escapeHtml;

function createParser(inline = false) {
  const parser = new MarkdownIt({ html: false, linkify: true, breaks: true })
    .use(taskLists)
    .use(footnote);
  if (inline) {
    // 清單與標題可能位於按鈕內，不產生巢狀連結或圖片。
    parser.renderer.rules.link_open = () => '';
    parser.renderer.rules.link_close = () => '';
    parser.renderer.rules.image = (tokens, index) => escapeHtml(tokens[index].content);
  } else {
    const linkOpen = parser.renderer.rules.link_open;
    parser.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
      const href = String(tokens[index].attrGet('href') ?? '');
      if (!href.startsWith('#')) {
        tokens[index].attrSet('target', '_blank');
        tokens[index].attrSet('rel', 'noopener noreferrer');
      }
      return linkOpen
        ? linkOpen(tokens, index, options, env, renderer)
        : renderer.renderToken(tokens, index, options);
    };
  }
  return parser;
}

const blockParser = createParser();
const inlineParser = createParser(true);

export function renderMarkdown(content: string, inline = false, docId = '') {
  return inline ? inlineParser.renderInline(content) : blockParser.render(content, { docId });
}

export async function renderHighlightedMarkdown(content: string, docId = '') {
  const parser = createParser();
  const env = { docId };
  const tokens = parser.parse(content, env);
  const fences = tokens.filter((token) => token.type === 'fence');
  if (!fences.length && !tokens.some((token) => token.type === 'code_block'))
    return parser.renderer.render(tokens, parser.options, env);

  const { getHighlighter, loadLanguage, loadEmbeddedLanguages } = await import('./syntaxHighlight');
  const highlighter = await getHighlighter();
  const languages = await Promise.all(
    fences.map((token) => loadLanguage(token.info.trim().split(/\s+/)[0])),
  );
  await Promise.all(
    fences.map((token, index) => loadEmbeddedLanguages(languages[index], token.content)),
  );
  fences.forEach((token, index) => {
    token.info = languages[index];
  });
  const { fromHighlighter } = await import('@shikijs/markdown-it/core');
  parser.use(fromHighlighter(highlighter, { theme: 'github-dark' }));
  parser.renderer.rules.code_block = (tokens, index) =>
    parser.options.highlight!(tokens[index].content, 'text', '') + '\n';
  return parser.renderer.render(tokens, parser.options, env);
}
