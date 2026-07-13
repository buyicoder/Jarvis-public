import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export function canonicalPath(path) {
  let existing = resolve(path);
  const suffix = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break;
    suffix.unshift(existing.slice(parent.length + (parent.endsWith('/') ? 0 : 1)));
    existing = parent;
  }
  const root = existsSync(existing) ? realpathSync.native(existing) : existing;
  return suffix.reduce((current, part) => join(current, part), root);
}

export function isPathInside(parent, child, normalize = resolve) {
  const rel = relative(normalize(parent), normalize(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function isPathInsideCanonical(parent, child) {
  return isPathInside(parent, child, canonicalPath);
}
