/**
 * Single source of truth for the whole site.
 *
 * Everything else imports CONFIG instead of hardcoding paths, so the loader
 * can be re-pointed or re-used without touching the rest of the code.
 */

export const CONFIG = {
  /** GitHub account whose public repositories are published here. */
  owner: 'leetrat',

  /**
   * Mount points claimed by the repo browser.
   *
   *   { prefix: '/lab', view: 'repo-browser', label: 'Lab' }
   *
   * A mount owns its prefix *and every subpath below it*, so `/lab`
   * automatically claims `/lab/<repo>` and `/lab/<repo>/a/b/c.html`.
   * Longest prefix wins when two mounts overlap.
   *
   * Optional per-mount fields:
   *   repoPrefix  only repositories whose name starts with this string are
   *               listed *or* servable from the mount. Requests for anything
   *               else fall through to the "not found" view.
   *   unlisted    serve the mount but keep it out of the header nav and the
   *               home page, so it is reachable only by URL.
   */
  mounts: [
    { prefix: '/lab', view: 'repo-browser', label: 'itrmo', repoPrefix: 'itmo-', unlisted: true },
    // { prefix: '/drafts', view: 'repo-browser', label: 'Drafts', unlisted: true },
  ],

  repoBrowser: {
    /**
     * Curated repository list, or null to ask the GitHub API for every public
     * repository. Pinning a list removes the API dependency entirely:
     *
     *   pinned: [
     *     { name: 'leetrat.github.io', branch: 'main', description: 'This site' },
     *   ]
     */
    pinned: null,
    includeForks: false,
    /** Probed in order when neither the API nor a pinned entry names a branch. */
    branchFallbacks: ['main', 'master'],
  },

  sources: {
    /** Recursive file listing for a repository: one request serves every subpath. */
    manifest: 'https://data.jsdelivr.com/v1/package/gh',
    /** File bytes, served with correct MIME types and `Access-Control-Allow-Origin: *`. */
    cdn: 'https://cdn.jsdelivr.net/gh',
    /** Same bytes, used when jsDelivr has not picked up the branch yet. */
    raw: 'https://raw.githubusercontent.com',
    /** Only used when `repoBrowser.pinned` is null. Unauthenticated: 60 req/h. */
    api: 'https://api.github.com',
  },

  preview: {
    /**
     * Sandbox flags for the iframe a repository's HTML is rendered inside.
     * Without `allow-same-origin` the page gets an opaque origin, which keeps
     * it away from this site's DOM/storage but breaks localStorage inside the
     * repository's own code.
     */
    sandbox: 'allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-same-origin',
    /** Minimum/maximum rendered height of the preview iframe, in pixels. */
    minHeight: 420,
    maxHeight: 4000,
    /**
     * Rewrite root relative asset references (`/style.css`) to point at the
     * repository root. Pages that assume they live at the domain root only
     * work with this on; pages that already prefix paths are unaffected.
     */
    rewriteRootRelative: true,
  },

  cache: {
    manifestTtlMs: 15 * 60_000,
    reposTtlMs: 10 * 60_000,
    branchTtlMs: 30 * 24 * 60 * 60_000,
  },

  limits: {
    /** Files larger than this are shown as a link instead of inline text. */
    textPreviewBytes: 256 * 1024,
  },
};
