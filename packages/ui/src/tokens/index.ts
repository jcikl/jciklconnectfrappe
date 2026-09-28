import tokens from './tokens.json';

export type SemanticColor = keyof typeof tokens.semantic.light;
export { contrastRatio, luminance } from './contrast';
export { tokens };
