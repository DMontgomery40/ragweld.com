/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function extractToFlatDictBlock(pythonSource) {
  const start = pythonSource.indexOf('def to_flat_dict');
  if (start < 0) throw new Error('Could not find def to_flat_dict');
  const slice = pythonSource.slice(start);
  const returnIdx = slice.indexOf('return {');
  if (returnIdx < 0) throw new Error('Could not find return { inside to_flat_dict');

  // Walk braces to find the matching closing `}` for the dict literal.
  let depth = 0;
  let begin = -1;
  let end = -1;
  for (let i = returnIdx; i < slice.length; i++) {
    const ch = slice[i];
    if (ch === '{') {
      depth += 1;
      if (begin === -1) begin = i + 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (begin === -1 || end === -1) throw new Error('Could not parse dict literal braces for to_flat_dict');
  return slice.slice(begin, end);
}

function extractEnvKeyMap(toFlatBlock) {
  const envToPath = {};
  const pathToEnvs = {};

  const lines = toFlatBlock.split(/\r?\n/);
  for (const line of lines) {
    // Example patterns:
    //   'FINAL_K': self.retrieval.final_k,
    //   'EMBEDDING_DIM': int(self.embedding.embedding_dim),
    //   'CHUNK_SUMMARIES_EXCLUDE_DIRS': ', '.join(self.chunk_summaries.exclude_dirs),
    const m = line.match(/^\s*'([^']+)'\s*:\s*([^,]+),/);
    if (!m) continue;
    const envKey = m[1];
    const expr = m[2];

    const pathMatch = expr.match(/self\.([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)/);
    if (!pathMatch) continue;
    const dotPath = pathMatch[1];

    envToPath[envKey] = dotPath;
    if (!pathToEnvs[dotPath]) pathToEnvs[dotPath] = [];
    pathToEnvs[dotPath].push(envKey);
  }

  // Sort env key lists for stable diffs.
  for (const k of Object.keys(pathToEnvs)) pathToEnvs[k].sort();

  return { envToPath, pathToEnvs };
}

function main() {
  const repoRoot = process.cwd();
  const sourcePath =
    process.argv[2] ||
    path.resolve(repoRoot, '..', 'tribrid-rag', 'server', 'models', 'tribrid_config_model.py');
  const outPath = process.argv[3] || path.resolve(repoRoot, 'src', 'data', 'env-key-map.json');

  const pythonSource = fs.readFileSync(sourcePath, 'utf8');
  const toFlatBlock = extractToFlatDictBlock(pythonSource);
  const mapping = extractEnvKeyMap(toFlatBlock);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(mapping, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${Object.keys(mapping.envToPath).length} env keys to ${outPath}`);
}

main();

