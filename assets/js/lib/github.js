/**
 * Repository access.
 *
 * A repository is described by one manifest request to jsDelivr
 * (`/v1/package/gh/owner/repo@branch/flat`) which returns every file in the
 * repository. That single payload powers directory listings, subpath traversal
 * and file type dispatch without any further metadata requests. File bytes are
 * then streamed straight from the CDN.
 */

import { CONFIG } from '../config.js';
import { getJson, getText, readPersistent, writePersistent, HttpError } from './net.js';
import { repoMatches } from './router.js';
import { compareEntries } from './format.js';

const OWNER = CONFIG.owner;

/** Memory cache for the lifetime of a tab, on top of the localStorage cache. */
const manifests = new Map();

export function encodePath(path) {
  return String(path || '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

export function cdnUrl(repo, branch, path = '') {
  const tail = encodePath(path);
  const base = `${CONFIG.sources.cdn}/${encodeURIComponent(OWNER)}/${encodeURIComponent(repo)}@${encodeURIComponent(branch)}`;
  return tail ? `${base}/${tail}` : base;
}

export function rawUrl(repo, branch, path = '') {
  const tail = encodePath(path);
  const base = `${CONFIG.sources.raw}/${encodeURIComponent(OWNER)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}`;
  return tail ? `${base}/${tail}` : base;
}

/**
 * URL of a directory, always with a trailing slash so it can be used as the
 * `href` of a `<base>` element. `encodePath` drops the trailing slash, so it
 * has to be restored here.
 */
export function cdnDirUrl(repo, branch, dir = '') {
  const base = cdnUrl(repo, branch, dir);
  return base.endsWith('/') ? base : `${base}/`;
}

export function rawDirUrl(repo, branch, dir = '') {
  const base = rawUrl(repo, branch, dir);
  return base.endsWith('/') ? base : `${base}/`;
}

/**
 * Human-facing URL on github.com.
 *
 * `kind` has to be stated because GitHub serves files under `/blob/` and
 * directories under `/tree/`: a nested file such as `src/main.js` cannot be
 * told apart from a directory by its shape alone. With no branch the ref is
 * omitted and GitHub resolves the default branch.
 */
export function githubUrl(repo, path = '', branch = '', kind = 'file') {
  const base = `https://github.com/${OWNER}/${repo}`;
  const tail = encodePath(path);
  if (!tail) return branch ? `${base}/tree/${encodeURIComponent(branch)}` : base;

  const ref = branch ? `/${encodeURIComponent(branch)}` : '';
  return kind === 'dir' ? `${base}/tree${ref}/${tail}` : `${base}/blob${ref}/${tail}`;
}

/** Branches to probe, most likely first. */
function candidateBranches(repo) {
  const remembered = readPersistent(`branch:${OWNER}/${repo}`);
  return [...new Set([remembered, ...CONFIG.repoBrowser.branchFallbacks].filter(Boolean))];
}

function buildManifest(repo, branch, data) {
  const files = new Map();
  for (const file of data?.files || []) {
    if (file?.type && file.type !== 'file') continue;
    const path = String(file.name || '').replace(/^\/+/, '');
    if (path) files.set(path, { path, size: file.size ?? 0, hash: file.hash ?? null });
  }
  return { repo, branch, owner: OWNER, files };
}

async function loadBranchManifest(repo, branch) {
  const url = `${CONFIG.sources.manifest}/${OWNER}/${repo}@${branch}/flat`;
  const { data, stale } = await getJson(url, { ttl: CONFIG.cache.manifestTtlMs });
  const manifest = buildManifest(repo, branch, data);
  if (stale) manifest.stale = true;
  return manifest;
}

/** Failures that only mean "this branch is not served here", so probing continues. */
const PROBE_ERRORS = new Set(['not-found', 'network', 'server']);

/**
 * Load the file manifest for a repository, probing branches until one exists.
 * The branch that worked is remembered, so later visits skip the probes.
 * Throws an HttpError with kind `not-found` when the repository is unknown or
 * empty.
 */
export async function getManifest(repo) {
  if (manifests.has(repo)) return manifests.get(repo);

  const branches = candidateBranches(repo);
  let lastError = null;

  for (const branch of branches) {
    try {
      const manifest = await loadBranchManifest(repo, branch);
      writePersistent(`branch:${OWNER}/${repo}`, branch);
      manifests.set(repo, manifest);
      return manifest;
    } catch (error) {
      // A rate limit and a bug both have to surface: reporting them as "no
      // readable content" would send the visitor looking for a missing
      // repository that is right there.
      if (!PROBE_ERRORS.has(error?.kind)) throw error;
      lastError = error;
    }
  }

  throw new HttpError(
    'not-found',
    `No readable content for ${OWNER}/${repo} on ${branches.join(' or ')}. ` +
      'The repository may be empty, renamed or private.',
    { cause: lastError },
  );
}

/**
 * Load exactly one named branch, for the branch picker. Unlike `getManifest`
 * this never falls back to another branch, so a branch that has gone away is
 * reported instead of quietly showing something the visitor did not pick.
 */
export async function selectBranch(repo, branch) {
  const key = `${repo}@${branch}`;
  if (manifests.has(key)) return manifests.get(key);

  const manifest = await loadBranchManifest(repo, branch);
  manifests.set(key, manifest);
  // Also answer the key `getManifest` uses, so the re-render that follows the
  // switch resolves from memory instead of probing again.
  manifests.set(repo, manifest);
  writePersistent(`branch:${OWNER}/${repo}`, branch);
  return manifest;
}

/** Branches per API request; a full page means the list may be longer. */
const BRANCH_PAGE_SIZE = 100;

/**
 * Branch names for a repository, for the branch picker. Only fetched when the
 * picker is opened, and cached like every other API response, because the
 * unauthenticated GitHub API allows 60 requests an hour.
 *
 * `complete` is false when the response filled a whole page, so the caller knows
 * the list may be missing branches.
 */
export async function listBranches(repo) {
  const url = `${CONFIG.sources.api}/repos/${encodeURIComponent(OWNER)}/${encodeURIComponent(repo)}/branches?per_page=${BRANCH_PAGE_SIZE}`;
  const { data, stale } = await getJson(url, { ttl: CONFIG.cache.branchesTtlMs, key: `branches:${OWNER}/${repo}` });

  const names = (Array.isArray(data) ? data : [])
    .map((branch) => (typeof branch === 'string' ? branch : branch?.name))
    .filter((name) => typeof name === 'string' && name);

  return { names, stale: Boolean(stale), complete: names.length < BRANCH_PAGE_SIZE };
}

/** Immediate children of `dir`, directories first. */
export function listDir(manifest, dir = '') {
  const base = dir ? `${dir}/` : '';
  const entries = new Map();

  for (const [path, meta] of manifest.files) {
    if (!path.startsWith(base)) continue;
    const rest = path.slice(base.length);
    if (!rest) continue;

    const slash = rest.indexOf('/');
    if (slash === -1) {
      entries.set(rest, { name: rest, type: 'file', size: meta.size });
    } else {
      const name = rest.slice(0, slash);
      if (!entries.has(name)) entries.set(name, { name, type: 'dir' });
    }
  }

  return [...entries.values()].sort(compareEntries);
}

/**
 * Classify a repository path as a directory, a file, or missing.
 *
 * A directory stays a directory even when it holds an `index.html`: the file is
 * listed alongside its siblings and opened on its own terms, so a repository's
 * structure is never hidden behind a convention.
 */
export function resolvePath(manifest, path = '') {
  const clean = String(path || '').replace(/^\/+|\/+$/g, '');

  if (clean === '') return { kind: 'dir', path: '', entries: listDir(manifest, '') };

  const file = manifest.files.get(clean);
  if (file) return { kind: 'file', path: clean, entry: file };

  const prefix = `${clean}/`;
  for (const path of manifest.files.keys()) {
    if (path.startsWith(prefix)) return { kind: 'dir', path: clean, entries: listDir(manifest, clean) };
  }

  return { kind: 'missing', path: clean };
}

/** Read a file's text, falling back to raw.githubusercontent.com. */
export async function readFile(manifest, path, options = {}) {
  const candidates = [cdnUrl(manifest.repo, manifest.branch, path), rawUrl(manifest.repo, manifest.branch, path)];

  let lastError = null;
  for (const url of candidates) {
    try {
      const result = await getText(url, options);
      return { ...result, url: result.url || url };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Repository list for a mount, either pinned in config or fetched from the
 * GitHub API, restricted to the repositories the mount serves.
 */
export async function listRepos(mount = {}) {
  const pinned = CONFIG.repoBrowser.pinned;
  if (pinned) {
    return pinned
      .filter((repo) => repoMatches(mount, repo.name))
      .map((repo) => ({ name: repo.name, description: repo.description || '', branch: repo.branch || null }));
  }

  const url = `${CONFIG.sources.api}/users/${encodeURIComponent(OWNER)}/repos?per_page=100&sort=updated`;
  const { data, stale } = await getJson(url, { ttl: CONFIG.cache.reposTtlMs, key: `repos:${OWNER}` });
  const repos = Array.isArray(data) ? data : [];

  return repos
    .filter((repo) => CONFIG.repoBrowser.includeForks || !repo.fork)
    .filter((repo) => repoMatches(mount, repo.name))
    .map((repo) => ({
      name: repo.name,
      description: repo.description || '',
      branch: repo.default_branch || null,
      language: repo.language || '',
      updated: repo.pushed_at || repo.updated_at || '',
      size: repo.size || 0,
      homepage: repo.homepage || '',
      archived: Boolean(repo.archived),
    }))
    .map((repo) => (stale ? { ...repo, stale: true } : repo));
}
