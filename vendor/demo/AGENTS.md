# AGENTS.md

Frontend work in `web/` must reflect backend truth instead of inventing a second schema layer.

- Import API types from `/Users/davidmontgomery/ragweld/web/src/types/generated.ts`; do not hand-write payload types.
- Do not add adapters/transformers to reshape API payloads for convenience.
- If the UI cannot honestly represent backend state, fix the backend model or the UI contract, not both with glue.
- For deadline work, prioritize flows the user can actually see: indexing, graph, chat, feedback, and eval.
- Keep tests honest: no Playwright request interception stubs for new or edited E2E coverage.
