# Demo Parity Drift Review Matrix (2026-02-27)

One-time audit matrix for the parity remediation PR. Resolution profile is locked to `SOURCE_WINS` for all current non-allowlisted drift paths.

| Path | Baseline Drift Type | Resolution |
| --- | --- | --- |
| `public/glossary.json` | `content_mismatch` | `SOURCE_WINS` |
| `src/components/Admin/IntegrationsSubtab.tsx` | `content_mismatch` | `SOURCE_WINS` |
| `src/components/Infrastructure/PathsSubtab.tsx` | `content_mismatch` | `SOURCE_WINS` |
| `src/components/RAG/GraphSubtab.tsx` | `content_mismatch` | `SOURCE_WINS` |
| `src/components/RAG/IndexingSubtab.tsx` | `content_mismatch` | `SOURCE_WINS` |
| `src/components/RAG/ModelAssignments.tsx` | `missing_in_target` | `SOURCE_WINS` |
| `src/components/RAG/RerankerConfigSubtab.tsx` | `content_mismatch` | `SOURCE_WINS` |
| `src/components/RAG/RetrievalSubtab.tsx` | `content_mismatch` | `SOURCE_WINS` |
| `src/components/Sidepanel.tsx` | `content_mismatch` | `SOURCE_WINS` |
| `src/config/routes.ts` | `content_mismatch` | `SOURCE_WINS` |
| `src/hooks/useEmbeddingModel.ts` | `content_mismatch` | `SOURCE_WINS` |
| `src/hooks/useEmbeddingStatus.ts` | `content_mismatch` | `SOURCE_WINS` |
| `src/types/generated.ts` | `content_mismatch` | `SOURCE_WINS` |
| `vite.config.ts` | `content_mismatch` | `SOURCE_WINS` |
