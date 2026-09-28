import noHexColors from './rules/no-hex-colors.mjs';
import noRawStyling from './rules/no-raw-styling.mjs';

export default {
  meta: { name: 'eslint-plugin-jci' },
  rules: { 'no-raw-styling': noRawStyling, 'no-hex-colors': noHexColors },
};
