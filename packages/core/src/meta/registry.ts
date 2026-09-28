import { MetaError } from '../errors';
import type { DocTypeMeta } from './types';

export interface Registry {
  get(name: string): DocTypeMeta;
  has(name: string): boolean;
  all(): readonly DocTypeMeta[];
}

export function createRegistry(metas: readonly DocTypeMeta[]): Registry {
  const map = new Map<string, DocTypeMeta>();
  for (const m of metas) {
    if (map.has(m.name)) throw new MetaError(`Duplicate DocType "${m.name}"`);
    map.set(m.name, m);
  }
  for (const m of metas) {
    for (const f of m.fields) {
      if (f.fieldtype === 'Link' && !map.has(f.link!)) {
        throw new MetaError(`${m.name}.${f.fieldname}: links to unknown DocType "${f.link}"`);
      }
      if (f.fieldtype === 'Table') {
        const child = map.get(f.childDocType!);
        if (!child) throw new MetaError(`${m.name}.${f.fieldname}: unknown DocType "${f.childDocType}"`);
        if (!child.isChild) throw new MetaError(`${m.name}.${f.fieldname}: "${child.name}" is not a child DocType`);
      }
    }
  }
  return {
    get(name) {
      const m = map.get(name);
      if (!m) throw new MetaError(`Unknown DocType "${name}"`);
      return m;
    },
    has: (name) => map.has(name),
    all: () => [...map.values()],
  };
}
