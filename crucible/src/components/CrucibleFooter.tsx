type FooterLink = {
  label: string
  href: string
  external?: boolean
}

type FooterLinkGroup = {
  title: string
  links: FooterLink[]
}

const LINK_GROUPS: FooterLinkGroup[] = [
  {
    title: 'ragweld surfaces',
    links: [
      { label: 'ragweld main site', href: 'https://ragweld.com/', external: true },
      { label: 'workbench demo', href: 'https://ragweld.com/demo/', external: true },
      { label: 'crucible estimator', href: 'https://ragweld.com/crucible/', external: true },
      { label: 'github org repo', href: 'https://github.com/DMontgomery40/ragweld', external: true },
    ],
  },
  {
    title: 'glossary + blog',
    links: [
      { label: 'parameter glossary', href: 'https://ragweld.com/glossary/', external: true },
      { label: 'raw knobs view', href: 'https://ragweld.com/knobs/raw/', external: true },
      { label: 'deepseek mHC glossary term', href: 'https://ragweld.com/glossary/deepseek-mhc-mode/', external: true },
      { label: 'deepseek KV cache glossary term', href: 'https://ragweld.com/glossary/deepseek-kv-cache-strategy/', external: true },
      { label: 'ragweld blog', href: 'https://ragweld.com/blog/', external: true },
      { label: 'latest reranker post', href: 'https://ragweld.com/blog/posts/learning-reranker-qwen3-mlx/', external: true },
    ],
  },
  {
    title: 'engineering references',
    links: [
      { label: 'configuration docs', href: 'https://dmontgomery40.github.io/ragweld/latest/configuration/', external: true },
      { label: 'api docs', href: 'https://dmontgomery40.github.io/ragweld/latest/api/', external: true },
      { label: 'mcp docs', href: 'https://dmontgomery40.github.io/ragweld/latest/integrations/mcp/', external: true },
      { label: 'math code workbench', href: '/crucible/math-code' },
      { label: 'api health endpoint', href: '/crucible/api/v1/health' },
      { label: 'contact form', href: '#contact-form' },
      { label: 'bug report form', href: '#bug-report-form' },
      { label: 'open issue on github', href: 'https://github.com/DMontgomery40/ragweld.com/issues/new', external: true },
    ],
  },
]

export function CrucibleFooter() {
  return (
    <footer className="card app-footer">
      <div className="footer-intro">
        <h2>Links, support, and issue reporting</h2>
        <p>
          Built for direct operator workflows. If you need help with estimates, bad math assumptions, provider drift,
          or broken pricing inputs, use one of the forms below or file a public issue.
        </p>
      </div>

      <div className="footer-grid">
        <section className="footer-link-grid" aria-label="Resource links">
          {LINK_GROUPS.map((group) => (
            <article className="footer-link-group" key={group.title}>
              <h3>{group.title}</h3>
              <ul>
                {group.links.map((link) => (
                  <li key={`${group.title}-${link.label}`}>
                    <a
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noopener noreferrer' : undefined}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="footer-form-grid" aria-label="Contact and issue forms">
          <article id="contact-form" className="footer-form-card">
            <h3>Contact</h3>
            <p>Questions about on-prem deployment paths, training assumptions, or pricing signals.</p>
            <form
              name="crucible-contact"
              method="POST"
              data-netlify="true"
              netlify-honeypot="bot-field"
              action="/crucible/?form=crucible-contact"
              className="footer-form"
            >
              <input type="hidden" name="form-name" value="crucible-contact" />
              <input type="hidden" name="bot-field" />
              <label>
                Name
                <input type="text" name="name" required />
              </label>
              <label>
                Email
                <input type="email" name="email" required />
              </label>
              <label>
                Message
                <textarea name="message" rows={4} required />
              </label>
              <button type="submit">Send contact request</button>
            </form>
          </article>

          <article id="bug-report-form" className="footer-form-card">
            <h3>Report issue or bug</h3>
            <p>Use this form for incorrect estimates, broken charts, bad links, or endpoint regressions.</p>
            <form
              name="crucible-issues"
              method="POST"
              data-netlify="true"
              netlify-honeypot="bot-field"
              action="/crucible/?form=crucible-issues"
              className="footer-form"
            >
              <input type="hidden" name="form-name" value="crucible-issues" />
              <input type="hidden" name="bot-field" />
              <label>
                Name
                <input type="text" name="name" required />
              </label>
              <label>
                Email
                <input type="email" name="email" required />
              </label>
              <label>
                Severity
                <select name="severity" defaultValue="medium">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
              <label>
                Issue details
                <textarea name="details" rows={4} required />
              </label>
              <button type="submit">Submit bug report</button>
            </form>
          </article>
        </section>
      </div>

      <p className="footer-note">
        Netlify form submissions are enabled for these forms. Delivery inbox is managed in the Netlify site form
        notifications panel.
      </p>
    </footer>
  )
}
