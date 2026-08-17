/**
 * Hash-based client-side router.
 * Routes: #/path or #/path?query=1
 */

import { emit } from './eventBus.js';
import { APP_NAME, EVENTS } from './constants.js';

/** @typedef {{ path: string, title: string, render: (ctx: RouteContext) => Promise<void>|void }} RouteDef */
/** @typedef {{ path: string, params: Record<string, string>, query: Record<string, string>, route: RouteDef }} RouteContext */

/** @type {Map<string, RouteDef>} */
const routes = new Map();

/** @type {RouteDef | null} */
let notFoundRoute = null;

/** @type {HTMLElement | null} */
let outlet = null;

/** @type {((ctx: RouteContext) => boolean|Promise<boolean>) | null} */
let beforeNavigate = null;

/**
 * @param {string} path
 * @param {Omit<RouteDef, 'path'>} def
 */
export function register(path, def) {
  routes.set(normalizePath(path), { ...def, path: normalizePath(path) });
}

/**
 * @param {Omit<RouteDef, 'path'>} def
 */
export function registerNotFound(def) {
  notFoundRoute = { ...def, path: '/404' };
}

/**
 * @param {HTMLElement} el
 */
export function setOutlet(el) {
  outlet = el;
}

/**
 * @param {(ctx: RouteContext) => boolean|Promise<boolean>} fn
 */
export function setBeforeNavigate(fn) {
  beforeNavigate = fn;
}

/**
 * @param {string} path
 * @param {{ replace?: boolean }} [opts]
 */
export function navigate(path, opts = {}) {
  const hash = `#${normalizePath(path)}`;
  if (opts.replace) location.replace(hash);
  else location.hash = hash;
}

export function getLocation() {
  return parseHash(location.hash);
}

export function start() {
  window.addEventListener('hashchange', handleChange);
  if (!location.hash || location.hash === '#') {
    navigate('/home', { replace: true });
  } else {
    handleChange();
  }
}

export function stop() {
  window.removeEventListener('hashchange', handleChange);
}

async function handleChange() {
  const { path, query } = parseHash(location.hash);
  const match = matchRoute(path);

  if (!match) {
    if (notFoundRoute && outlet) {
      const ctx = { path, params: {}, query, route: notFoundRoute };
      document.title = `${notFoundRoute.title} — ${APP_NAME}`;
      await notFoundRoute.render(ctx);
      emit(EVENTS.ROUTE_CHANGE, ctx);
    }
    return;
  }

  const { route, params } = match;
  /** @type {RouteContext} */
  const ctx = { path, params, query, route };

  if (beforeNavigate) {
    const ok = await beforeNavigate(ctx);
    if (!ok) return;
  }

  document.title = `${route.title} — ${APP_NAME}`;

  if (outlet) {
    outlet.innerHTML = '';
    await route.render(ctx);
  }

  emit(EVENTS.ROUTE_CHANGE, ctx);
}

/**
 * @param {string} path
 */
function matchRoute(path) {
  const normalized = normalizePath(path);
  if (routes.has(normalized)) {
    return { route: routes.get(normalized), params: {} };
  }
  for (const [pattern, route] of routes) {
    const params = matchPattern(pattern, normalized);
    if (params) return { route, params };
  }
  return null;
}

/**
 * @param {string} pattern
 * @param {string} path
 */
function matchPattern(pattern, path) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  /** @type {Record<string, string>} */
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i];
    const vp = pathParts[i];
    if (pp.startsWith(':')) params[pp.slice(1)] = decodeURIComponent(vp);
    else if (pp !== vp) return null;
  }
  return params;
}

/**
 * @param {string} hash
 */
function parseHash(hash) {
  const raw = (hash || '#/').replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = normalizePath(pathPart);
  /** @type {Record<string, string>} */
  const query = {};
  if (queryPart) {
    for (const pair of queryPart.split('&')) {
      const [k, v = ''] = pair.split('=');
      if (k) query[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }
  return { path, query };
}

function normalizePath(path) {
  let p = path.startsWith('/') ? path : `/${path}`;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

export function listRoutes() {
  return [...routes.values()];
}
