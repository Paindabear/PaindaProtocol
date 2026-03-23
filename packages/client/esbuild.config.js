import { build } from "esbuild";

// ESM bundle — for <script type="module"> and modern bundlers
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "esm",
  outfile: "dist/index.browser.js",
  platform: "browser",
  target: ["es2022", "chrome90", "firefox90", "safari14"],
  minify: false,
  sourcemap: true,
  // Mark React as external — only needed if using usePP hook
  external: ["react"],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

// Minified CDN bundle
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "iife",
  globalName: "PP",
  outfile: "dist/index.browser.min.js",
  platform: "browser",
  target: ["es2022", "chrome90", "firefox90", "safari14"],
  minify: true,
  sourcemap: true,
  external: ["react"],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

console.log("Browser bundles built: dist/index.browser.js, dist/index.browser.min.js");
