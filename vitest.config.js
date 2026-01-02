/**
 * Vitest Configuration for OriginalUI Chrome Extension
 * Optimized for testing Chrome extension modules with proper mocking
 */

import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  build: {
    rollupOptions: {
      external: [],
      output: {
        format: 'es',
        preserveModules: false
      }
    }
  },
  test: {
    // Environment setup
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    
    // Global test configuration
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    
    // Transform configuration for unicode handling
    transformMode: {
      ssr: ['**/*.{js,ts}']
    },
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'test/**',
        '**/*.config.{js,ts}',
        '**/*.d.ts',
        'src/data/**', // Exclude data files
        'src/scripts/injected-script.js' // Exclude injected script (runs in different context)
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70
        },
        // Higher thresholds for critical modules
        'src/scripts/modules/ICleanable.js': {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85
        },
        'src/scripts/utils/chrome-api-safe.js': {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    
    // File patterns
    include: [
      'test/**/*.{test,spec}.{js,jsx,ts,tsx}',
      'tests/**/*.{test,spec}.{js,jsx,ts,tsx}',
      'src/**/*.{test,spec}.{js,jsx,ts,tsx}'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/e2e/**',
      'tests/visual/**'
    ],
    
    // Test timeout
    testTimeout: 10000,
    
    // Pool configuration for better performance
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true
      }
    },
    
    // Reporter configuration
    reporter: ['verbose', 'json', 'html'],
    outputFile: {
      json: './test-results/results.json',
      html: './test-results/index.html'
    },
    
    // Watch configuration
    watch: {
      ignore: ['dist/**', 'node_modules/**', 'test-results/**']
    },
    
    // Browser-like globals for Chrome extension testing
    define: {
      global: 'globalThis'
    }
  },
  
  // Resolve configuration
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@test': resolve(__dirname, 'test'),
      '@tests': resolve(__dirname, 'tests'),
      '@modules': resolve(__dirname, 'src/scripts/modules'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@script-utils': resolve(__dirname, 'src/scripts/utils')
    }
  },
  
  // Use custom transform to avoid unicode parsing issues
  plugins: [
    react(),
    {
      name: 'unicode-bypass',
      transform(code, id) {
        if (id.includes('.test.js') || id.includes('SecurityValidator')) {
          // Skip problematic transformations for test files
          return null;
        }
      }
    }
  ]
})
