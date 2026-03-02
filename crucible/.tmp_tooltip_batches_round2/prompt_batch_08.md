You are a focused worker updating a subset of glossary tooltips.

Files:
- Source glossary: /Users/davidmontgomery/ragweld/data/glossary.json
- Batch keys: /Users/davidmontgomery/ragweld.com/crucible/.tmp_tooltip_batches_round2/batch_08.jsonl
- Output file: /Users/davidmontgomery/ragweld.com/crucible/.tmp_tooltip_outputs_round2/batch_08.json

Requirements for EACH key:
1) Rewrite definition to be verbose, educational, implementation-specific, and concrete.
2) Research current sources online. Do not invent anything.
3) Provide exactly 4 links in shape: {\"text\":\"...\",\"href\":\"...\"}.
4) At least one link must be arXiv and should be the newest relevant paper available (prefer 2026, else >= mid-2025).
5) Other links should be high-authority docs/specs/posts and as recent as possible (>= mid-2025 when possible).
6) Validate every URL with curl -L/-I and drop dead links.
7) Keep key unchanged. Include badges if found in existing term.
8) Write ONLY JSON array to output file with objects {key, definition, links, badges}.

Important constraints:
- This content is educational and neutral.
- Do not edit any file except the output file.
- Ignore unrelated git changes.

At end, print a short summary: number of entries written and output path.
