import { typertPlugin } from '@deepseek-ai/dsh-typert-generator/tsdown'

/**
 * Host half: bundles `src/index.ts` to `lib/index.js` and emits the Typert
 * artifacts (`lib/typert.host.*`, `lib/typert.remote-client.*`) from the
 * service's public TypeScript types.
 */
export default {
  entry: ['src/index.ts'],
  outDir: 'lib',
  clean: false,
  fixedExtension: false,
  plugins: [typertPlugin()],
}
