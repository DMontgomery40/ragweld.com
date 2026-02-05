---
paths: web/src/stores/**/*.ts
---

# Zustand Store Conventions

All configuration state MUST use Zustand stores. Never `useState` for config.

## Complete Store List (11 stores)

### useConfigStore
Central config management - single source of truth for all settings.
```typescript
// Actions: loadConfig, saveConfig, updateEnv, updateRepo, loadKeywords
const config = useConfigStore(state => state.config);
const saveConfig = useConfigStore(state => state.saveConfig);
```

### useUIStore
UI state persisted to localStorage - survives page reload.
```typescript
// State: activeSubtab, collapsedSections, sidepanelWidth, themeMode
const activeSubtab = useUIStore(state => state.activeSubtab);
const setActiveSubtab = useUIStore(state => state.setActiveSubtab);
```

### useRepoStore
Corpus management with event dispatch for cross-component sync.
```typescript
// State: repos[], activeRepo, switching, loading, initialized
// Actions: loadRepos, setActiveRepo, refreshActiveRepo, updateRepoIndexing
// Also exports: useActiveRepo, useRepos, useRepoLoading, useRepoInitialized
const repos = useRepoStore(state => state.repos);
const activeRepo = useRepoStore(state => state.activeRepo);
```

### useHealthStore
Health check state for service status monitoring.
```typescript
// State: status, loading, error, lastChecked
// Actions: checkHealth
const { status, loading, checkHealth } = useHealthStore();
```

### useDockerStore
Docker container state management.
```typescript
// State: containers, loading, error
// Actions: loadContainers, refreshStatus
const containers = useDockerStore(state => state.containers);
```

### useGraphStore
Graph state management for Neo4j visualization + stats.
```typescript
// State: nodes, edges, stats, loading, error
// Actions: loadGraph, queryGraph, clearGraph
const stats = useGraphStore(state => state.stats);
```

### useCardsStore
Cards/prompts management for knowledge cards.
```typescript
// State: cards[], lastBuild, loading
// Actions: loadCards, buildCards, deleteCard
// Types: Card, LastBuild
const cards = useCardsStore(state => state.cards);
```

### useChunkSummariesStore
Chunk summary management (aka `chunk_summaries`).
```typescript
// State: summaries, lastBuild, loading, error
// Actions: loadSummaries, buildSummaries, deleteSummary
const summaries = useChunkSummariesStore(state => state.summaries);
```

### useTooltipStore
Tooltip content storage keyed by setting name.
```typescript
// State: tooltips (Record<string, string>)
// Actions: loadTooltips, getTooltip
// Type: TooltipMap
const tooltips = useTooltipStore(state => state.tooltips);
```

### useCostCalculatorStore
Cost calculator state for model cost projections.
```typescript
// State: inputs, outputs, totals
// Actions: setInputs, calculate
const totals = useCostCalculatorStore(state => state.totals);
```

### useAlertThresholdsStore
Alert configuration for monitoring thresholds.
```typescript
// State: thresholds, loading
// Actions: loadThresholds, updateThreshold
const thresholds = useAlertThresholdsStore(state => state.thresholds);
```

## Critical Rule: Selective Subscriptions

**ALWAYS use selectors to prevent unnecessary re-renders:**

```typescript
// CORRECT - Only re-renders when env changes
const env = useConfigStore(state => state.config?.env);

// WRONG - Re-renders on ANY store change
const store = useConfigStore(); // NEVER DO THIS
```

## Store Pattern

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MyStore {
  value: string;
  loading: boolean;
  error: string | null;
  setValue: (v: string) => void;
  load: () => Promise<void>;
}

export const useMyStore = create<MyStore>()(
  persist(
    (set, get) => ({
      value: '',
      loading: false,
      error: null,
      setValue: (v) => set({ value: v }),
      load: async () => {
        set({ loading: true, error: null });
        try {
          const data = await api.fetch();
          set({ value: data, loading: false });
        } catch (e) {
          set({ error: e.message, loading: false });
        }
      },
    }),
    { name: 'my-store' }  // localStorage key
  )
);
```

## Persistence

Use `persist` middleware for state that should survive page reload:
- UI preferences (theme, panel widths)
- Active tab/subtab selections
- Collapsed section states

## Cross-Component Communication

Use custom events for store-independent communication:
```typescript
// Dispatch
window.dispatchEvent(new CustomEvent('agro-repo-changed', { detail: { repo: corpusId } }));

// Listen
useEffect(() => {
  const handler = (e: CustomEvent) => handleChange(e.detail);
  window.addEventListener('agro-repo-changed', handler);
  return () => window.removeEventListener('agro-repo-changed', handler);
}, []);
```

## Key Files

- `web/src/stores/useConfigStore.ts`
- `web/src/stores/useUIStore.ts`
- `web/src/stores/useRepoStore.ts`
- `web/src/stores/useHealthStore.ts`
- `web/src/stores/useDockerStore.ts`
- `web/src/stores/useGraphStore.ts`
- `web/src/stores/useCardsStore.ts`
- `web/src/stores/useChunkSummariesStore.ts`
- `web/src/stores/useTooltipStore.ts`
- `web/src/stores/useCostCalculatorStore.ts`
- `web/src/stores/useAlertThresholdsStore.ts`
- `web/src/stores/index.ts` - Barrel export
