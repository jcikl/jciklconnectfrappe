import noHexColors from './rules/no-hex-colors.mjs';
import noRawStyling from './rules/no-raw-styling.mjs';
import noRestrictedDynamicImports from './rules/no-restricted-dynamic-imports.mjs';

export default {
  meta: { name: 'eslint-plugin-jci' },
  rules: {
    'no-raw-styling': noRawStyling,
    'no-hex-colors': noHexColors,
    'no-restricted-dynamic-imports': noRestrictedDynamicImports,
  },
};
