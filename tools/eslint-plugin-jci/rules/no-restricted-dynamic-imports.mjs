import { RESTRICTED_UI_IMPORTS } from '../restricted-imports.mjs';

const escape = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/** Glob in the style of no-restricted-imports `group`: `*` spans one path segment; a match also covers deeper subpaths. */
const toRegExp = (glob) => new RegExp(`^${escape(glob).replace(/\*/g, '[^/]*')}(?:/.*)?$`);

const EXACT = new Map(RESTRICTED_UI_IMPORTS.paths.map((p) => [p.name, p.message]));
const PATTERNS = RESTRICTED_UI_IMPORTS.patterns.flatMap((p) => p.group.map((g) => ({ re: toRegExp(g), message: p.message })));

function staticSource(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

/**
 * Reports dynamic `import()` of modules restricted for app code. A dynamic import yields the whole module
 * namespace, so allowlisted names (e.g. react-native's Platform) do not make it acceptable.
 */
/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow dynamic import() of UI modules restricted to packages/ui' },
    messages: { restricted: 'Dynamic import of "{{name}}" is not allowed in app code. {{message}}' },
    schema: [],
  },
  create(context) {
    return {
      ImportExpression(node) {
        const name = staticSource(node.source);
        if (name === null) return;
        const message = EXACT.get(name) ?? PATTERNS.find((p) => p.re.test(name))?.message;
        if (message) context.report({ node, messageId: 'restricted', data: { name, message } });
      },
    };
  },
};
