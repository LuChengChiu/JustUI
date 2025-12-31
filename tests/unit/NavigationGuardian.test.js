/**
 * Integration Tests for NavigationGuardian Module
 * Tests orchestration of SecurityValidator, ModalManager, and core functionality
 */

import { NavigationGuardian } from '@modules/NavigationGuardian.js';

// Mock Chrome API
global.chrome = {
  scripting: {
    executeScript: jest.fn().mockResolvedValue([{ result: true }])
  },
  runtime: {
    getURL: jest.fn(path => `chrome-extension://test-id/${path}`)
  }
};

// Mock SecurityValidator
const mockSecurityValidator = {
  validateURL: jest.fn(),
  analyzeThreats: jest.fn(),
  getSecurityAnalysis: jest.fn(),
  getThreatLevel: jest.fn()
};

jest.mock('../../src/scripts/modules/navigation-guardian/security-validator.js', () => ({
  SecurityValidator: jest.fn().mockImplementation(() => mockSecurityValidator)
}));

// Mock ModalManager
const mockModalManager = {
  setStatisticsCallback: jest.fn(),
  setURLValidator: jest.fn(),
  showConfirmationModal: jest.fn().mockResolvedValue(false),
  cleanup: jest.fn()
};

jest.mock('../../src/scripts/modules/navigation-guardian/ModalManager.js', () => ({
  ModalManager: jest.fn().mockImplementation(() => mockModalManager)
}));

// Mock Chrome API Safe
const mockChromeApiSafe = {
  isExtensionContextValid: jest.fn(() => true),
  safeStorageSet: jest.fn().mockResolvedValue(true),
  safeStorageGet: jest.fn().mockResolvedValue({ navigationStats: { blockedCount: 0, allowedCount: 0 } })
};

jest.mock('../../src/scripts/utils/chromeApiSafe.js', () => mockChromeApiSafe);

// Mock CleanableModule
const mockCleanableModule = {
  setLifecyclePhase: jest.fn(),
  getLifecyclePhase: jest.fn(() => 'active'),
  cleanup: jest.fn()
};

// Note: ICleanable mock removed - NavigationGuardian no longer extends CleanableModule

describe('NavigationGuardian Integration Tests', () => {
  let guardian;
  let mockDocument;
  let mockWindow;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock DOM environment
    mockDocument = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      createElement: jest.fn(),
      head: { appendChild: jest.fn() }
    };

    mockWindow = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      location: { href: 'https://example.com' }
    };

    global.document = mockDocument;
    global.window = mockWindow;

    // Setup mock validation responses
    mockSecurityValidator.validateURL.mockReturnValue({
      isValid: true,
      displayURL: 'https://example.com',
      warnings: []
    });

    mockSecurityValidator.analyzeThreats.mockReturnValue({
      riskScore: 2,
      threats: [],
      isPopUnder: false
    });

    mockSecurityValidator.getSecurityAnalysis.mockReturnValue({
      validation: { isValid: true },
      threatAnalysis: { riskScore: 2 },
      threatLevel: { level: 'LOW' },
      recommendation: 'ALLOW'
    });

    guardian = new NavigationGuardian();
  });

  describe('Initialization and Configuration', () => {
    test('should initialize with SecurityValidator and ModalManager', () => {
      expect(guardian.securityValidator).toBeDefined();
      expect(guardian.modalManager).toBeDefined();
      expect(guardian.enabled).toBe(false);
      expect(guardian.stats.blockedCount).toBe(0);
      expect(guardian.stats.allowedCount).toBe(0);
    });

    test('should configure modal manager with callbacks', () => {
      expect(mockModalManager.setStatisticsCallback).toHaveBeenCalled();
      expect(mockModalManager.setURLValidator).toHaveBeenCalled();
    });

    test('should extend CleanableModule correctly', () => {
      expect(mockCleanableModule.setLifecyclePhase).toHaveBeenCalled();
    });
  });

  describe('Enable/Disable Functionality', () => {
    test('should enable navigation protection', async () => {
      await guardian.enable();
      
      expect(guardian.enabled).toBe(true);
      expect(mockDocument.addEventListener).toHaveBeenCalledWith('click', expect.any(Function), true);
      expect(mockWindow.addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    });

    test('should disable navigation protection', async () => {
      await guardian.enable();
      await guardian.disable();
      
      expect(guardian.enabled).toBe(false);
      expect(mockDocument.removeEventListener).toHaveBeenCalled();
      expect(mockWindow.removeEventListener).toHaveBeenCalled();
    });

    test('should handle Chrome API context invalidation during enable', async () => {
      mockChromeApiSafe.isExtensionContextValid.mockReturnValue(false);
      
      await guardian.enable();
      
      expect(guardian.enabled).toBe(true); // Should still enable DOM listeners
      expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
    });

    test('should handle script injection errors gracefully', async () => {
      chrome.scripting.executeScript.mockRejectedValue(new Error('Script injection failed'));
      
      await guardian.enable();
      
      expect(guardian.enabled).toBe(true);
      expect(mockDocument.addEventListener).toHaveBeenCalled();
    });
  });

  describe('Legacy API Compatibility', () => {
    test('should support getNavigationStats method', () => {
      guardian.stats.blockedCount = 5;
      guardian.stats.allowedCount = 3;
      
      const stats = guardian.getNavigationStats();
      
      expect(stats.blockedCount).toBe(5);
      expect(stats.allowedCount).toBe(3);
    });

    test('should support setEnabled method', async () => {
      await guardian.setEnabled(true);
      expect(guardian.enabled).toBe(true);
      
      await guardian.setEnabled(false);
      expect(guardian.enabled).toBe(false);
    });
  });

  describe('URL Interception and Analysis', () => {
    beforeEach(async () => {
      await guardian.enable();
    });

    test('should intercept and allow safe navigation', async () => {
      const mockEvent = {
        target: { href: 'https://google.com', hostname: 'google.com' },
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      };

      mockSecurityValidator.getSecurityAnalysis.mockReturnValue({
        validation: { isValid: true },
        threatAnalysis: { riskScore: 1 },
        threatLevel: { level: 'LOW' },
        recommendation: 'ALLOW'
      });

      const clickHandler = mockDocument.addEventListener.mock.calls
        .find(call => call[0] === 'click')[1];

      await clickHandler(mockEvent);

      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockModalManager.showConfirmationModal).not.toHaveBeenCalled();
    });

    test('should intercept and block malicious navigation', async () => {
      const mockEvent = {
        target: { href: 'https://malicious.com', hostname: 'malicious.com' },
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      };

      mockSecurityValidator.getSecurityAnalysis.mockReturnValue({
        validation: { isValid: true },
        threatAnalysis: { riskScore: 9, threats: [{ type: 'Malicious domain', score: 9 }] },
        threatLevel: { level: 'HIGH' },
        recommendation: 'BLOCK'
      });

      mockModalManager.showConfirmationModal.mockResolvedValue(false);

      const clickHandler = mockDocument.addEventListener.mock.calls
        .find(call => call[0] === 'click')[1];

      await clickHandler(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockModalManager.showConfirmationModal).toHaveBeenCalledWith({
        url: 'https://malicious.com',
        threatDetails: expect.objectContaining({
          riskScore: 9,
          threats: expect.arrayContaining([
            expect.objectContaining({ type: 'Malicious domain' })
          ])
        })
      });
      expect(guardian.stats.blockedCount).toBe(1);
    });

    test('should handle user allowing high-risk navigation', async () => {
      const mockEvent = {
        target: { href: 'https://risky.com', hostname: 'risky.com' },
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      };

      mockSecurityValidator.getSecurityAnalysis.mockReturnValue({
        validation: { isValid: true },
        threatAnalysis: { riskScore: 7 },
        threatLevel: { level: 'HIGH' },
        recommendation: 'BLOCK'
      });

      mockModalManager.showConfirmationModal.mockResolvedValue(true);

      const clickHandler = mockDocument.addEventListener.mock.calls
        .find(call => call[0] === 'click')[1];

      await clickHandler(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockModalManager.showConfirmationModal).toHaveBeenCalled();
      expect(guardian.stats.allowedCount).toBe(1);
    });

    test('should handle SecurityValidator errors gracefully', async () => {
      const mockEvent = {
        target: { href: 'https://example.com', hostname: 'example.com' },
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      };

      mockSecurityValidator.getSecurityAnalysis.mockImplementation(() => {
        throw new Error('Validator error');
      });

      const clickHandler = mockDocument.addEventListener.mock.calls
        .find(call => call[0] === 'click')[1];

      await clickHandler(mockEvent);

      // Should fail safe - block navigation on error
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });

    test('should handle ModalManager errors gracefully', async () => {
      const mockEvent = {
        target: { href: 'https://suspicious.com', hostname: 'suspicious.com' },
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      };

      mockSecurityValidator.getSecurityAnalysis.mockReturnValue({
        validation: { isValid: true },
        threatAnalysis: { riskScore: 6 },
        threatLevel: { level: 'MEDIUM' },
        recommendation: 'BLOCK'
      });

      mockModalManager.showConfirmationModal.mockRejectedValue(new Error('Modal error'));

      const clickHandler = mockDocument.addEventListener.mock.calls
        .find(call => call[0] === 'click')[1];

      await clickHandler(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      // Should default to blocking on modal error
      expect(guardian.stats.blockedCount).toBe(1);
    });
  });

  describe('Statistics Management', () => {
    test('should update statistics on block action', () => {
      guardian.updateStats(false);
      
      expect(guardian.stats.blockedCount).toBe(1);
      expect(guardian.stats.allowedCount).toBe(0);
      expect(mockChromeApiSafe.safeStorageSet).toHaveBeenCalledWith({
        navigationStats: guardian.stats
      });
    });

    test('should update statistics on allow action', () => {
      guardian.updateStats(true);
      
      expect(guardian.stats.allowedCount).toBe(1);
      expect(guardian.stats.blockedCount).toBe(0);
    });

    test('should handle storage errors in statistics update', () => {
      mockChromeApiSafe.safeStorageSet.mockRejectedValue(new Error('Storage error'));
      
      expect(() => guardian.updateStats(true)).not.toThrow();
      expect(guardian.stats.allowedCount).toBe(1);
    });

    test('should get stats correctly', () => {
      guardian.stats.blockedCount = 10;
      guardian.stats.allowedCount = 5;
      
      const stats = guardian.getStats();
      
      expect(stats).toEqual({
        blockedCount: 10,
        allowedCount: 5
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle null target elements', async () => {
      await guardian.enable();

      const mockEvent = {
        target: null,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      };

      const clickHandler = mockDocument.addEventListener.mock.calls
        .find(call => call[0] === 'click')[1];

      expect(() => clickHandler(mockEvent)).not.toThrow();
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    });

    test('should handle elements without href', async () => {
      await guardian.enable();

      const mockEvent = {
        target: { tagName: 'DIV' },
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      };

      const clickHandler = mockDocument.addEventListener.mock.calls
        .find(call => call[0] === 'click')[1];

      expect(() => clickHandler(mockEvent)).not.toThrow();
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    });

    test('should handle malformed URLs gracefully', async () => {
      await guardian.enable();

      const mockEvent = {
        target: { href: 'not-a-valid-url', hostname: 'invalid' },
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      };

      mockSecurityValidator.getSecurityAnalysis.mockReturnValue({
        validation: { isValid: false },
        threatAnalysis: { riskScore: 10 },
        threatLevel: { level: 'HIGH' },
        recommendation: 'BLOCK'
      });

      const clickHandler = mockDocument.addEventListener.mock.calls
        .find(call => call[0] === 'click')[1];

      await clickHandler(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(guardian.stats.blockedCount).toBe(1);
    });
  });

  describe('Cleanup and Resource Management', () => {
    test('should cleanup all resources', async () => {
      await guardian.enable();
      
      guardian.cleanup();
      
      expect(mockModalManager.cleanup).toHaveBeenCalled();
      expect(mockCleanableModule.cleanup).toHaveBeenCalled();
      expect(guardian.enabled).toBe(false);
    });

    test('should handle cleanup errors gracefully', async () => {
      await guardian.enable();
      
      mockModalManager.cleanup.mockImplementation(() => {
        throw new Error('Modal cleanup error');
      });
      
      expect(() => guardian.cleanup()).toThrow('Modal cleanup error');
      expect(guardian.enabled).toBe(false);
    });

    test('should cleanup on window unload', async () => {
      await guardian.enable();
      
      const unloadHandler = mockWindow.addEventListener.mock.calls
        .find(call => call[0] === 'beforeunload')[1];
      
      unloadHandler();
      
      expect(mockModalManager.cleanup).toHaveBeenCalled();
    });
  });

  describe('Performance Characteristics', () => {
    test('should process navigation events efficiently', async () => {
      await guardian.enable();
      
      const clickHandler = mockDocument.addEventListener.mock.calls
        .find(call => call[0] === 'click')[1];
      
      const events = Array.from({ length: 100 }, (_, i) => ({
        target: { href: `https://example${i}.com`, hostname: `example${i}.com` },
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      }));
      
      const start = performance.now();
      
      for (const event of events) {
        await clickHandler(event);
      }
      
      const end = performance.now();
      
      // Should process 100 navigation events quickly
      expect(end - start).toBeLessThan(1000); // 1 second limit
    });

    test('should maintain low memory footprint', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create and cleanup multiple instances
      for (let i = 0; i < 50; i++) {
        const testGuardian = new NavigationGuardian();
        testGuardian.cleanup();
      }
      
      // Force garbage collection if available
      if (global.gc) global.gc();
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be minimal (less than 5MB for 50 instances)
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
    });
  });

  describe('Integration with Chrome Extension Context', () => {
    test('should handle extension context invalidation', async () => {
      await guardian.enable();
      
      // Simulate context invalidation
      mockChromeApiSafe.isExtensionContextValid.mockReturnValue(false);
      mockChromeApiSafe.safeStorageSet.mockRejectedValue(new Error('Extension context invalid'));
      
      // Should still function with DOM-only capabilities
      guardian.updateStats(true);
      expect(guardian.stats.allowedCount).toBe(1);
    });

    test('should gracefully degrade when Chrome APIs unavailable', async () => {
      // Remove Chrome API
      delete global.chrome;
      
      await guardian.enable();
      
      // Should still enable DOM listeners
      expect(guardian.enabled).toBe(true);
      expect(mockDocument.addEventListener).toHaveBeenCalled();
    });
  });
});
