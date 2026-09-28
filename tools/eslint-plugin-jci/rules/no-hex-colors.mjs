const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow hex colour literals; colours live in packages/ui/src/tokens/tokens.json' },
    messages: { hex: 'Hex colour "{{value}}" is not allowed. Use a semantic token via @jci/ui.' },
    schema: [],
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === 'string' && HEX.test(node.value)) {
          context.report({ node, messageId: 'hex', data: { value: node.value } });
        }
      },
    };
  },
};
