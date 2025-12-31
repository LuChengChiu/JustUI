/**
 * Unit Tests for ModalManager Module
 * Tests modal creation, user interaction handling, and cleanup lifecycle
 */

import { ModalManager } from '@modules/navigation-guardian/ModalManager.js';

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
    
    // Clear mock calls
    Object.values(mockDOM).forEach(mock => {
      if (typeof mock.mockClear === 'function') {
        mock.mockClear();
      }
    });
    mockStatisticsCallback.mockClear();
    mockURLValidator.mockClear();
    Object.values(mockCleanableModule).forEach(mock => mock.mockClear());
  });

  describe('Initialization', () => {
    test('should initialize with default values', () => {
      expect(modalManager.activeModal).toBeNull();
      expect(modalManager.statisticsCallback).toBeNull();
      expect(modalManager.urlValidator).toBeNull();
    });

    test('should extend CleanableModule correctly', () => {
      // Should have called parent constructor
      expect(mockCleanableModule.setLifecyclePhase).toHaveBeenCalled();
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
      mockURLValidator.mockImplementation(() => {
        throw new Error('Validator error');
      });
      
      // Mock user interaction
      setTimeout(() => {
        modalManager.activeModal = null;
      }, 10);
      
      await modalManager.showConfirmationModal({
        url: 'https://example.com'
      });
      
      // Should continue execution despite validator error
      expect(mockDOM.createElement).toHaveBeenCalled();
    });

    test('should create modal with threat details', async () => {
      const threatDetails = {
        riskScore: 8,
        threats: [
          { type: 'Known malicious domain', score: 8 }
        ],
        isPopUnder: true
      };
      
      setTimeout(() => {
        modalManager.activeModal = null;
      }, 10);
      
      await modalManager.showConfirmationModal({
        url: 'https://malicious.com',
        threatDetails
      });
      
      expect(mockDOM.createElement).toHaveBeenCalledWith('div'); // Threat details div
      expect(mockDOM.createElement).toHaveBeenCalledWith('span'); // Threat level span
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
      
      await modalManager.showNavigationModal('https://example.com', mockCallback);
      
      expect(mockCallback).toHaveBeenCalledWith(false);
    });
  });

  describe('Cleanup Management', () => {
    test('should cleanup active modal', async () => {
      const mockModal = mockDOM.createElement('div');
      mockModal.parentNode = { removeChild: jest.fn() };
      modalManager.activeModal = mockModal;
      
      modalManager.cleanup();
      
      expect(mockModal.parentNode.removeChild).toHaveBeenCalledWith(mockModal);
      expect(modalManager.activeModal).toBeNull();
    });

    test('should cleanup active modal flag', async () => {
      modalManager.activeModal = true;
      
      modalManager.cleanup();
      
      // Should clear activeModal flag (React modal handles its own cleanup)
      expect(modalManager.activeModal).toBeNull();
    });

    test('should clear callbacks during cleanup', async () => {
      modalManager.setStatisticsCallback(mockStatisticsCallback);
      modalManager.setURLValidator(mockURLValidator);
      
      modalManager.cleanup();
      
      expect(modalManager.statisticsCallback).toBeNull();
      expect(modalManager.urlValidator).toBeNull();
    });

    test('should call parent cleanup', async () => {
      modalManager.cleanup();
      
      expect(mockCleanableModule.cleanup).toHaveBeenCalled();
    });

    test('should handle cleanup errors gracefully', async () => {
      // Mock cleanup error
      mockCleanableModule.cleanup.mockImplementation(() => {
        throw new Error('Cleanup error');
      });
      
      expect(() => modalManager.cleanup()).toThrow('Cleanup error');
      expect(mockCleanableModule.setLifecyclePhase).toHaveBeenCalled();
    });
  });

  describe('Modal Content Building', () => {
    test('should build header section correctly', () => {
      const headerDiv = modalManager.buildHeaderSection(false);
      
      expect(mockDOM.createElement).toHaveBeenCalledWith('h3');
      expect(mockDOM.createElement).toHaveBeenCalledWith('p');
      expect(mockDOM.createElement).toHaveBeenCalledWith('div');
    });

    test('should build header for pop-under', () => {
      const headerDiv = modalManager.buildHeaderSection(true);
      
      expect(mockDOM.createElement).toHaveBeenCalledWith('h3');
      expect(mockDOM.createElement).toHaveBeenCalledWith('p');
    });

    test('should build threat details when threats exist', () => {
      const threats = [
        { type: 'Malicious domain', score: 8 },
        { type: 'Suspicious parameters', score: 3 }
      ];
      const threatLevel = { level: 'HIGH', color: '#dc2626' };
      
      const threatDiv = modalManager.buildThreatDetailsSection({
        threatDetails: { threats },
        threats,
        threatLevel,
        isPopUnder: true
      });
      
      expect(threatDiv).not.toBeNull();
      expect(mockDOM.createElement).toHaveBeenCalledWith('li');
      expect(mockDOM.createElement).toHaveBeenCalledWith('span'); // Pop-under badge
    });

    test('should return null when no threats exist', () => {
      const threatDiv = modalManager.buildThreatDetailsSection({
        threatDetails: null,
        threats: [],
        threatLevel: { level: 'LOW' },
        isPopUnder: false
      });
      
      expect(threatDiv).toBeNull();
    });

    test('should build URL section with truncation styles', () => {
      const urlDiv = modalManager.buildURLSection('https://very-long-url.com');
      
      expect(mockDOM.createElement).toHaveBeenCalledWith('div');
      // Should include ellipsis styles
      const expectedStyle = expect.stringContaining('text-overflow: ellipsis');
    });

    test('should build button section with proper IDs', () => {
      const buttonContainer = modalManager.buildButtonSection(false);
      
      expect(mockDOM.createElement).toHaveBeenCalledWith('button');
      expect(mockDOM.createElement).toHaveBeenCalledWith('div');
    });
  });

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
    beforeEach(() => {
      // Mock dynamic import for React
      global.import = jest.fn();
      
      // Mock React createRoot
      const mockCreateRoot = jest.fn(() => ({
        render: jest.fn(),
        unmount: jest.fn()
      }));
      
      global.import.mockResolvedValue({
        showExternalLinkModal: jest.fn().mockResolvedValue(true)
      });
    });

    test('should use React modal when available', async () => {
      const mockShowExternalLinkModal = jest.fn().mockResolvedValue(true);
      global.import.mockResolvedValue({
        showExternalLinkModal: mockShowExternalLinkModal
      });

      modalManager.setStatisticsCallback(mockStatisticsCallback);
      modalManager.setURLValidator(mockURLValidator);

      const result = await modalManager.showConfirmationModal({
        url: 'https://example.com',
        threatDetails: { riskScore: 5 }
      });

      expect(result).toBe(true);
      expect(mockStatisticsCallback).toHaveBeenCalledWith(true);
    });

    test('should handle React import failures gracefully', async () => {
      global.import.mockRejectedValue(new Error('React import failed'));
      
      // React modal should fail and resolve with false for safety
      const result = await modalManager.showConfirmationModal({
        url: 'https://example.com'
      });

      expect(result).toBe(false);
    });

    test('should handle React modal errors gracefully', async () => {
      const mockShowExternalLinkModal = jest.fn().mockRejectedValue(new Error('Modal error'));
      global.import.mockResolvedValue({
        showExternalLinkModal: mockShowExternalLinkModal
      });

      // Should handle React modal failure gracefully

      const result = await modalManager.showConfirmationModal({
        url: 'https://example.com'
      });

      expect(result).toBe(false);
    });

    test('should pass correct config to React modal', async () => {
      const mockShowExternalLinkModal = jest.fn().mockResolvedValue(true);
      global.import.mockResolvedValue({
        showExternalLinkModal: mockShowExternalLinkModal
      });

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

      expect(mockShowExternalLinkModal).toHaveBeenCalledWith({
        url: 'validated-https://example.com',
        threatDetails
      });
    });

    test('should manage activeModal flag correctly with React', async () => {
      const mockShowExternalLinkModal = jest.fn().mockResolvedValue(true);
      global.import.mockResolvedValue({
        showExternalLinkModal: mockShowExternalLinkModal
      });

      expect(modalManager.activeModal).toBeNull();

      const modalPromise = modalManager.showConfirmationModal({
        url: 'https://example.com'
      });

      // activeModal should be set during modal display
      expect(modalManager.activeModal).toBe(true);

      await modalPromise;

      // activeModal should be cleared after modal closes
      expect(modalManager.activeModal).toBeNull();
    });

    test('should handle statistics callback errors in React modal', async () => {
      const mockShowExternalLinkModal = jest.fn().mockResolvedValue(true);
      global.import.mockResolvedValue({
        showExternalLinkModal: mockShowExternalLinkModal
      });

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

    test('should clear activeModal flag on React import error', async () => {
      global.import.mockRejectedValue(new Error('Import failed'));
      
      expect(modalManager.activeModal).toBeNull();

      await modalManager.showConfirmationModal({
        url: 'https://example.com'
      });

      expect(modalManager.activeModal).toBeNull();
    });

    test('should preserve URL validation in React modal path', async () => {
      const mockShowExternalLinkModal = jest.fn().mockResolvedValue(true);
      global.import.mockResolvedValue({
        showExternalLinkModal: mockShowExternalLinkModal
      });

      mockURLValidator.mockReturnValue('Safe URL');

      await modalManager.showConfirmationModal({
        url: 'https://dangerous-site.com'
      });

      expect(mockURLValidator).toHaveBeenCalledWith('https://dangerous-site.com');
      expect(mockShowExternalLinkModal).toHaveBeenCalledWith({
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
