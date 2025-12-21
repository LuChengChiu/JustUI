import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, cpSync, mkdirSync } from "fs";
import { resolve } from "path";
import { build } from "vite";

// Plugin to bundle content scripts separately
const bundleContentScripts = (mode) => ({
  name: "bundle-content-scripts",
  async closeBundle() {
    const isProduction = mode === "production";

    // Bundle content.js with all its module dependencies
    await build({
      configFile: false,
      build: {
        emptyOutDir: false,
        outDir: "dist/scripts",
        lib: {
          entry: resolve(__dirname, "src/scripts/content.js"),
          name: "content",
          formats: ["iife"],
          fileName: () => "content.js",
        },
        rollupOptions: {
          output: {
            extend: true,
          },
        },
        minify: isProduction ? "terser" : false,
        sourcemap: !isProduction,
        terserOptions: isProduction
          ? {
              compress: {
                drop_console: true, // Remove all console.* calls
                drop_debugger: true, // Remove debugger statements
                pure_funcs: ["console.log", "console.info", "console.debug"], // Extra safety
              },
            }
          : undefined,
      },
    });

    // Bundle background.js
    await build({
      configFile: false,
      build: {
        emptyOutDir: false,
        outDir: "dist/scripts",
        lib: {
          entry: resolve(__dirname, "src/scripts/background.js"),
          name: "background",
          formats: ["iife"],
          fileName: () => "background.js",
        },
        rollupOptions: {
          output: {
            extend: true,
          },
        },
        minify: isProduction ? "terser" : false,
        sourcemap: !isProduction,
        terserOptions: isProduction
          ? {
              compress: {
                drop_console: true,
                drop_debugger: true,
                pure_funcs: ["console.log", "console.info", "console.debug"],
              },
            }
          : undefined,
      },
    });
  },
});

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: "copy-assets",
      closeBundle() {
        copyFileSync("manifest.json", "dist/manifest.json");
        cpSync("icons", "dist/icons", { recursive: true });
        cpSync("src/data", "dist/data", { recursive: true });
        // Copy injected-script.js (runs in page world, doesn't need bundling)
        mkdirSync("dist/scripts", { recursive: true });
        copyFileSync(
          "src/scripts/injected-script.js",
          "dist/scripts/injected-script.js"
        );
      },
    },
    bundleContentScripts(mode),
  ],
  base: "./",
  build: {
    outDir: "dist",
    minify: mode === "production" ? "terser" : false,
    sourcemap: mode !== "production",
    terserOptions:
      mode === "production"
        ? {
            compress: {
              drop_console: true, // Remove all console.* calls in production
              drop_debugger: true, // Remove debugger statements
              pure_funcs: ["console.log", "console.info", "console.debug"], // Extra safety
            },
            format: {
              comments: false, // Remove comments in production
            },
          }
        : undefined,
    rollupOptions: {
      input: {
        popup: "popup.html",
        settings: "settings.html",
        "settings-beta": "settings-beta.html",
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
}));
