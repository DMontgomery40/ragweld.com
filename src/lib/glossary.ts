import fs from 'node:fs';
import path from 'node:path';

export type GlossaryLink = { text: string; href: string };
export type GlossaryBadge = { text: string; class: string };

export type GlossaryTerm = {
  term: string;
  key: string;
  definition: string;
  category: string;
  related: string[];
  links?: GlossaryLink[];
  badges?: GlossaryBadge[];
};

export type GlossaryJson = {
  version: string;
  generated_from?: string | null;
  terms: GlossaryTerm[];
};

export type GlossaryCategoryId =
  | 'infrastructure'
  | 'models'
  | 'retrieval'
  | 'reranking'
  | 'evaluation'
  | 'advanced';

type GlossaryCategoryDef = {
  title: string;
  icon: string;
  keywords: string[];
};

function repoPath(...parts: string[]) {
  return path.resolve(process.cwd(), ...parts);
}

export const GLOSSARY_CATEGORIES: Record<GlossaryCategoryId, GlossaryCategoryDef> = {
  infrastructure: {
    title: 'Infrastructure',
    icon: '🔧',
    keywords: ['QDRANT', 'REDIS', 'REPO', 'COLLECTION', 'OUT_DIR', 'MCP', 'DOCKER'],
  },
  models: {
    title: 'Models & Providers',
    icon: '🤖',
    keywords: ['MODEL', 'OPENAI', 'ANTHROPIC', 'GOOGLE', 'OLLAMA', 'VOYAGE', 'COHERE', 'API_KEY', 'EMBEDDING'],
  },
  retrieval: {
    title: 'Retrieval & Search',
    icon: '🔍',
    keywords: ['TOPK', 'FINAL_K', 'HYBRID', 'ALPHA', 'BM25', 'DENSE', 'SEARCH', 'QUERY'],
  },
  reranking: {
    title: 'Reranking',
    icon: '🎯',
    keywords: ['RERANK', 'CROSS_ENCODER', 'LEARNING_RANKER', 'TRAINING'],
  },
  evaluation: {
    title: 'Evaluation',
    icon: '📊',
    keywords: ['EVAL', 'GOLDEN', 'BASELINE', 'METRICS'],
  },
  advanced: {
    title: 'Advanced',
    icon: '⚙️',
    keywords: ['CUSTOM', 'BOOST', 'LAYER', 'CONTEXT', 'STOP_WORDS', 'MAX_QUERY_REWRITES'],
  },
};

export const GLOSSARY_CATEGORY_ORDER: GlossaryCategoryId[] = [
  'infrastructure',
  'models',
  'retrieval',
  'reranking',
  'evaluation',
  'advanced',
];

export function slugifyTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function slugifyKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/^-+|-+$/g, '');
}

export function categorizeGlossaryKey(key: string): GlossaryCategoryId {
  const upper = String(key || '').toUpperCase();
  for (const categoryId of GLOSSARY_CATEGORY_ORDER) {
    const category = GLOSSARY_CATEGORIES[categoryId];
    if (category.keywords.some((k) => upper.includes(k))) return categoryId;
  }
  return 'advanced';
}

export function resolveGlossaryJsonPath(): string {
  const envOverride = String(process.env.RAGWELD_GLOSSARY_PATH || '').trim();
  if (envOverride) {
    const resolved = path.resolve(process.cwd(), envOverride);
    if (!fs.existsSync(resolved)) {
      throw new Error(`RAGWELD_GLOSSARY_PATH points to a missing file: ${resolved}`);
    }
    return resolved;
  }

  const sibling = repoPath('..', 'ragweld', 'web', 'public', 'glossary.json');
  if (fs.existsSync(sibling)) return sibling;

  const pinned = repoPath('public', 'glossary.json');
  if (fs.existsSync(pinned)) return pinned;

  throw new Error(
    [
      'Unable to locate glossary.json.',
      `Looked for:\n- ${sibling}\n- ${pinned}`,
      'Fix: check out ../ragweld, set RAGWELD_GLOSSARY_PATH, or run npm run sync:demo to populate public/glossary.json.',
    ].join('\n')
  );
}

export function loadGlossaryJson(): GlossaryJson {
  const glossaryPath = resolveGlossaryJsonPath();
  const parsed = JSON.parse(fs.readFileSync(glossaryPath, 'utf8')) as Partial<GlossaryJson>;

  const rawTerms = Array.isArray(parsed?.terms) ? parsed.terms : [];
  const terms: GlossaryTerm[] = [];

  for (const t of rawTerms as any[]) {
    const key = typeof t?.key === 'string' ? t.key.trim() : '';
    const term = typeof t?.term === 'string' ? t.term.trim() : '';
    if (!key || !term) continue;

    terms.push({
      key,
      term,
      definition: typeof t?.definition === 'string' ? t.definition : '',
      category: typeof t?.category === 'string' ? t.category : '',
      related: Array.isArray(t?.related) ? t.related.filter((r: any) => typeof r === 'string') : [],
      links: Array.isArray(t?.links)
        ? t.links
            .map((l: any) => ({
              text: typeof l?.text === 'string' ? l.text : '',
              href: typeof l?.href === 'string' ? l.href : '',
            }))
            .filter((l: GlossaryLink) => Boolean(l.href))
        : [],
      badges: Array.isArray(t?.badges)
        ? t.badges
            .map((b: any) => ({
              text: typeof b?.text === 'string' ? b.text : '',
              class: typeof b?.class === 'string' ? b.class : '',
            }))
            .filter((b: GlossaryBadge) => Boolean(b.text))
        : [],
    });
  }

  return {
    version: typeof parsed?.version === 'string' ? parsed.version : '0',
    generated_from: typeof parsed?.generated_from === 'string' ? parsed.generated_from : null,
    terms,
  };
}

export function glossaryDefinitionToDisplayText(definition: string): string {
  let text = String(definition || '');
  if (!text) return '';
  text = text.replace(/\r\n?/g, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/?(?:span|div|strong|em|b|i|code|pre)\b[^>]*>/gi, '');
  return text.trim();
}

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeCssClass(raw: string): string {
  return String(raw || '').replace(/[^A-Za-z0-9_\-\s]/g, '').trim();
}

export function glossaryDefinitionToSafeHtml(definition: string): string {
  const input = String(definition || '').replace(/\r\n?/g, '\n');
  if (!input) return '';

  const allowedTags = new Set(['span', 'br', 'div', 'strong', 'em', 'b', 'i', 'code', 'pre']);
  let out = '';

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch !== '<') {
      if (ch === '&') out += '&amp;';
      else if (ch === '>') out += '&gt;';
      else out += ch;
      continue;
    }

    const close = input.indexOf('>', i + 1);
    if (close < 0) {
      out += '&lt;';
      continue;
    }

    const inner = input.slice(i + 1, close).trim();
    i = close;

    const isClosing = inner.startsWith('/');
    const content = isClosing ? inner.slice(1).trim() : inner;
    const name = content.split(/[\s/]/)[0]?.toLowerCase() || '';

    if (!allowedTags.has(name)) {
      out += `&lt;${escapeHtml(inner)}&gt;`;
      continue;
    }

    if (name === 'br') {
      out += '<br>';
      continue;
    }

    if (isClosing) {
      out += `</${name}>`;
      continue;
    }

    if (name === 'span') {
      const m = content.match(/\bclass\s*=\s*(\"([^\"]*)\"|'([^']*)')/i);
      const cls = sanitizeCssClass(m?.[2] || m?.[3] || '');
      out += cls ? `<span class="${escapeHtml(cls)}">` : '<span>';
      continue;
    }

    out += `<${name}>`;
  }

  // Preserve definition formatting: newlines render as line breaks in HTML.
  return out.replace(/\n/g, '<br>');
}

export function buildTooltipHtmlFromGlossaryTerm(term: GlossaryTerm): string {
  const title = escapeHtml(term.term || term.key);
  const body = glossaryDefinitionToSafeHtml(term.definition || '');

  const badges = Array.isArray(term.badges) ? term.badges : [];
  const badgeHtml = badges
    .map((b) => {
      const text = escapeHtml(b?.text || '');
      const cls = sanitizeCssClass(b?.class || '');
      if (!text) return '';
      return `<span class="tt-badge ${escapeHtml(cls)}">${text}</span>`;
    })
    .filter(Boolean)
    .join(' ');
  const badgesBlock = badgeHtml ? `<div class="tt-badges">${badgeHtml}</div>` : '';

  const links = Array.isArray(term.links) ? term.links : [];
  const linkHtml = links
    .map((l) => {
      const href = String(l?.href || '').trim();
      if (!href) return '';
      const txt = escapeHtml(l?.text || href);
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${txt}</a>`;
    })
    .filter(Boolean)
    .join(' ');
  const linksBlock = linkHtml ? `<div class="tt-links">${linkHtml}</div>` : '';

  return `<span class="tt-title">${title}</span>${badgesBlock}<div>${body}</div>${linksBlock}`;
}

