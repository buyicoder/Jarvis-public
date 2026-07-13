import { isAbsolute, relative, resolve } from 'node:path';

export function isPathInside(parent, child, normalize = resolve) {
  const rel = relative(normalize(parent), normalize(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
