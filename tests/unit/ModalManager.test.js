/**
 * Unit Tests for ModalManager Module
 * Tests modal creation, user interaction handling, and cleanup lifecycle
 */

// Mock the React modal component before importing ModalManager
jest.mock('@/components/external-link-modal.jsx', () => ({
  showExternalLinkModal: jest.fn().mockResolvedValue(true)
}));

import { ModalManager } from '@modules/navigation-guardian/modal-manager.js';
import { showExternalLinkModal } from '@/components/external-link-modal.jsx';

// Mock DOM environment
const mockDOM = {
  createElement: jest.fn((tagName) => ({
    tagName: tagName.toUpperCase(),
    textContent: '',
    style: { cssText: '' },
    setAttribute: jest.fn(),
    appendChild: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    remove: jest.fn(),
    querySelector: jest.fn(),
    parentNode: { removeChild: jest.fn() }
  })),
  body: {
    appendChild: jest.fn(),
    removeChild: jest.fn()
  },
  head: {
    appendChild: jest.fn(),
    removeChild: jest.fn()
  },
  getElementById: jest.fn()
};

global.document = mockDOM;

// Mock MAX_Z_INDEX constant
jest.mock('../../src/scripts/constants.js', () => ({
  MAX_Z_INDEX: 2147483647
}));

// Note: ICleanable mock removed - ModalManager no longer extends CleanableModule

describe('ModalManager', () => {
  let modalManager;
  let mockStatisticsCallback;
  let mockURLValidator;

  beforeEach(() => {
    modalManager = new ModalManager();
    mockStatisticsCallback = jest.fn();
    mockURLValidator = jest.fn(url => url); // Default: return URL unchanged

    // Reset React modal mock to default behavior
    showExternalLinkModal.mockClear();
    showExternalLinkModal.mockResolvedValue(true);

    // Clear mock calls
    Object.values(mockDOM).forEach(mock => {
      if (typeof mock.mockClear === 'function') {
        mock.mockClear();
      }
    });
    mockStatisticsCallback.mockClear();
    mockURLValidator.mockClear();
  });

  describe('Initialization', () => {
    test('should initialize with default values', () => {
      expect(modalManager.activeModal).toBeNull();
      expect(modalManager.statisticsCallback).toBeNull();
      expect(modalManager.urlValidator).toBeNull();
    });
  });

  describe('Callback Management', () => {
    test('should set statistics callback', () => {
      modalManager.setStatisticsCallback(mockStatisticsCallback);
      expect(modalManager.statisticsCallback).toBe(mockStatisticsCallback);
    });

    test('should set URL validator callback', () => {
      modalManager.setURLValidator(mockURLValidator);
      expect(modalManager.urlValidator).toBe(mockURLValidator);
    });

    test('should handle null callbacks gracefully', () => {
      modalManager.setStatisticsCallback(null);
      modalManager.setURLValidator(null);
      
      expect(modalManager.statisticsCallback).toBeNull();
      expect(modalManager.urlValidator).toBeNull();
    });
  });

  describe('Safe Element Creation', () => {
    test('should create basic elements', () => {
      const element = modalManager.createSafeElement('div');
      
      expect(mockDOM.createElement).toHaveBeenCalledWith('div');
      expect(element.tagName).toBe('DIV');
    });

    test('should set text content safely', () => {
      const maliciousText = '<script>alert(\\"xss\\")</script>Safe text';
      const element = modalManager.createSafeElement('div', {
        textContent: maliciousText
      });
      
      expect(element.textContent).toBe(maliciousText);
      // Should not use innerHTML for XSS safety
      expect(element.innerHTML).toBeUndefined();
    });

    test('should apply CSS styles safely', () => {
      const element = modalManager.createSafeElement('div', {
        style: 'color: red; font-size: 14px;'
      });
      
      expect(element.style.cssText).toBe('color: red; font-size: 14px;');
    });

    test('should set attributes correctly', () => {
      const element = modalManager.createSafeElement('button', {
        attributes: { 
          id: 'test-button',
          'data-action': 'allow'
        }
      });
      
      expect(element.setAttribute).toHaveBeenCalledWith('id', 'test-button');
      expect(element.setAttribute).toHaveBeenCalledWith('data-action', 'allow');
    });

    test('should append children correctly', () => {
      const child1 = mockDOM.createElement('span');
      const child2 = mockDOM.createElement('strong');
      
      const element = modalManager.createSafeElement('div', {
        children: [child1, child2]
      });
      
      expect(element.appendChild).toHaveBeenCalledWith(child1);
      expect(element.appendChild).toHaveBeenCalledWith(child2);
    });

    test('should handle null children gracefully', () => {
      const child1 = mockDOM.createElement('span');
      
      const element = modalManager.createSafeElement('div', {
        children: [child1, null, undefined]
      });
      
      expect(element.appendChild).toHaveBeenCalledWith(child1);
      expect(element.appendChild).toHaveBeenCalledTimes(1);
    });
  });

  describe('Modal Display', () => {
    beforeEach(() => {
      modalManager.setStatisticsCallback(mockStatisticsCallback);
      modalManager.setURLValidator(mockURLValidator);
    });

    test('should prevent duplicate modals', async () => {
      modalManager.activeModal = mockDOM.createElement('div');
      
      const result = await modalManager.showConfirmationModal({
        url: 'https://example.com'
      });
      
      expect(result).toBe(false); // Should deny by default for safety
    });

    test('should validate URL using callback', async () => {
      mockURLValidator.mockReturnValue('Validated URL');
      
      // Mock user clicking "deny" quickly to resolve promise
      setTimeout(() => {
        // Simulate modal creation and immediate denial
        modalManager.activeModal = null;
      }, 10);
      
      modalManager.showConfirmationModal({
        url: 'https://example.com'
      });
      
      expect(mockURLValidator).toHaveBeenCalledWith('https://example.com');
    });

    test('should handle URL validator errors gracefully', async () => {
      modalManager.setURLValidator(() => {
        throw new Error('Validator error');
      });

      const result = await modalManager.showConfirmationModal({
        url: 'https://example.com'
      });

      // Should continue execution despite validator error and use original URL
      expect(showExternalLinkModal).toHaveBeenCalledWith({
        url: 'https://example.com',
        threatDetails: null
      });
      expect(result).toBe(true);
    });

    test('should create modal with threat details', async () => {
      const threatDetails = {
        riskScore: 8,
        threats: [
          { type: 'Known malicious domain', score: 8 }
        ],
        isPopUnder: true
      };

      await modalManager.showConfirmationModal({
        url: 'https://malicious.com',
        threatDetails
      });

      // Should pass threat details to React modal
      expect(showExternalLinkModal).toHaveBeenCalledWith({
        url: 'https://malicious.com',
        threatDetails
      });
    });

    test('should handle statistics callback errors', async () => {
      mockStatisticsCallback.mockImplementation(() => {
        throw new Error('Statistics error');
      });
      
      // Mock the modal interaction flow
      const modalPromise = modalManager.showConfirmationModal({
        url: 'https://example.com'
      });
      
      // Simulate user clicking allow
      setTimeout(() => {
        if (modalManager.statisticsCallback) {
          try {
            modalManager.statisticsCallback(true);
          } catch (error) {
            // Error should be caught and logged
          }
        }
        modalManager.activeModal = null;
      }, 10);
      
      await modalPromise;
      
      expect(mockStatisticsCallback).toHaveBeenCalledWith(true);
    });
  });

  describe('Legacy Method Support', () => {
    test('should support legacy showNavigationModal method', async () => {
      const mockCallback = jest.fn();
      
      // Mock Promise.resolve for the confirmation modal
      modalManager.showConfirmationModal = jest.fn().mockResolvedValue(true);
      
      await modalManager.showNavigationModal(
        'https://example.com',
        mockCallback,
        { riskScore: 5 }
      );
      
      expect(modalManager.showConfirmationModal).toHaveBeenCalledWith({
        url: 'https://example.com',
        threatDetails: { riskScore: 5 }
      });
      expect(mockCallback).toHaveBeenCalledWith(true);
    });

    test('should handle legacy callback errors', async () => {
      const mockCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });
      
      modalManager.showConfirmationModal = jest.fn().mockResolvedValue(false);
      
      await modalManager.showNavigationModal('https://example.com', mockCallback);
      
      expect(mockCallback).toHaveBeenCalledWith(false);
      // Error should be caught and logged, not thrown
    });

    test('should handle legacy modal errors with callback', async () => {
      const mockCallback = jest.fn();

      modalManager.showConfirmationModal = jest.fn().mockRejectedValue(new Error('Modal error'));

      modalManager.showNavigationModal('https://example.com', mockCallback);

      // Wait for promise chain to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCallback).toHaveBeenCalledWith(false);
    });
  });

  describe('Cleanup Management', () => {
    test('should cleanup active modal config', async () => {
      const mockConfig = { url: 'https://example.com', threatDetails: null };
      modalManager.activeModal = mockConfig;

      modalManager.cleanup();

      expect(modalManager.activeModal).toBeNull();
    });

    test('should clear callbacks during cleanup', async () => {
      modalManager.setStatisticsCallback(mockStatisticsCallback);
      modalManager.setURLValidator(mockURLValidator);

      modalManager.cleanup();

      expect(modalManager.statisticsCallback).toBeNull();
      expect(modalManager.urlValidator).toBeNull();
    });

    test('should handle cleanup errors gracefully', async () => {
      // Set active modal config
      modalManager.activeModal = { url: 'test' };

      // Cleanup should succeed
      expect(() => modalManager.cleanup()).not.toThrow();
      expect(modalManager.activeModal).toBeNull();
    });
  });

  // Modal Content Building tests removed - ModalManager now uses React modals
  // instead of building DOM elements directly

  describe('Performance', () => {
    test('should create elements efficiently', () => {
      const start = performance.now();
      
      for (let i = 0; i < 100; i++) {
        modalManager.createSafeElement('div', {
          textContent: `Element ${i}`,
          style: 'color: red;',
          attributes: { 'data-id': i }
        });
      }
      
      const end = performance.now();
      
      // Should create 100 elements quickly
      expect(end - start).toBeLessThan(100); // 100ms limit
    });

    test('should handle multiple callback registrations', () => {
      const callbacks = Array.from({ length: 10 }, () => jest.fn());
      
      callbacks.forEach(callback => {
        modalManager.setStatisticsCallback(callback);
      });
      
      // Last callback should win
      expect(modalManager.statisticsCallback).toBe(callbacks[9]);
    });
  });

  describe('React Integration', () => {
    test('should use React modal when available', async () => {
      modalManager.setStatisticsCallback(mockStatisticsCallback);
      modalManager.setURLValidator(mockURLValidator);

      const result = await modalManager.showConfirmationModal({
        url: 'https://example.com',
        threatDetails: { riskScore: 5 }
      });

      expect(result).toBe(true);
      expect(mockStatisticsCallback).toHaveBeenCalledWith(true);
    });

    test('should handle React modal errors gracefully', async () => {
      showExternalLinkModal.mockRejectedValueOnce(new Error('Modal error'));

      const result = await modalManager.showConfirmationModal({
        url: 'https://example.com'
      });

      expect(result).toBe(false);
    });

    test('should pass correct config to React modal', async () => {
      modalManager.setURLValidator((url) => `validated-${url}`);

      const threatDetails = {
        riskScore: 6,
        threats: [{ type: 'Test threat', score: 6 }],
        isPopUnder: true
      };

      await modalManager.showConfirmationModal({
        url: 'https://example.com',
        threatDetails
      });

      expect(showExternalLinkModal).toHaveBeenCalledWith({
        url: 'validated-https://example.com',
        threatDetails
      });
    });

    test('should manage activeModal flag correctly with React', async () => {
      expect(modalManager.activeModal).toBeNull();

      const modalPromise = modalManager.showConfirmationModal({
        url: 'https://example.com'
      });

      // activeModal should be set to config object during modal display
      expect(modalManager.activeModal).toBeTruthy();
      expect(modalManager.activeModal).toHaveProperty('url', 'https://example.com');
      expect(modalManager.activeModal).toHaveProperty('threatDetails', null);

      await modalPromise;

      // activeModal should be cleared after modal closes
      expect(modalManager.activeModal).toBeNull();
    });

    test('should handle statistics callback errors in React modal', async () => {
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error('Statistics error');
      });
      modalManager.setStatisticsCallback(errorCallback);

      // Should not throw error
      await expect(modalManager.showConfirmationModal({
        url: 'https://example.com'
      })).resolves.toBe(true);

      expect(errorCallback).toHaveBeenCalledWith(true);
    });

    test('should clear activeModal flag on modal error', async () => {
      showExternalLinkModal.mockRejectedValueOnce(new Error('Modal failed'));

      expect(modalManager.activeModal).toBeNull();

      await modalManager.showConfirmationModal({
        url: 'https://example.com'
      });

      expect(modalManager.activeModal).toBeNull();
    });

    test('should preserve URL validation in React modal path', async () => {
      modalManager.setURLValidator((url) => 'Safe URL');

      await modalManager.showConfirmationModal({
        url: 'https://dangerous-site.com'
      });

      expect(showExternalLinkModal).toHaveBeenCalledWith({
        url: 'Safe URL',
        threatDetails: null
      });
    });
  });

  describe('Error Boundary', () => {
    test('should handle createElement errors', () => {
      mockDOM.createElement.mockImplementation(() => {
        throw new Error('DOM error');
      });
      
      expect(() => {
        modalManager.createSafeElement('div');
      }).toThrow('DOM error');
    });

    test('should handle style application errors', () => {
      const mockElement = {
        tagName: 'DIV',
        textContent: '',
        style: {
          set cssText(value) {
            throw new Error('Style error');
          }
        },
        setAttribute: jest.fn(),
        appendChild: jest.fn()
      };
      
      mockDOM.createElement.mockReturnValue(mockElement);
      
      expect(() => {
        modalManager.createSafeElement('div', {
          style: 'color: red;'
        });
      }).toThrow('Style error');
    });
  });
});
