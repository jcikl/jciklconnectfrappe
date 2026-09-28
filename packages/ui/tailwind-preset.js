const tokens = require('./src/tokens/tokens.json');

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

// Each semantic colour becomes `name` (light) and `name-dark`, used as `bg-surface dark:bg-surface-dark`.
const semantic = Object.fromEntries(
  Object.keys(tokens.semantic.light).map((k) => [kebab(k), { DEFAULT: tokens.semantic.light[k], dark: tokens.semantic.dark[k] }]),
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: { navy: tokens.palette.navy, gold: tokens.palette.gold, ...semantic },
      borderRadius: tokens.radius,
    },
  },
};
