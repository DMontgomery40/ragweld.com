import { useState } from 'react';
import { useConfig, useConfigField } from '@/hooks';
import { TooltipIcon } from '@/components/ui/TooltipIcon';
import { ProviderSetup } from '@/components/Chat/ProviderSetup';
import type { ChatMultimodalConfig, RecallConfig } from '@/types/generated';

const TABS = ['Model', 'Sources', 'Recall', 'Multimodal', 'Local', 'OpenRouter', 'Benchmark', 'UI'];

export function ChatSettings2() {
  const { config, loading, error, saving } = useConfig();
  const [activeTab, setActiveTab] = useState(TABS[0]);

  // Chat core
  const [systemPromptBase, setSystemPromptBase] = useConfigField(
    'chat.system_prompt_base',
    'You are a helpful assistant.'
  );
  const [temperature, setTemperature] = useConfigField('chat.temperature', 0.3);
  const [temperatureNoRetrieval, setTemperatureNoRetrieval] = useConfigField('chat.temperature_no_retrieval', 0.7);
  const [maxTokens, setMaxTokens] = useConfigField('chat.max_tokens', 4096);

  // Recall (nested) — update the whole object to avoid shallow-merge clobbering.
  const [recall, setRecall] = useConfigField<RecallConfig>('chat.recall', {});
  const [recallAutoIndex] = useConfigField('chat.recall.auto_index', true);
  const [recallDelaySeconds] = useConfigField('chat.recall.index_delay_seconds', 5);

  // Multimodal (nested) — update the whole object to avoid shallow-merge clobbering.
  const [multimodal, setMultimodal] = useConfigField<ChatMultimodalConfig>('chat.multimodal', {});
  const [visionEnabled] = useConfigField('chat.multimodal.vision_enabled', true);

  // UI
  const [chatStreamingEnabled, setChatStreamingEnabled] = useConfigField('ui.chat_streaming_enabled', 1);

  const panel = (() => {
    switch (activeTab) {
      case 'Model':
        return (
          <div className="subtab-panel" style={{ padding: 24 }}>
            <div style={{ marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--fg)' }}>Model</h3>
              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--fg-muted)' }}>
                Prompt + generation knobs, plus provider configuration.
              </div>
            </div>

            <div className="input-row">
              <div className="input-group full-width">
                <label>
                  System prompt (base) <TooltipIcon name="chat.system_prompt_base" />
                </label>
                <textarea
                  value={systemPromptBase}
                  onChange={(e) => setSystemPromptBase(e.target.value)}
                  rows={6}
                  style={{ width: '100%' }}
                />
                <p className="small">
                  Used as the baseline prompt. Recall/RAG suffixes are appended automatically when those sources are
                  enabled.
                </p>
              </div>
            </div>

            <div className="input-row">
              <div className="input-group">
                <label>
                  Temperature <TooltipIcon name="chat.temperature" />
                </label>
                <input
                  type="number"
                  value={temperature}
                  min="0"
                  max="2"
                  step="0.05"
                  onChange={(e) => setTemperature(Number(e.target.value))}
                />
              </div>

              <div className="input-group">
                <label>
                  Temperature (no retrieval) <TooltipIcon name="chat.temperature_no_retrieval" />
                </label>
                <input
                  type="number"
                  value={temperatureNoRetrieval}
                  min="0"
                  max="2"
                  step="0.05"
                  onChange={(e) => setTemperatureNoRetrieval(Number(e.target.value))}
                />
              </div>

              <div className="input-group">
                <label>
                  Max tokens <TooltipIcon name="chat.max_tokens" />
                </label>
                <input
                  type="number"
                  value={maxTokens}
                  min="100"
                  max="16384"
                  step="1"
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
                />
              </div>
            </div>

            <div style={{ marginTop: 18 }}>
              <ProviderSetup />
            </div>
          </div>
        );

      case 'Sources':
        return (
          <div className="subtab-panel" style={{ padding: 24 }}>
            <h3 style={{ marginTop: 0 }}>Sources</h3>
            <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
              This tab is a placeholder for source selection defaults. Sources are primarily chosen per-conversation in
              the chat UI (e.g., Corpora + Recall).
            </div>
          </div>
        );

      case 'Recall':
        return (
          <div className="subtab-panel" style={{ padding: 24 }}>
            <h3 style={{ marginTop: 0 }}>Recall</h3>
            <div className="input-row" style={{ alignItems: 'start' }}>
              <div className="input-group">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={recallAutoIndex === true}
                    onChange={(e) => setRecall({ ...(recall || {}), auto_index: e.target.checked })}
                  />
                  <span className="toggle-track" aria-hidden="true">
                    <span className="toggle-thumb"></span>
                  </span>
                  <span className="toggle-label">
                    Auto-index conversations <TooltipIcon name="chat.recall.auto_index" />
                  </span>
                </label>
              </div>

              <div className="input-group">
                <label>
                  Index delay (seconds) <TooltipIcon name="chat.recall.index_delay_seconds" />
                </label>
                <input
                  type="number"
                  value={recallDelaySeconds}
                  min="1"
                  max="60"
                  step="1"
                  onChange={(e) => setRecall({ ...(recall || {}), index_delay_seconds: Number(e.target.value) })}
                />
                <p className="small">Delay before indexing a new message into Recall memory.</p>
              </div>
            </div>
          </div>
        );

      case 'Multimodal':
        return (
          <div className="subtab-panel" style={{ padding: 24 }}>
            <h3 style={{ marginTop: 0 }}>Multimodal</h3>
            <div className="input-row">
              <div className="input-group">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={visionEnabled === true}
                    onChange={(e) => setMultimodal({ ...(multimodal || {}), vision_enabled: e.target.checked })}
                  />
                  <span className="toggle-track" aria-hidden="true">
                    <span className="toggle-thumb"></span>
                  </span>
                  <span className="toggle-label">
                    Vision enabled <TooltipIcon name="chat.multimodal.vision_enabled" />
                  </span>
                </label>
                <p className="small">Enables image upload + vision model inputs when supported by the selected model.</p>
              </div>
            </div>
          </div>
        );

      case 'Local':
        return (
          <div className="subtab-panel" style={{ padding: 24 }}>
            <h3 style={{ marginTop: 0 }}>Local</h3>
            <div style={{ color: 'var(--fg-muted)', fontSize: 13, marginBottom: 14 }}>
              Configure local OpenAI-compatible provider endpoints (Ollama, llama.cpp, etc).
            </div>
            <ProviderSetup />
          </div>
        );

      case 'OpenRouter':
        return (
          <div className="subtab-panel" style={{ padding: 24 }}>
            <h3 style={{ marginTop: 0 }}>OpenRouter</h3>
            <div style={{ color: 'var(--fg-muted)', fontSize: 13, marginBottom: 14 }}>
              Configure OpenRouter and verify your API key status.
            </div>
            <ProviderSetup />
          </div>
        );

      case 'Benchmark':
        return (
          <div className="subtab-panel" style={{ padding: 24 }}>
            <h3 style={{ marginTop: 0 }}>Benchmark</h3>
            <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
              Split-screen model comparison + pipeline profiling controls live here (coming soon).
            </div>
          </div>
        );

      case 'UI':
        return (
          <div className="subtab-panel" style={{ padding: 24 }}>
            <h3 style={{ marginTop: 0 }}>UI</h3>
            <div className="input-row">
              <div className="input-group">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={chatStreamingEnabled === 1}
                    onChange={(e) => setChatStreamingEnabled(e.target.checked ? 1 : 0)}
                  />
                  <span className="toggle-track" aria-hidden="true">
                    <span className="toggle-thumb"></span>
                  </span>
                  <span className="toggle-label">
                    Streaming responses <TooltipIcon name="ui.chat_streaming_enabled" />
                  </span>
                </label>
                <p className="small">Streams tokens as they’re generated (recommended).</p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  })();

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Chat Settings</h3>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--fg-muted)' }}>
            {loading ? 'Loading…' : saving ? 'Saving…' : config ? 'Ready' : 'No config loaded'}
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 12,
            background: 'rgba(255, 107, 107, 0.1)',
            border: '1px solid var(--err)',
            borderRadius: 10,
            padding: '10px 12px',
            color: 'var(--err)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div className="tab-bar" style={{ marginBottom: 12 }}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={t === activeTab ? 'active' : ''}
            onClick={() => setActiveTab(t)}
            aria-pressed={t === activeTab}
          >
            {t}
          </button>
        ))}
      </div>

      {panel}
    </div>
  );
}

export default ChatSettings2;
