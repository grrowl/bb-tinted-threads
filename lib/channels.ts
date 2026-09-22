/**
 * Realtime channel names shared by server.ts and the sidebar hooks.
 *
 * Kept out of server.ts on purpose: the browser bundle must not import
 * server.ts for a value, or the server-side `@get-bb/plugin-sdk` import
 * comes along with it and managed (git/npm) installs, which skip
 * devDependencies, fail to resolve it.
 */

/** Realtime channel the sidebar re-reads its manual order on. */
export const MANUAL_ORDER_CHANNEL = "manual-order";
/** Realtime channel the sidebar re-reads its collapsed set on. */
export const COLLAPSED_THREADS_CHANNEL = "collapsed-threads";
