const BANNED = new Set(['className', 'style', 'contentContainerStyle', 'contentContainerClassName']);

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
    };
  },
};
