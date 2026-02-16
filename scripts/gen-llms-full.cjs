const fs = require('fs');
const path = require('path');

const base = fs.readFileSync(path.join(__dirname, '..', 'public', 'llms.txt'), 'utf8');
const g = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'glossary.json'), 'utf8'));

const categories = {};
for (const t of g.terms) {
  const cat = t.category || 'Other';
  if (!(cat in categories)) categories[cat] = [];
  categories[cat].push(t);
}

let out = base + '\n\n## Full Parameter Glossary\n\n';
out += 'All ' + g.terms.length + ' configurable parameters in ragweld, grouped by category.\n\n';

for (const [cat, terms] of Object.entries(categories).sort()) {
  out += '### ' + cat + '\n\n';
  for (const t of terms.sort((a, b) => a.term.localeCompare(b.term))) {
    const def = (t.definition || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const short = def.length > 200 ? def.slice(0, 197) + '...' : def;
    out += '- **' + t.term + '** (`' + t.key + '`): ' + short + '\n';
  }
  out += '\n';
}

fs.writeFileSync(path.join(__dirname, '..', 'public', 'llms-full.txt'), out);
console.log('Wrote llms-full.txt: ' + Math.round(out.length / 1024) + 'KB, ' + g.terms.length + ' terms');
