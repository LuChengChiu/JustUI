/**
 * Vitest setup file
 * Global mocks and setup for tests
 */

import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock Chrome Extension APIs globally
global.chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn()
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  },
  runtime: {
    lastError: null,
    id: 'test-extension-id',
    getURL: vi.fn((path) => `chrome-extension://test-extension-id/${path}`)
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn()
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: {
      addListener: vi.fn()
    }
  }
};

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  chrome.runtime.lastError = null;
});
