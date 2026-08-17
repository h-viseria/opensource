export function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

export function equal(a, b, msg) {
  if (a !== b) throw new Error(msg || `expected ${b}, got ${a}`);
}

export function match(str, re) {
  if (!re.test(String(str))) throw new Error(`${str} !~ ${re}`);
}

export function throws(fn) {
  let hit = false;
  try {
    fn();
  } catch {
    hit = true;
  }
  if (!hit) throw new Error('expected throw');
}
