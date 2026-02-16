import fs from 'node:fs';
import path from 'node:path';
import { buildTooltipHtmlFromGlossaryTerm, loadGlossaryJson } from './glossary';

type TsProp = {
  name: string;
  optional: boolean;
  type: string;
  defaultValue: string | null;
  description: string | null;
};

type TsInterface = {
  name: string;
  description: string | null;
  props: TsProp[];
};

export type KnobEntry = {
  path: string;
  type: string;
  defaultValue: string | null;
  description: string | null;
  group: string;
  envKeys: string[];
  tooltipEnvKey: string | null;
  internal: boolean;
};

export type KnobRegistry = {
  knobs: KnobEntry[];
  groups: Record<string, KnobEntry[]>;
  tooltipHtmlByEnvKey: Record<string, string>;
};

type EnvKeyMap = {
  envToPath: Record<string, string>;
  pathToEnvs: Record<string, string[]>;
};

function repoPath(...parts: string[]) {
  return path.resolve(process.cwd(), ...parts);
}

function stripJsDocStars(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trimEnd())
    .join('\n')
    .trim();
}

function parseGeneratedTypes(tsText: string): Map<string, TsInterface> {
  const lines = tsText.split(/\r?\n/);
  const interfaces = new Map<string, TsInterface>();

  let current: TsInterface | null = null;
  let pendingComment: string | null = null;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('/**')) {
      const commentLines: string[] = [];
      // Collect until closing */
      while (i < lines.length) {
        const l = lines[i];
        const t = l.trim();

        // Single-line /** ... */
        if (t.startsWith('/**') && t.includes('*/')) {
          const inner = t.slice(t.indexOf('/**') + 3, t.indexOf('*/'));
          if (inner.trim()) commentLines.push(inner.trim());
          break;
        }

        if (t.startsWith('*')) commentLines.push(t);
        if (t.endsWith('*/')) break;
        i += 1;
      }

      pendingComment = stripJsDocStars(commentLines.join('\n')) || null;
      i += 1;
      continue;
    }

    const ifaceMatch = line.match(/^export interface\s+(\w+)\s*\{/);
    if (ifaceMatch) {
      current = { name: ifaceMatch[1], description: pendingComment, props: [] };
      pendingComment = null;
      i += 1;
      continue;
    }

    if (current && /^}/.test(trimmed)) {
      interfaces.set(current.name, current);
      current = null;
      i += 1;
      continue;
    }

    if (current) {
      const propMatch = line.match(
        /^\s*([A-Za-z0-9_]+)(\?)?:\s*([^;]+);\s*(?:\/\/\s*default:\s*(.*))?$/
      );
      if (propMatch) {
        const [, name, opt, typeRaw, defRaw] = propMatch;
        current.props.push({
          name,
          optional: opt === '?',
          type: String(typeRaw || '').trim(),
          defaultValue: defRaw ? String(defRaw).trim() : null,
          description: pendingComment,
        });
        pendingComment = null;
      }

      i += 1;
      continue;
    }

    i += 1;
  }

  return interfaces;
}

function parseEnvKeyMap(jsonText: string): EnvKeyMap {
  const parsed = JSON.parse(jsonText) as Partial<EnvKeyMap>;
  return {
    envToPath: parsed.envToPath || {},
    pathToEnvs: parsed.pathToEnvs || {},
  };
}

function rewriteDocsHref(href: string, docsBase: string): string {
  const raw = String(href || '');
  if (!raw) return raw;

  // The GUI uses `/docs/*.md` routes. On the marketing site we point to the GitHub Pages docs.
  const normalized = raw.startsWith('docs/') ? `/${raw}` : raw;
  if (!normalized.startsWith('/docs/')) return raw;

  let p = normalized.slice('/docs/'.length);
  let anchor = '';
  if (p.includes('#')) {
    const parts = p.split('#');
    p = parts[0];
    anchor = `#${parts.slice(1).join('#')}`;
  }

  if (p.endsWith('.md')) p = p.slice(0, -3);
  p = p.replace(/^\/+/, '');
  if (p && !p.endsWith('/')) p += '/';

  return `${docsBase.replace(/\/+$/, '/')}${p}${anchor}`;
}

function rewriteTooltipHtmlLinks(html: string, docsBase: string): string {
  if (!html) return html;
  return html.replace(/href=\"([^\"]+)\"/g, (_m, href) => `href="${rewriteDocsHref(href, docsBase)}"`);
}

function isInternalKnobText(text: string): boolean {
  const t = String(text || '').toLowerCase();
  if (!t) return false;
  return (
    t.includes('users never touch') ||
    t.includes('never touch this') ||
    t.includes('auto-created') ||
    t.includes('internal') ||
    t.includes('debug') ||
    t.includes('experimental')
  );
}

function parseType(raw: string): { kind: 'ref' | 'primitive' | 'array' | 'record' | 'union' | 'other'; base?: string } {
  let type = String(raw || '').trim();
  const parts = type.split('|').map((p) => p.trim());
  if (parts.length > 1) {
    const filtered = parts.filter((p) => p !== 'null' && p !== 'undefined');
    if (filtered.length === 1) type = filtered[0];
    else return { kind: 'union' };
  }

  if (type.endsWith('[]')) return { kind: 'array', base: type.slice(0, -2).trim() };
  const rec = type.match(/^Record<string,\s*([^>]+)>$/);
  if (rec) return { kind: 'record', base: rec[1].trim() };
  if (['string', 'number', 'boolean', 'unknown', 'any', 'object'].includes(type)) return { kind: 'primitive' };
  if (/^\".*\"$/.test(type)) return { kind: 'primitive' };
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(type)) return { kind: 'ref', base: type };
  return { kind: 'other' };
}

function groupFromPath(dotPath: string): string {
  const p = String(dotPath || '');
  const first = p.split('.')[0] || '';
  return first.replace(/\[\]$/, '') || 'other';
}

export function buildKnobRegistry(): KnobRegistry {
  const docsBase = 'https://dmontgomery40.github.io/ragweld/';

  const generatedTypesPath = repoPath('vendor', 'demo', 'src', 'types', 'generated.ts');
  const envMapPath = repoPath('src', 'data', 'env-key-map.json');

  const tsText = fs.readFileSync(generatedTypesPath, 'utf8');
  const interfaces = parseGeneratedTypes(tsText);

  const envKeyMap = fs.existsSync(envMapPath) ? parseEnvKeyMap(fs.readFileSync(envMapPath, 'utf8')) : null;

  const glossary = loadGlossaryJson();
  const tooltipHtmlByEnvKey: Record<string, string> = {};
  for (const t of glossary.terms) {
    if (!t?.key) continue;
    tooltipHtmlByEnvKey[t.key] = rewriteTooltipHtmlLinks(buildTooltipHtmlFromGlossaryTerm(t), docsBase);
  }

  const knobs: KnobEntry[] = [];

  const root = interfaces.get('TriBridConfig');
  if (!root) throw new Error('Missing TriBridConfig in vendor/demo/src/types/generated.ts');

  const stack: string[] = [];

  function walkInterface(ifaceName: string, prefix: string) {
    if (stack.includes(ifaceName)) return;
    const def = interfaces.get(ifaceName);
    if (!def) return;

    stack.push(ifaceName);
    for (const prop of def.props) {
      const p = prefix ? `${prefix}.${prop.name}` : prop.name;
      const t = parseType(prop.type);

      if (t.kind === 'ref' && t.base && interfaces.has(t.base)) {
        walkInterface(t.base, p);
        continue;
      }

      if (t.kind === 'array' && t.base) {
        const inner = parseType(t.base);
        if (inner.kind === 'ref' && inner.base && interfaces.has(inner.base)) {
          walkInterface(inner.base, `${p}[]`);
        } else {
          knobs.push(makeKnob(p, prop));
        }
        continue;
      }

      if (t.kind === 'record') {
        knobs.push(makeKnob(p, prop));
        continue;
      }

      // Leaf (primitive/union/other)
      knobs.push(makeKnob(p, prop));
    }
    stack.pop();
  }

  function makeKnob(dotPath: string, prop: TsProp): KnobEntry {
    const envKeys = envKeyMap?.pathToEnvs?.[dotPath] || [];
    const tooltipEnvKey = envKeys.find((k) => k in tooltipHtmlByEnvKey) || null;

    const internal =
      isInternalKnobText(prop.description || '') ||
      (tooltipEnvKey ? isInternalKnobText(tooltipHtmlByEnvKey[tooltipEnvKey] || '') : false);

    return {
      path: dotPath,
      type: prop.type,
      defaultValue: prop.defaultValue,
      description: prop.description,
      group: groupFromPath(dotPath),
      envKeys,
      tooltipEnvKey,
      internal,
    };
  }

  walkInterface('TriBridConfig', '');

  // Stable sort: group then path.
  knobs.sort((a, b) => {
    const g = a.group.localeCompare(b.group);
    if (g !== 0) return g;
    return a.path.localeCompare(b.path);
  });

  const groups: Record<string, KnobEntry[]> = {};
  for (const k of knobs) {
    const g = k.group || 'other';
    if (!groups[g]) groups[g] = [];
    groups[g].push(k);
  }

  return { knobs, groups, tooltipHtmlByEnvKey };
}

export function safeJsonForHtml(value: unknown): string {
  // Avoid accidentally terminating a <script> tag, and keep output stable.
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
