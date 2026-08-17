/**
 * Hash-based client-side router.
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

/** @param {Omit<RouteDef, 'path'>} def */
export function registerNotFound(def) {
  notFoundRoute = { ...def, path: '/404' };
}

/** @param {HTMLElement} el */
export function setOutlet(el) {
  outlet = el;
}

/** @param {(ctx: RouteContext) => boolean|Promise<boolean>} fn */
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
  if (!location.hash || location.hash === '#') navigate('/home', { replace: true });
  else handleChange();
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

function matchRoute(path) {
  const normalized = normalizePath(path);
  if (routes.has(normalized)) return { route: routes.get(normalized), params: {} };
  for (const [pattern, route] of routes) {
    const params = matchPattern(pattern, normalized);
    if (params) return { route, params };
  }
  return null;
}

function matchPattern(pattern, path) {
  const pp = pattern.split('/').filter(Boolean);
  const sp = path.split('/').filter(Boolean);
  if (pp.length !== sp.length) return null;
  /** @type {Record<string, string>} */
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(sp[i]);
    else if (pp[i] !== sp[i]) return null;
  }
  return params;
}

function normalizePath(path) {
  let p = String(path || '/');
  if (p.startsWith('#')) p = p.slice(1);
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

function parseHash(hash) {
  const raw = (hash || '#/').replace(/^#/, '') || '/';
  const [pathPart, qs] = raw.split('?');
  /** @type {Record<string, string>} */
  const query = {};
  if (qs) {
    for (const [k, v] of new URLSearchParams(qs)) query[k] = v;
  }
  return { path: normalizePath(pathPart), query };
}
