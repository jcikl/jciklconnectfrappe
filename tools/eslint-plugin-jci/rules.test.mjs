import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import noHexColors from './rules/no-hex-colors.mjs';
import noRawStyling from './rules/no-raw-styling.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

tester.run('no-raw-styling', noRawStyling, {
  valid: [{ code: '<Button label="Save" onPress={save} variant="primary" />' }],
  invalid: [
    { code: '<View className="p-4" />', errors: [{ messageId: 'raw' }] },
    { code: '<View style={{ padding: 4 }} />', errors: [{ messageId: 'raw' }] },
    { code: '<List contentContainerStyle={{ gap: 4 }} />', errors: [{ messageId: 'raw' }] },
  ],
});

tester.run('no-hex-colors', noHexColors, {
  valid: [{ code: "const anchor = '#heading';" }, { code: "const id = 'abc123';" }, { code: "const tag = '#12';" }],
  invalid: [
    { code: "const c = '#1B3A6B';", errors: [{ messageId: 'hex' }] },
    { code: "const c = '#fff';", errors: [{ messageId: 'hex' }] },
    { code: "const c = '#1B3A6BFF';", errors: [{ messageId: 'hex' }] },
    { code: '<Icon color="#000000" />', errors: [{ messageId: 'hex' }] },
  ],
});
