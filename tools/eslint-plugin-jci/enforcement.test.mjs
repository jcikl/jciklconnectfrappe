import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const eslint = new ESLint({ cwd: root });

async function ruleIds(relPath, code) {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, relPath) });
  return result.messages.map((m) => m.ruleId);
}

const APP_FILE = 'apps/app/app/__fixture__.tsx';

describe('UI enforcement in app code', { timeout: 30000 }, () => {
  it('blocks react-native primitives', async () => {
    const ids = await ruleIds(APP_FILE, "import { View } from 'react-native';\nexport default function F() { return <View />; }\n");
    expect(ids).toContain('no-restricted-imports');
  });

  it('blocks UI libraries and nativewind', async () => {
    expect(await ruleIds(APP_FILE, "import { Home } from 'lucide-react-native';\nexport const x = Home;\n")).toContain('no-restricted-imports');
    expect(await ruleIds(APP_FILE, "import { useColorScheme } from 'nativewind';\nexport const x = useColorScheme;\n")).toContain('no-restricted-imports');
  });

  it('blocks className/style props', async () => {
    const ids = await ruleIds(APP_FILE, "import { Box } from '@jci/ui';\nexport default function F() { return <Box className=\"p-4\" />; }\n");
    expect(ids).toContain('jci/no-raw-styling');
  });

  it('blocks hex colours', async () => {
    expect(await ruleIds(APP_FILE, "export const brand = '#1B3A6B';\n")).toContain('jci/no-hex-colors');
  });

  it('allows composing @jci/ui', async () => {
    const code = "import { Button } from '@jci/ui';\nexport default function F() { return <Button label=\"Go\" onPress={() => {}} />; }\n";
    expect(await ruleIds(APP_FILE, code)).toEqual([]);
  });

  it('allows primitives and className inside packages/ui', async () => {
    const code = "import { View } from 'react-native';\nexport function P() { return <View className=\"p-4\" />; }\n";
    expect(await ruleIds('packages/ui/src/primitives/__fixture__.tsx', code)).toEqual([]);
  });

  it('still blocks hex colours inside packages/ui source', async () => {
    expect(await ruleIds('packages/ui/src/components/__fixture__.tsx', "export const c = '#FFFFFF';\n")).toContain('jci/no-hex-colors');
  });
});
