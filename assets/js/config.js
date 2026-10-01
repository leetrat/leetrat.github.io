/**
 * Single source of truth for the whole site.
 *
 * Everything else imports CONFIG instead of hardcoding paths, so a section, a
 * mount or a site can be added, moved or removed without touching the code.
 *
 * Three lists, three jobs:
 *
 *   sections  what the header shows and which page a header link opens
 *   mounts    which URLs the site serves
 *   sites     which repositories those URLs may serve
 *
 * A URL that no section names is still served, it is just not advertised.
 */

export const CONFIG = {
  /** GitHub account whose public repositories are published here. */
  owner: 'leetrat',

  i18n: {
    /**
     * UI language: `null` follows the browser when it is one of the translated
     * languages, and falls back to `fallback` otherwise. Codes must exist in
     * `assets/js/lib/i18n.js`; the header switcher overrides this per browser.
     */
    default: 'ru',
    fallback: 'en',
  },

  /**
   * Sections: the header navigation.
   *
   *   { label: 'Label', href: '/path', view: 'view-name', home: true }
   *
   * `label` is required and may be translated by giving one value per language:
   *
   *   label: { en: 'Label', ru: 'Название' }
   *
   * `href` is any path on this site. It usually points at a mount, in which case
   * the mount decides what renders and `view` can be left out:
   *
   *   { label: 'Sites', href: '/v' }          -> the mount root renders /v
   *
   * Give a section its own `view` and it owns that URL outright, which is how a
   * section carries content of its own instead of repository content:
   *
   *   { label: 'About', href: '/about', view: 'about' }
   *
   * `home: true` additionally renders the section as a card on the home page.
   */
  sections: [
    { label: { en: 'Home', ru: 'Главная' }, href: '/' },
    { label: { en: 'Sites', ru: 'Сайты' }, href: '/v', home: true },
  ],

  /**
   * Mounts: the URLs this site serves.
   *
   *   { prefix: '/v', view: 'sites', subview: 'site', entry: 'index.html' }
   *
   * A mount claims its prefix *and every subpath below it*, so `/v` automatically
   * claims `/v/<repo>` and `/v/<repo>/a/b/c.html`. Longest prefix wins, so mounts
   * can overlap.
   *
   *   prefix   the URL prefix, matched longest first
   *   view     renders the mount root, `/prefix`
   *   subview  renders `/prefix/<repo>` and everything under it
   *   entry    default file for a bare repository; a `sites` entry overrides it
   *
   * Neither field is special: `view` and `subview` are names in the `VIEWS` map
   * in `main.js`. Nothing here reaches the header on its own, see `sections`.
   */
  mounts: [
    { prefix: '/v', view: 'sites', subview: 'site', entry: 'index.html' },
  ],

  /**
   * Sites: the repositories a site mount may serve, and what to serve from them.
   *
   *   {
   *     name: 'itmo-web',
   *     branch: 'main',
   *     entry: 'lab_1/index.html',
   *     title: 'Web programming',
   *     description: 'Coursework, 2026',
   *   }
   *
   *   name        the repository, required
   *   branch      the branch to serve from, required
   *   entry       the file that *is* the site, defaults to the mount's `entry`
   *   title       shown in the list instead of the repository name
   *   description one line under the title
   *
   * `branch` is required rather than probed: a served document has no header, so
   * there is no branch picker to switch with. `?branch=<name>` on any mount URL
   * overrides it for one page and is remembered per browser.
   *
   * The list is checked on load: a repository whose `entry` is missing is left
   * out of `/v`, so the list only ever shows sites that actually answer.
   */
  sites: [
    {
      name: 'itmo-web',
      branch: 'main',
      entry: 'lab_1/index.html',
      title: 'Web programming',
      description: 'Coursework, ITMO, 2026',
    },
  ],

  /**
   * Retired URL prefixes, so links published before a move still land.
   *
   *   retired: [{ from: '/lab', to: '/v' }]
   *
   * `/lab/<repo>/a/b.html` becomes `/v/<repo>/a/b.html`. Nothing is rewritten on
   * disk: the old path is answered with a redirect at runtime, and lands on the
   * same content if the file still exists.
   */
  retired: [
    { from: '/lab', to: '/v' },
  ],

  sources: {
    /** File bytes, served with correct MIME types and `Access-Control-Allow-Origin: *`. */
    cdn: 'https://cdn.jsdelivr.net/gh',
    /** Same bytes, used when the CDN does not have the branch yet. */
    raw: 'https://raw.githubusercontent.com',
  },

  serve: {
    /**
     * Rewrite root relative asset references (`/style.css`) to point at the
     * repository root. Pages that assume they live at the domain root only work
     * with this on; pages that already prefix their paths are unaffected.
     */
    rewriteRootRelative: true,
  },

  cache: {
    /** The "does this repository have a site" check, which is one request each. */
    sitesTtlMs: 60 * 60_000,
  },

  limits: {
    /** Files larger than this are shown as a link instead of being rendered. */
    textPreviewBytes: 256 * 1024,
  },
};

/**
 * Catch configuration mistakes at boot rather than on the first click: a header
 * link that dead ends, or two things claiming one URL, are both invisible until
 * they are validated.
 */
export function validateConfig(config = CONFIG) {
  const problem = (message) => {
    throw new Error(`[leetrat] bad configuration: ${message}`);
  };

  // Sections and mounts live in the same URL space, but a section is allowed to
  // point at a mount — that is how a mount gets a header link. So each list is
  // checked for duplicates against itself, and the overlap is checked here.
  const sectionHrefs = new Map();
  const mountPrefixes = new Map();

  config.sections.forEach((section, index) => {
    if (!section.href) problem(`sections[${index}] has no href`);
    if (!section.label) problem(`sections[${index}] has no label`);
    const href = normalize(section.href);
    if (sectionHrefs.has(href)) problem(`sections[${index}] repeats "${section.href}", already used by ${sectionHrefs.get(href)}`);
    sectionHrefs.set(href, `sections[${index}]`);
  });

  config.mounts.forEach((mount, index) => {
    if (!mount.prefix) problem(`mounts[${index}] has no prefix`);
    if (!mount.view) problem(`mounts[${index}] has no view`);
    if (!mount.subview) problem(`mounts[${index}] has no subview`);
    const prefix = normalize(mount.prefix);
    if (mountPrefixes.has(prefix)) problem(`mounts[${index}] repeats "${mount.prefix}", already used by ${mountPrefixes.get(prefix)}`);
    mountPrefixes.set(prefix, `mounts[${index}]`);
  });

  config.sections.forEach((section, index) => {
    const href = normalize(section.href);

    // A section that renders a view of its own cannot also sit on a mount's
    // prefix: two things would own one URL and only one would ever be reached.
    const mount = mountPrefixes.get(href);
    if (mount && section.view) {
      problem(`sections[${index}] ("${section.href}") declares its own view, but ${mount} already serves that path`);
    }

    // Otherwise a header link has to land somewhere: on its own view, on a
    // mount, or on the home page, which every site serves. Anything else goes
    // nowhere, and the failure would not show up until the link was clicked.
    if (!section.view && href !== '/' && !mount) {
      problem(`sections[${index}] ("${section.href}") has no view, and no mount serves that path`);
    }
  });

  const names = new Set();
  config.sites.forEach((site, index) => {
    if (!site.name) problem(`sites[${index}] has no name`);
    if (!site.branch) problem(`sites[${index}] ("${site.name}") has no branch`);
    if (names.has(site.name)) problem(`sites[${index}] repeats "${site.name}"`);
    names.add(site.name);
  });
}

/** Leading slash, no trailing slash, duplicate slashes collapsed. */
function normalize(href) {
  const segments = String(href || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  return `/${segments.join('/')}`;
}