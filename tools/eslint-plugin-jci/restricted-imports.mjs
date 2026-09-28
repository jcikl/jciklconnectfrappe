/** The only react-native exports app code may use: non-visual platform APIs. */
export const ALLOWED_REACT_NATIVE_IMPORTS = [
  'Platform',
  'Linking',
  'AccessibilityInfo',
  'Keyboard',
  'AppState',
  'Share',
  'Dimensions',
  'useWindowDimensions',
  'I18nManager',
];

export const RESTRICTED_UI_IMPORTS = {
  paths: [
    {
      // Allowlist: every other named import, and default/namespace imports, are reported.
      name: 'react-native',
      allowImportNames: ALLOWED_REACT_NATIVE_IMPORTS,
      message: 'Use components from @jci/ui instead of react-native primitives.',
    },
    { name: 'nativewind', message: 'Styling lives in @jci/ui. Use useTheme() from @jci/ui.' },
    { name: 'react-native-safe-area-context', message: 'Use Screen or layouts from @jci/ui.' },
  ],
  patterns: [
    {
      group: [
        '@tanstack/*',
        'lucide-react-native',
        '@expo/vector-icons',
        '@expo/vector-icons/*',
        'react-native-reanimated',
        'react-native-svg',
        'clsx',
        'tailwind-merge',
        'class-variance-authority',
        '@rn-primitives/*',
        'react-native-web',
        'expo-image',
        'expo-linear-gradient',
        'expo-blur',
        '@expo/ui',
        '@expo/ui/*',
        'expo-glass-effect',
        'expo-symbols',
        'react-native-gesture-handler',
        'react-native-safe-area-context/*',
      ],
      message: 'UI libraries may only be used inside packages/ui. Import from @jci/ui.',
    },
  ],
};
