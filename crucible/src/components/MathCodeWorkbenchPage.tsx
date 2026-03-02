import { useMemo } from 'react'
import estimateFunctionSource from '../../../netlify/functions/estimate.ts?raw'
import trainingSource from '../engine/training.ts?raw'
import costSource from '../engine/cost.ts?raw'
import vramSource from '../engine/vram.ts?raw'
import gpuSpecsSource from '../engine/gpu-specs.ts?raw'
import modelsSource from '../engine/models.ts?raw'
import { CrucibleFooter } from './CrucibleFooter'

type CodeSection = {
  id: string
  title: string
  subtitle: string
  filePath: string
  code: string
}

// Files shown on /math-code. We import raw source so operators can audit exact implementation.
const CODE_SECTIONS: CodeSection[] = [
  {
    id: 'estimate-function',
    title: 'Request Orchestration',
    subtitle: 'How Crucible validates inputs and computes response payloads in Netlify Functions.',
    filePath: 'crucible/netlify/functions/estimate.ts',
    code: estimateFunctionSource,
  },
  {
    id: 'training-engine',
    title: 'Training Time + FLOP Math',
    subtitle: 'Core workload math for token passes, throughput, epochs, and completion time.',
    filePath: 'crucible/src/engine/training.ts',
    code: trainingSource,
  },
  {
    id: 'cost-engine',
    title: 'Cost Aggregation Logic',
    subtitle: 'How wall-clock, GPU counts, regions, and pricing tiers turn into expected spend.',
    filePath: 'crucible/src/engine/cost.ts',
    code: costSource,
  },
  {
    id: 'vram-engine',
    title: 'VRAM Budget Logic',
    subtitle: 'Memory estimation for model params, optimizer states, activations, and overhead.',
    filePath: 'crucible/src/engine/vram.ts',
    code: vramSource,
  },
  {
    id: 'gpu-specs',
    title: 'GPU Capability Catalog',
    subtitle: 'Hardware assumptions used to model throughput and memory constraints.',
    filePath: 'crucible/src/engine/gpu-specs.ts',
    code: gpuSpecsSource,
  },
  {
    id: 'model-catalog',
    title: 'Model Catalog + Shapes',
    subtitle: 'Model defaults and architecture metadata consumed by the estimator.',
    filePath: 'crucible/src/engine/models.ts',
    code: modelsSource,
  },
]

const KEYWORD_PATTERN =
  /\b(?:as|async|await|break|case|catch|class|const|continue|default|else|enum|export|extends|false|finally|for|from|function|if|import|in|instanceof|interface|let|new|null|return|switch|throw|true|try|type|typeof|undefined|var|void|while)\b/g
const TYPE_PATTERN =
  /\b(?:Array|Boolean|Date|Error|Map|Math|Number|Object|Promise|Record|RegExp|Set|String|unknown|never|readonly)\b/g
const NUMBER_PATTERN = /\b(\d+(?:_\d+)*(?:\.\d+)?)\b/g
const COMMENT_PATTERN = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g
const STRING_PATTERN = /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function highlightTypeScript(code: string): string {
  const placeholders: string[] = []
  const createPlaceholder = (className: 'comment' | 'string', raw: string): string => {
    const token = `@@TOKEN_${placeholders.length}@@`
    placeholders.push(`<span class="tok-${className}">${escapeHtml(raw)}</span>`)
    return token
  }

  let prepared = code
    // Extract comments/strings before keyword regexes so we do not syntax-highlight inside literals.
    .replace(COMMENT_PATTERN, (match) => createPlaceholder('comment', match))
    .replace(STRING_PATTERN, (match) => createPlaceholder('string', match))

  prepared = escapeHtml(prepared)
  prepared = prepared.replace(KEYWORD_PATTERN, '<span class="tok-keyword">$&</span>')
  prepared = prepared.replace(TYPE_PATTERN, '<span class="tok-type">$&</span>')
  prepared = prepared.replace(NUMBER_PATTERN, '<span class="tok-number">$1</span>')
  prepared = prepared.replace(/@@TOKEN_(\d+)@@/g, (_, index) => placeholders[Number(index)] ?? '')

  return prepared
}

function MonacoCodeBlock({ code }: { code: string }) {
  // Memoize highlighting so collapsible toggles do not re-tokenize unchanged code blocks.
  const lines = useMemo(() => highlightTypeScript(code).split('\n'), [code])

  return (
    <div className="monaco-frame">
      <div className="monaco-toolbar">
        <span className="monaco-dot red" />
        <span className="monaco-dot amber" />
        <span className="monaco-dot green" />
        <span className="monaco-toolbar-label">TypeScript</span>
      </div>
      <pre className="monaco-body">
        <code>
          {lines.map((line, index) => (
            <span className="code-line" key={`line-${index + 1}`}>
              <span className="code-gutter">{index + 1}</span>
              <span
                className="code-content"
                dangerouslySetInnerHTML={{ __html: line.length > 0 ? line : '&nbsp;' }}
              />
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}

export function MathCodeWorkbenchPage() {
  // Allow this component to work both on / and /crucible deployments.
  const routePrefix =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/crucible') ? '/crucible' : ''
  const estimatorHref = `${routePrefix}/`

  return (
    <div className="app-shell math-workbench-page">
      <header className="card app-header">
        <div className="brand-wrap">
          <p className="brand-kicker">ragweld engineering tools</p>
          <h1>crucible</h1>
          <p className="tagline">Math and cost engine source in one operator-friendly view.</p>
        </div>

        <div className="header-right">
          <a className="header-callout" href="https://ragweld.com/" target="_blank" rel="noopener noreferrer">
            and for when you need everything on prem and local, check out our mlops engineering surface and
            workbench.
          </a>
          <div className="header-actions">
            <a className="ghost-link-button" href={estimatorHref}>
              Back to estimator
            </a>
            <a
              className="ghost-link-button"
              href="https://github.com/DMontgomery40/ragweld.com/tree/main/crucible"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open source tree
            </a>
          </div>
        </div>
      </header>

      <main className="math-workbench-layout">
        <section className="card math-workbench-intro">
          <h2>Math code workbench</h2>
          <p>
            This route exposes the key estimator logic so teams can audit assumptions and compare implementation details
            before running expensive training jobs. Each section below is collapsible and includes the full source file
            in Monaco-like syntax highlighting.
          </p>
        </section>

        <section className="math-code-sections">
          {CODE_SECTIONS.map((section, index) => (
            <details className="card code-collapsible" key={section.id} open={index === 0}>
              <summary className="code-summary">
                <span className="code-summary-title">{section.title}</span>
                <span className="code-summary-subtitle">{section.subtitle}</span>
                <span className="code-summary-path mono">{section.filePath}</span>
              </summary>
              <MonacoCodeBlock code={section.code} />
            </details>
          ))}
        </section>
      </main>

      <CrucibleFooter />
    </div>
  )
}
