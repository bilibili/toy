/**
 * Browser half: a self-contained CJS closure handed to
 * `window.__ModuleLoader__.load`, with the loader's `require` answering only
 * the seeded module-table baseline. Everything else the client source reaches
 * — the generated `./remote` face and its Zod codecs — is bundled here.
 */
const BASELINE = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-runtime/client',
])

const isRequested = (specifier: string): boolean => BASELINE.has(specifier) || specifier.startsWith('@bilibili/dsh-toy/')
  ? BASELINE.has(specifier)
  : false

export default {
  name: '@bilibili/dsh-toy/client',
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: isRequested,
    // Anything the loader's module table cannot answer must inline; the
    // generated `./remote` contribution and Zod are the reason.
    alwaysBundle: (specifier: string) => !isRequested(specifier),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "@bilibili/dsh-toy", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}
