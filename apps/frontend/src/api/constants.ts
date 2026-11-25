/**
 * targetId of a combined daily summary (all channels/projects of a connector for one day).
 * Mirrors COMBINED_TARGET_ID in @kuros/shared, which the browser can't import at runtime:
 * stale compiled .js files committed under packages/shared/src shadow the .ts sources in Vite.
 */
export const COMBINED_TARGET_ID = '_all';
