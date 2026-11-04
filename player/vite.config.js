import { defineConfig } from "vite";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  base: "./",
  publicDir: "public",
  build: {
    outDir: "../site/player",
    emptyOutDir: true,
    lib: {
      entry: resolve(root, "src/jjazzlab-player.js"),
      formats: ["es"],
      fileName: () => "jjazzlab-player.js"
    }
  },
  plugins: [{
    name: "copy-spessasynth-worklet",
    closeBundle() {
      const output = resolve(root, "../site/player");
      mkdirSync(output, { recursive: true });
      copyFileSync(
        resolve(root, "node_modules/spessasynth_lib/dist/spessasynth_processor.min.js"),
        resolve(output, "spessasynth_processor.min.js")
      );
    }
  }]
});
