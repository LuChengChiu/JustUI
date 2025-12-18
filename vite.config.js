import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, cpSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { build } from 'vite'

// Plugin to bundle content scripts separately
const bundleContentScripts = () => ({
  name: 'bundle-content-scripts',
  async closeBundle() {
    // Bundle content.js with all its module dependencies
    await build({
      configFile: false,
      build: {
        emptyOutDir: false,
        outDir: 'dist/scripts',
        lib: {
          entry: resolve(__dirname, 'src/scripts/content.js'),
          name: 'content',
          formats: ['iife'],
          fileName: () => 'content.js'
        },
        rollupOptions: {
          output: {
            extend: true
          }
        },
        minify: false,
        sourcemap: false
      }
    })

    // Bundle background.js
    await build({
      configFile: false,
      build: {
        emptyOutDir: false,
        outDir: 'dist/scripts',
        lib: {
          entry: resolve(__dirname, 'src/scripts/background.js'),
          name: 'background',
          formats: ['iife'],
          fileName: () => 'background.js'
        },
        rollupOptions: {
          output: {
            extend: true
          }
        },
        minify: false,
        sourcemap: false
      }
    })
  }
})

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-assets',
      closeBundle() {
        copyFileSync('manifest.json', 'dist/manifest.json')
        cpSync('icons', 'dist/icons', { recursive: true })
        cpSync('src/data', 'dist/data', { recursive: true })
        // Copy injected-script.js (runs in page world, doesn't need bundling)
        mkdirSync('dist/scripts', { recursive: true })
        copyFileSync('src/scripts/injected-script.js', 'dist/scripts/injected-script.js')
        copyFileSync('src/scripts/adDetectionEngine.js', 'dist/scripts/adDetectionEngine.js')
      }
    },
    bundleContentScripts()
  ],
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: 'popup.html',
        settings: 'settings.html'
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    }
  }
})