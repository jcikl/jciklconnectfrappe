// Bundles each Netlify Function in netlify/functions into netlify/dist, which is the
// directory netlify.toml points Netlify at.
//
// Why: Netlify bundles v2 functions (default export + `config.path`) with NFT and ignores
// `node_bundler`. NFT runs esbuild on the entry with `packages: 'external'`, so the imports of
// @jci/core and @jci/doctypes stay bare and resolve at runtime to their raw TypeScript source
// ("Unknown file extension .ts"). Here the workspace packages are bundled in, while every
// other package (firebase-admin, ...) stays external for Netlify to trace and ship.
import { build, type Plugin } from 'esbuild';
import { readdirSync, rmSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const SRC_DIR = 'netlify/functions';
const OUT_DIR = 'netlify/dist';
const WORKSPACE_SCOPE = '@jci/';

const externalizeNonWorkspacePackages: Plugin = {
  name: 'externalize-non-workspace-packages',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.kind === 'entry-point' || isAbsolute(args.path) || args.path.startsWith(WORKSPACE_SCOPE)) return undefined;
      return { path: args.path, external: true };
    });
  },
};

// Only top-level files are functions; `_shared/` holds modules they import.
const entryPoints = readdirSync(SRC_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.m?ts$/.test(entry.name))
  .map((entry) => join(SRC_DIR, entry.name));

rmSync(OUT_DIR, { recursive: true, force: true });

await build({
  entryPoints,
  outdir: OUT_DIR,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  logLevel: 'info',
  plugins: [externalizeNonWorkspacePackages],
});
