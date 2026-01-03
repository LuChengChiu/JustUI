import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, cpSync, mkdirSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { build } from "vite";

const alias = {
  "@": resolve(__dirname, "src"),
  "@test": resolve(__dirname, "test"),
  "@modules": resolve(__dirname, "src/scripts/modules"),
  "@utils": resolve(__dirname, "src/utils"),
  "@script-utils": resolve(__dirname, "src/scripts/utils"),
};

// Plugin to bundle content scripts separately
const bundleContentScripts = (mode) => ({
  name: "bundle-content-scripts",
  async closeBundle() {
    const isProduction = mode === "production";

    // Bundle content.js with all its module dependencies
    await build({
      configFile: false,
      define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
        'process.env': JSON.stringify({ NODE_ENV: process.env.NODE_ENV || 'production' }),
        'global': 'globalThis'
      },
      esbuild: {
        jsxFactory: 'React.createElement',
        jsxFragment: 'React.Fragment',
      },
      resolve: {
        alias,
      },
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
                drop_console: false, // Keep console for debugging - extension context
                drop_debugger: true, // Remove debugger statements
                // Don't mark console.* as pure functions to prevent aggressive tree-shaking
              },
            }
          : undefined,
      },
    });

    // Bundle background.js
    await build({
      configFile: false,
      define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
        'process.env': JSON.stringify({ NODE_ENV: process.env.NODE_ENV || 'production' }),
        'global': 'globalThis'
      },
      resolve: {
        alias,
      },
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
          external: [
            // Note: @eyeo/abp2dnr is NOT external - it must be bundled for browser use
            /^node:/,
            'https',
            'fs',
            'fs/promises',
            'path'
          ],
          output: {
            extend: true,
          },
        },
        minify: isProduction ? "terser" : false,
        sourcemap: !isProduction,
        terserOptions: isProduction
          ? {
              compress: {
                drop_console: false, // Keep console for debugging - extension context
                drop_debugger: true,
                // Don't mark console.* as pure functions to prevent aggressive tree-shaking
              },
            }
          : undefined,
      },
    });

    // Bundle injected-script.js with MaliciousPatternDetector
    await build({
      configFile: false,
      define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
        'process.env': JSON.stringify({ NODE_ENV: process.env.NODE_ENV || 'production' }),
        'global': 'globalThis'
      },
      resolve: {
        alias,
      },
      build: {
        emptyOutDir: false,
        outDir: "dist/scripts",
        lib: {
          entry: resolve(__dirname, "src/scripts/injected-script.js"),
          name: "injectedScript",
          formats: ["iife"],
          fileName: () => "injected-script.js",
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
                drop_console: false, // Keep console for debugging
                drop_debugger: true,
              },
            }
          : undefined,
      },
    });

    // Validate manifest.json after all builds are complete
    const manifestPath = "dist/manifest.json";
    if (!existsSync(manifestPath)) {
      console.error("❌ Build failed: manifest.json not found in dist/");
      process.exit(1);
    }

    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const requiredFiles = [];

    // Check background service worker
    if (manifest.background?.service_worker) {
      requiredFiles.push(manifest.background.service_worker);
    }

    // Check content scripts
    if (manifest.content_scripts) {
      manifest.content_scripts.forEach(script => {
        if (script.js) {
          requiredFiles.push(...script.js);
        }
      });
    }

    // Check web accessible resources
    if (manifest.web_accessible_resources) {
      manifest.web_accessible_resources.forEach(resource => {
        if (resource.resources) {
          requiredFiles.push(...resource.resources);
        }
      });
    }

    // Check icons
    if (manifest.icons) {
      Object.values(manifest.icons).forEach(iconPath => {
        requiredFiles.push(iconPath);
      });
    }

    // Check declarative_net_request rulesets
    if (manifest.declarative_net_request?.rule_resources) {
      manifest.declarative_net_request.rule_resources.forEach(rule => {
        if (rule.path) {
          requiredFiles.push(rule.path);
        }
      });
    }

    // Validate all files exist
    const missingFiles = [];
    requiredFiles.forEach(file => {
      const filePath = `dist/${file}`;
      if (!existsSync(filePath)) {
        missingFiles.push(file);
      }
    });

    if (missingFiles.length > 0) {
      console.error("❌ Build validation failed! Missing files referenced in manifest.json:");
      missingFiles.forEach(file => console.error(`   - ${file}`));
      process.exit(1);
    }

    console.log("✅ Manifest validation passed - all referenced files exist");
  },
});

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: "copy-assets",
      closeBundle() {
        copyFileSync("src/manifest.json", "dist/manifest.json");
        cpSync("icons", "dist/icons", { recursive: true });
        cpSync("fonts", "dist/fonts", { recursive: true });
        cpSync("src/data", "dist/data", { recursive: true });
        // Copy network-blocking data (static rulesets) to match manifest path
        cpSync("src/scripts/modules/network-blocking/data", "dist/network-blocking/data", { recursive: true });
        // Note: injected-script.js is now bundled by bundleContentScripts plugin
        mkdirSync("dist/scripts", { recursive: true });
      },
    },
    bundleContentScripts(mode),
  ],
  base: "./",
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    'process.env': JSON.stringify({ NODE_ENV: process.env.NODE_ENV || 'production' }),
    'global': 'globalThis'
  },
  resolve: {
    alias,
  },
  esbuild: {
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
  },
  build: {
    outDir: "dist",
    minify: mode === "production" ? "terser" : false,
    sourcemap: mode !== "production",
    terserOptions:
      mode === "production"
        ? {
            compress: {
              drop_console: false, // Keep console for debugging - extension context
              drop_debugger: true, // Remove debugger statements
              // Don't mark console.* as pure functions to prevent aggressive tree-shaking
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
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: (assetInfo) => {
          // Force CSS files to be named index.css to match manifest.json and shadow-dom.js expectations
          if (assetInfo.name?.endsWith('.css')) {
            return 'index.css';
          }
          return '[name].[ext]';
        },
      },
    },
  },
}));
