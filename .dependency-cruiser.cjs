/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'warn',
      comment: 'Keep cycles visible so layers do not collapse into each other.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-generated-imports',
      severity: 'error',
      comment: 'Runtime code should not depend on generated or build output directories.',
      from: {},
      to: {
        path: '^(dist|coverage|output|node_modules|docs|[.]astro|[.]netlify)(/|$)',
      },
    },
    {
      name: 'no-runtime-to-tests',
      severity: 'error',
      comment: 'Production code should not reach into tests or spec helpers.',
      from: {
        pathNot: '(^tests/|[.](spec|test)[.](js|cjs|mjs|ts|tsx)$)',
      },
      to: {
        path: '(^tests/|[.](spec|test)[.](js|cjs|mjs|ts|tsx)$)',
      },
    },
    {
      name: 'no-site-or-crucible-into-vendor-demo',
      severity: 'error',
      comment: 'The vendored demo should remain isolated from first-party site, function, and Crucible code.',
      from: {
        path: '^(src|scripts|netlify/functions|crucible/src)(/|$)',
      },
      to: {
        path: '^vendor/demo(/|$)',
      },
    },
    {
      name: 'no-vendor-demo-into-first-party-apps',
      severity: 'error',
      comment: 'Vendored demo code should not reach back into first-party site, function, or Crucible sources.',
      from: {
        path: '^vendor/demo/src(/|$)',
      },
      to: {
        path: '^(src|scripts|netlify/functions|crucible/src|demo-overrides)(/|$)',
      },
    },
    {
      name: 'no-functions-to-crucible-ui',
      severity: 'error',
      comment: 'Netlify functions may share engine/types helpers, but not UI code.',
      from: {
        path: '^netlify/functions(/|$)',
      },
      to: {
        path: '^crucible/src/(components|hooks|help|App[.]tsx|main[.]tsx|index[.]css)',
      },
    },
    {
      name: 'no-crucible-ui-to-functions',
      severity: 'error',
      comment: 'Crucible UI should talk to function endpoints, not import function modules.',
      from: {
        path: '^crucible/src/(App[.]tsx|components|hooks|help)(/|$)',
        pathNot: '^crucible/src/components/MathCodeWorkbenchPage[.]tsx$',
      },
      to: {
        path: '^netlify/functions(/|$)',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: ['node_modules'],
    },
    exclude: {
      path: [
        '(^|/)(dist|coverage|output)(/|$)',
        '(^|/)([.]astro|[.]netlify)(/|$)',
        '(^|/)docs(/|$)',
        '[.]d[.]ts$',
        'public/mockServiceWorker[.]js$',
      ],
    },
    includeOnly: [
      '^(src|scripts|netlify/functions|crucible/src|vendor/demo/src|demo-overrides)(/|$)',
    ],
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'],
      mainFields: ['module', 'main', 'types', 'typings'],
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
    detectProcessBuiltinModuleCalls: true,
    skipAnalysisNotInRules: true,
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
}
