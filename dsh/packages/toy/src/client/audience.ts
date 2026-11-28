/**
 * Who the panel is currently serving.
 *
 * The CLI has no read-only permission probe, so a signed-in account with no
 * published Toy is treated as a visitor; publishing still resolves the real
 * permission through the CLI and its permission-required classification.
 */

export type Audience = 'unknown' | 'anonymous' | 'visitor' | 'creator'
