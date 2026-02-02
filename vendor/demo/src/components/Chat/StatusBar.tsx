import type { ActiveSources, ChunkMatch } from '@/types/generated';

type StatusBarProps = {
  sources: ActiveSources;
  matches: ChunkMatch[];
  latencyMs: number | null;
};

function formatCorpusLabel(corpusId: string): string {
  if (corpusId === 'recall_default') return 'Recall';
  return corpusId;
}

export function StatusBar(props: StatusBarProps) {
  const { matches, latencyMs } = props;

  const counts = new Map<string, number>();
  for (const match of matches) {
    const rawCorpusId = match.metadata?.corpus_id;
    const corpusId =
      typeof rawCorpusId === 'string' && rawCorpusId.trim().length > 0 ? rawCorpusId : 'unknown';
    counts.set(corpusId, (counts.get(corpusId) ?? 0) + 1);
  }

  const orderedCorpusIds = Array.from(counts.keys()).sort((a, b) => {
    if (a === 'recall_default' && b !== 'recall_default') return -1;
    if (a !== 'recall_default' && b === 'recall_default') return 1;
    return a.localeCompare(b);
  });

  const parts: string[] = orderedCorpusIds.map((corpusId) => {
    const label = formatCorpusLabel(corpusId);
    const count = counts.get(corpusId) ?? 0;
    return `${label}: ${count}`;
  });

  if (latencyMs !== null) {
    parts.push(`${Math.round(latencyMs)}ms`);
  }

  const text = parts.join(' | ');

  return (
    <div
      data-testid="chat-status-bar"
      aria-label="Chat status"
      title={text}
      style={{
        padding: '6px 10px',
        borderTop: '1px solid var(--line)',
        background: 'var(--bg-elev1)',
        fontSize: '11px',
        color: 'var(--fg-muted)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {text}
    </div>
  );
}

