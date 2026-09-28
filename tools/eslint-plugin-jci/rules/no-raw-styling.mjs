const BANNED = new Set(['className', 'style', 'contentContainerStyle', 'contentContainerClassName']);

function propertyName(prop) {
  if (prop.computed) return null;
  if (prop.key.type === 'Identifier') return prop.key.name;
  if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') return prop.key.value;
  return null;
}

/** Banned keys in an object literal, following nested object-literal spreads. */
function bannedKeys(obj) {
  const found = [];
  for (const prop of obj.properties) {
    if (prop.type === 'Property') {
      const name = propertyName(prop);
      if (name !== null && BANNED.has(name)) found.push({ node: prop, name });
    } else if (prop.type === 'SpreadElement' && prop.argument.type === 'ObjectExpression') {
      found.push(...bannedKeys(prop.argument));
    }
  }
  return found;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow raw styling props outside @jci/ui' },
    messages: {
      raw: 'Do not pass "{{name}}" in app code. Use @jci/ui component props (variant, size, tone) or add a component to packages/ui.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type === 'JSXIdentifier' && BANNED.has(node.name.name)) {
          context.report({ node, messageId: 'raw', data: { name: node.name.name } });
        }
      },
      JSXSpreadAttribute(node) {
        if (node.argument.type !== 'ObjectExpression') return;
        for (const { node: prop, name } of bannedKeys(node.argument)) {
          context.report({ node: prop, messageId: 'raw', data: { name } });
        }
      },
    };
  },
};
