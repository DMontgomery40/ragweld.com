const fs = require('fs');
const path = require('path');

const glossaryPath = '/Users/davidmontgomery/ragweld/data/glossary.json';
const outDir = '/Users/davidmontgomery/ragweld.com/crucible/.tmp_tooltip_outputs_round2';

function readJson(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function writeJson(p,obj){ fs.writeFileSync(p, JSON.stringify(obj,null,2)+"\n"); }

const glossary = readJson(glossaryPath);
if (!Array.isArray(glossary.terms)) throw new Error('Unexpected glossary schema: terms array missing');
const terms = glossary.terms;
const byKey = new Map(terms.map(t => [t.key, t]));

const batchFiles = fs.readdirSync(outDir)
  .filter(f => /^batch_\d+\.json$/.test(f))
  .map(f => path.join(outDir,f))
  .sort();

if (!batchFiles.length) {
  console.error('No batch JSON files found in', outDir);
  process.exit(1);
}

const stats = {
  files: batchFiles.length,
  items: 0,
  updated: 0,
  missingKey: [],
  malformed: [],
};

for (const file of batchFiles) {
  let arr;
  try {
    arr = readJson(file);
  } catch (e) {
    stats.malformed.push({file, error: e.message});
    continue;
  }
  if (!Array.isArray(arr)) {
    stats.malformed.push({file, error: 'not an array'});
    continue;
  }

  for (const item of arr) {
    stats.items++;
    const key = item?.key;
    if (!key || !byKey.has(key)) {
      stats.missingKey.push({file, key});
      continue;
    }
    const existing = byKey.get(key);
    if (typeof item.definition === 'string' && item.definition.trim()) {
      existing.definition = item.definition.trim();
    }
    if (Array.isArray(item.links) && item.links.length) {
      existing.links = item.links.map(l => ({
        text: String(l.text ?? l.title ?? '').trim(),
        href: String(l.href ?? l.url ?? '').trim(),
      })).filter(l => l.text && l.href);
    }
    if (Array.isArray(item.badges)) {
      existing.badges = item.badges;
    }
    stats.updated++;
  }
}

writeJson(glossaryPath, glossary);

// global validation
const val = {
  total: terms.length,
  missing4: 0,
  missingArxiv: 0,
  needs: 0,
  exact4: 0,
  badHref: 0,
  keysNeeding: [],
};
for (const t of terms) {
  const links = Array.isArray(t.links) ? t.links : [];
  const has4 = links.length >= 4;
  const hasArxiv = links.some(l => /arxiv\.org/i.test(String(l.href || '')));
  if (links.length === 4) val.exact4++;
  for (const l of links) {
    if (!/^https?:\/\//.test(String(l.href || ''))) val.badHref++;
  }
  if (!has4) val.missing4++;
  if (!hasArxiv) val.missingArxiv++;
  if (!has4 || !hasArxiv) {
    val.needs++;
    val.keysNeeding.push({key:t.key, links:links.length, hasArxiv});
  }
}

console.log(JSON.stringify({stats, validation:val, sampleNeeds: val.keysNeeding.slice(0,40)}, null, 2));
