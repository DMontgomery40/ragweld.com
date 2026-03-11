# AGENTS.md

E2E tests in this tree are product proof, not mocked demos.

- Run against the real stack.
- No request interception stubs for new or edited tests.
- Prefer one canonical acceptance flow with durable artifacts over many shallow smoke checks.
- Write screenshots and machine-readable results under `/Users/davidmontgomery/ragweld/output/playwright/`.
- If a UI proof test fails, capture the first failing checkpoint clearly so the next automation run can continue from evidence instead of rediscovery.
