# Vendored: @deepseek-ai/dsh-typert-protocol

Vendored from `@deepseek-ai/dsh-typert-protocol@0.2.1-rc.2` (MIT): the compiled
`lib/` exactly as shipped on npm, its `LICENSE`, and a manifest that adds the
`./typert` export the workspace typert generator validates.

**Why:** `@deepseek-ai/dsh-typert-generator`'s analyzer accepts `@Remote` /
`TypertRemoteService` symbols only when the declaration's file belongs to a
workspace package named `@deepseek-ai/dsh-typert-protocol`; workspace
registrations come exclusively from project references under `<root>/packages/`.
An npm-installed protocol can never be recognized, so a build-only copy lives
here. `src/index.ts` re-exports the compiled declarations for that recognition.

This package is `private` and never published. Do not import it from plugin
runtime code — the built `lib/` keeps the bare specifier, which resolves to the
DSH installation's own copy at runtime.

## Re-syncing

Bump: copy `<node_modules>/@deepseek-ai/dsh-typert-protocol/lib` over `lib/`,
update `version` here, and note the source version in this file.
