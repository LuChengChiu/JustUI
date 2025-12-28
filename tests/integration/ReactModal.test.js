/**
 * Integration Tests for React Modal Workflow
 * Tests the complete flow from NavigationGuardian to React Modal
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { reactTestUtils, domTestUtils } from '../../test/setup-react.js'

// Mock Chrome extension APIs
const mockChrome = {
  runtime: {
    getURL: vi.fn((path) => `chrome-extension://test-id/${path}`),
    lastError: null
  },
  storage: {
    local: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({})
    }
  }
}

global.chrome = mockChrome

// Mock NavigationGuardian
const createMockNavigationGuardian = () => ({
  isEnabled: true,
  navigationStats: { blockedCount: 0, allowedCount: 0 },
  modalManager: null,
  securityValidator: {
    validateURLSecurity: vi.fn((url) => url),
    analyzeThreats: vi.fn(() => ({
      riskScore: 0,
      threats: [],
      isPopUnder: false
    }))
  },
  whitelist: [],
  isDomainWhitelisted: vi.fn(() => false),
  updateNavigationStats: vi.fn(),
  showNavigationModal: vi.fn()
})

// Mock ModalManager
const createMockModalManager = () => ({
  activeModal: null,
  statisticsCallback: null,
  urlValidator: null,
  setStatisticsCallback: vi.fn(function(callback) { this.statisticsCallback = callback }),
  setURLValidator: vi.fn(function(validator) { this.urlValidator = validator }),
  showConfirmationModal: vi.fn(),
  cleanup: vi.fn()
})

// Mock SecurityValidator
const createMockSecurityValidator = () => ({
  validateURLSecurity: vi.fn((url) => url),
  analyzeThreats: vi.fn((url) => ({
    riskScore: 0,
    threats: [],
    isPopUnder: false
  }))
})

describe('React Modal Integration Tests', () => {
  let mockNavigationGuardian
  let mockModalManager
  let mockSecurityValidator
  let mockContainer

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Reset Chrome mocks
    mockChrome.runtime.lastError = null
    mockChrome.storage.local.set.mockClear()
    mockChrome.storage.local.get.mockClear()
    
    // Create fresh mocks
    mockNavigationGuardian = createMockNavigationGuardian()
    mockModalManager = createMockModalManager()
    mockSecurityValidator = createMockSecurityValidator()
    
    // Create test container
    mockContainer = domTestUtils.createModalContainer()
    
    // Setup NavigationGuardian with ModalManager
    mockNavigationGuardian.modalManager = mockModalManager
    mockNavigationGuardian.securityValidator = mockSecurityValidator
    
    // Mock dynamic import for ExternalLinkModal
    global.import = vi.fn()
  })

  afterEach(() => {
    if (mockContainer?.destroy) {
      mockContainer.destroy()
    }
    vi.clearAllTimers()
    
    // Clean up any remaining modal containers
    const containers = document.querySelectorAll('#originalui-external-link-modal-root')
    containers.forEach(container => container.remove())
  })

  describe('Complete Modal Workflow', () => {
    test('should handle full navigation guard flow with React modal', async () => {
      // Setup: React modal success
      const mockShowExternalLinkModal = vi.fn().mockResolvedValue(true)
      global.import.mockResolvedValue({
        showExternalLinkModal: mockShowExternalLinkModal
      })
      
      // Setup: ModalManager integration
      mockModalManager.showConfirmationModal.mockImplementation(async (config) => {
        // Simulate the actual ModalManager React integration
        try {
          const { showExternalLinkModal } = await global.import('../../src/components/external-link-modal.jsx')
          mockModalManager.activeModal = true
          
          const result = await showExternalLinkModal(config)
          
          if (mockModalManager.statisticsCallback) {
            mockModalManager.statisticsCallback(result)
          }
          
          mockModalManager.activeModal = null
          return result
        } catch (error) {
          mockModalManager.activeModal = null
          return false
        }
      })
      
      // Setup: NavigationGuardian callbacks
      mockModalManager.setStatisticsCallback((allowed) => {
        if (allowed) {
          mockNavigationGuardian.navigationStats.allowedCount++
        } else {
          mockNavigationGuardian.navigationStats.blockedCount++
        }
        mockNavigationGuardian.updateNavigationStats()
      })
      
      mockModalManager.setURLValidator((url) => {
        return mockSecurityValidator.validateURLSecurity(url)
      })
      
      // Test: Trigger navigation guard
      const testURL = 'https://external-site.com'
      const threatDetails = {
        riskScore: 3,
        threats: [{ type: 'External domain', score: 3 }],
        isPopUnder: false
      }
      
      // Execute: Show confirmation modal
      const result = await mockModalManager.showConfirmationModal({
        url: testURL,
        threatDetails
      })
      
      // Verify: React modal was used
      expect(global.import).toHaveBeenCalledWith('../../src/components/external-link-modal.jsx')
      expect(mockShowExternalLinkModal).toHaveBeenCalledWith({
        url: testURL,
        threatDetails
      })
      
      // Verify: User decision was processed
      expect(result).toBe(true)
      expect(mockNavigationGuardian.navigationStats.allowedCount).toBe(1)
      expect(mockNavigationGuardian.navigationStats.blockedCount).toBe(0)
      expect(mockNavigationGuardian.updateNavigationStats).toHaveBeenCalled()
      
      // Verify: Modal state was managed correctly
      expect(mockModalManager.activeModal).toBeNull()
    })

    test('should fallback to legacy modal when React fails', async () => {
      // Setup: React import failure
      global.import.mockRejectedValue(new Error('React import failed'))
      
      // Setup: Legacy modal fallback
      // React modal error handling test
      
      mockModalManager.showConfirmationModal.mockImplementation(async (config) => {
        try {
          await global.import('../../src/components/external-link-modal.jsx')
        } catch (error) {
          console.error('React modal failed, using legacy:', error)
          mockModalManager.activeModal = null
          throw new Error('React modal failed')
        }
      })
      
      // Test: Trigger navigation with React failure
      const result = await mockModalManager.showConfirmationModal({
        url: 'https://test.com'
      })
      
      // Verify: Fallback was used
      expect(global.import).toHaveBeenCalled()
      // Test should verify error handling instead of legacy modal
        url: 'https://test.com'
      })
      expect(result).toBe(false)
    })

    test('should handle navigation guardian statistics properly', async () => {
      // Setup: React modal that denies navigation
      const mockShowExternalLinkModal = vi.fn().mockResolvedValue(false)
      global.import.mockResolvedValue({
        showExternalLinkModal: mockShowExternalLinkModal
      })
      
      // Setup: Statistics tracking
      const statisticsCallback = vi.fn((allowed) => {
        if (allowed) {
          mockNavigationGuardian.navigationStats.allowedCount++
        } else {
          mockNavigationGuardian.navigationStats.blockedCount++
        }
      })
      
      mockModalManager.setStatisticsCallback(statisticsCallback)
      
      mockModalManager.showConfirmationModal.mockImplementation(async (config) => {
        const { showExternalLinkModal } = await global.import('../../src/components/external-link-modal.jsx')
        const result = await showExternalLinkModal(config)
        
        if (mockModalManager.statisticsCallback) {
          mockModalManager.statisticsCallback(result)
        }
        
        return result
      })
      
      // Test: User denies navigation
      const result = await mockModalManager.showConfirmationModal({
        url: 'https://malicious.com'
      })
      
      // Verify: Statistics were updated
      expect(result).toBe(false)
      expect(statisticsCallback).toHaveBeenCalledWith(false)
      expect(mockNavigationGuardian.navigationStats.blockedCount).toBe(1)
      expect(mockNavigationGuardian.navigationStats.allowedCount).toBe(0)
    })
  })

  describe('Security Integration', () => {
    test('should validate URLs through SecurityValidator', async () => {
      // Setup: URL validation
      mockSecurityValidator.validateURLSecurity.mockReturnValue('Validated: https://safe.com')
      
      const mockShowExternalLinkModal = vi.fn().mockResolvedValue(true)
      global.import.mockResolvedValue({
        showExternalLinkModal: mockShowExternalLinkModal
      })
      
      mockModalManager.setURLValidator((url) => {
        return mockSecurityValidator.validateURLSecurity(url)
      })
      
      mockModalManager.showConfirmationModal.mockImplementation(async (config) => {
        let validatedURL = config.url
        if (mockModalManager.urlValidator) {
          validatedURL = mockModalManager.urlValidator(config.url)
        }
        
        const { showExternalLinkModal } = await global.import('../../src/components/external-link-modal.jsx')
        return await showExternalLinkModal({
          ...config,
          url: validatedURL
        })
      })
      
      // Test: URL validation flow
      await mockModalManager.showConfirmationModal({
        url: 'https://suspicious.com'
      })
      
      // Verify: URL was validated
      expect(mockSecurityValidator.validateURLSecurity).toHaveBeenCalledWith('https://suspicious.com')
      expect(mockShowExternalLinkModal).toHaveBeenCalledWith({
        url: 'Validated: https://safe.com'
      })
    })

    test('should analyze threats before showing modal', async () => {
      // Setup: Threat analysis
      mockSecurityValidator.analyzeThreats.mockReturnValue({
        riskScore: 8,
        threats: [
          { type: 'Known malicious domain', score: 8 }
        ],
        isPopUnder: true
      })
      
      const mockShowExternalLinkModal = vi.fn().mockResolvedValue(false)
      global.import.mockResolvedValue({
        showExternalLinkModal: mockShowExternalLinkModal
      })
      
      // Simulate NavigationGuardian threat analysis integration
      const analyzeAndShowModal = async (url) => {
        const threatAnalysis = mockSecurityValidator.analyzeThreats(url)
        
        return await mockModalManager.showConfirmationModal({
          url,
          threatDetails: threatAnalysis
        })
      }
      
      mockModalManager.showConfirmationModal.mockImplementation(async (config) => {
        const { showExternalLinkModal } = await global.import('../../src/components/external-link-modal.jsx')
        return await showExternalLinkModal(config)
      })
      
      // Test: High-risk URL
      const result = await analyzeAndShowModal('https://malware.com')
      
      // Verify: Threat analysis was performed
      expect(mockSecurityValidator.analyzeThreats).toHaveBeenCalledWith('https://malware.com')
      expect(mockShowExternalLinkModal).toHaveBeenCalledWith({
        url: 'https://malware.com',
        threatDetails: {
          riskScore: 8,
          threats: [{ type: 'Known malicious domain', score: 8 }],
          isPopUnder: true
        }
      })
      expect(result).toBe(false)
    })

    test('should handle whitelisted domains correctly', async () => {
      // Setup: Whitelist check
      mockNavigationGuardian.isDomainWhitelisted.mockReturnValue(true)
      
      // Simulate NavigationGuardian whitelist integration
      const checkWhitelistAndShowModal = async (url) => {
        const urlObj = new URL(url)
        if (mockNavigationGuardian.isDomainWhitelisted(urlObj.hostname)) {
          // Skip modal for whitelisted domains
          return true
        }
        
        return await mockModalManager.showConfirmationModal({ url })
      }
      
      // Test: Whitelisted domain
      const result = await checkWhitelistAndShowModal('https://trusted.com')
      
      // Verify: Modal was skipped
      expect(mockNavigationGuardian.isDomainWhitelisted).toHaveBeenCalledWith('trusted.com')
      expect(mockModalManager.showConfirmationModal).not.toHaveBeenCalled()
      expect(result).toBe(true)
    })
  })

  describe('Chrome Extension Context', () => {
    test('should handle chrome storage operations', async () => {
      // Setup: Storage success
      mockChrome.storage.local.set.mockResolvedValue(undefined)
      
      // Simulate NavigationGuardian storage update
      const updateStats = async (stats) => {
        try {
          await mockChrome.storage.local.set({ navigationStats: stats })
          return true
        } catch (error) {
          console.error('Storage error:', error)
          return false
        }
      }
      
      mockNavigationGuardian.updateNavigationStats.mockImplementation(async () => {
        return await updateStats(mockNavigationGuardian.navigationStats)
      })
      
      // Test: Stats update after modal interaction
      mockNavigationGuardian.navigationStats.allowedCount = 5
      const result = await mockNavigationGuardian.updateNavigationStats()
      
      // Verify: Storage was updated
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        navigationStats: { blockedCount: 0, allowedCount: 5 }
      })
      expect(result).toBe(true)
    })

    test('should handle chrome storage errors gracefully', async () => {
      // Setup: Storage error
      const storageError = new Error('Storage quota exceeded')
      mockChrome.storage.local.set.mockRejectedValue(storageError)
      
      mockNavigationGuardian.updateNavigationStats.mockImplementation(async () => {
        try {
          await mockChrome.storage.local.set({ navigationStats: mockNavigationGuardian.navigationStats })
          return true
        } catch (error) {
          console.error('Storage error:', error)
          return false
        }
      })
      
      // Test: Storage error handling
      const result = await mockNavigationGuardian.updateNavigationStats()
      
      // Verify: Error was handled gracefully
      expect(result).toBe(false)
      expect(mockChrome.storage.local.set).toHaveBeenCalled()
    })

    test('should handle extension context invalidation', async () => {
      // Setup: Extension context invalid
      mockChrome.runtime.lastError = new Error('Extension context invalidated')
      
      // Simulate safe Chrome API usage
      const safeStorageOperation = async (data) => {
        if (mockChrome.runtime.lastError) {
          console.warn('Chrome context invalid:', mockChrome.runtime.lastError)
          return false
        }
        
        try {
          await mockChrome.storage.local.set(data)
          return true
        } catch (error) {
          return false
        }
      }
      
      // Test: Context invalidation
      const result = await safeStorageOperation({ test: 'data' })
      
      // Verify: Operation was aborted safely
      expect(result).toBe(false)
      expect(mockChrome.storage.local.set).not.toHaveBeenCalled()
    })
  })

  describe('Performance and Memory', () => {
    test('should clean up React components properly', async () => {
      // Setup: Mock React root
      const mockRoot = reactTestUtils.createMockRoot()
      
      // Setup: React modal with cleanup
      const mockShowExternalLinkModal = vi.fn().mockImplementation(async (config) => {
        const container = document.createElement('div')
        container.id = 'originalui-external-link-modal-root'
        document.body.appendChild(container)
        
        mockRoot._container = container
        
        // Simulate user interaction
        setTimeout(() => {
          mockRoot.unmount()
          if (container.parentNode) {
            container.parentNode.removeChild(container)
          }
        }, 10)
        
        return new Promise(resolve => {
          setTimeout(() => resolve(true), 20)
        })
      })
      
      global.import.mockResolvedValue({
        showExternalLinkModal: mockShowExternalLinkModal
      })
      
      mockModalManager.showConfirmationModal.mockImplementation(async (config) => {
        const { showExternalLinkModal } = await global.import('../../src/components/external-link-modal.jsx')
        return await showExternalLinkModal(config)
      })
      
      // Test: Modal lifecycle
      const result = await mockModalManager.showConfirmationModal({
        url: 'https://test.com'
      })
      
      // Verify: Cleanup occurred
      expect(result).toBe(true)
      expect(mockRoot.unmount).toHaveBeenCalled()
      
      // Verify: No leftover containers
      const containers = document.querySelectorAll('#originalui-external-link-modal-root')
      expect(containers.length).toBe(0)
    })

    test('should handle multiple rapid modal requests', async () => {
      // Setup: Prevent duplicate modals
      let modalActive = false
      
      mockModalManager.showConfirmationModal.mockImplementation(async (config) => {
        if (modalActive) {
          console.warn('Modal already active, ignoring duplicate')
          return false
        }
        
        modalActive = true
        
        try {
          const mockShowExternalLinkModal = vi.fn().mockResolvedValue(true)
          global.import.mockResolvedValue({
            showExternalLinkModal: mockShowExternalLinkModal
          })
          
          const { showExternalLinkModal } = await global.import('../../src/components/external-link-modal.jsx')
          return await showExternalLinkModal(config)
        } finally {
          modalActive = false
        }
      })
      
      // Test: Rapid requests
      const promises = [
        mockModalManager.showConfirmationModal({ url: 'https://test1.com' }),
        mockModalManager.showConfirmationModal({ url: 'https://test2.com' }),
        mockModalManager.showConfirmationModal({ url: 'https://test3.com' })
      ]
      
      const results = await Promise.all(promises)
      
      // Verify: Only first request succeeded
      expect(results.filter(r => r === true).length).toBe(1)
      expect(results.filter(r => r === false).length).toBe(2)
    })

    test('should monitor memory usage during modal operations', async () => {
      // Setup: Memory tracking
      const memoryBefore = {
        containers: document.querySelectorAll('[id*="modal"]').length,
        listeners: 0 // Would track event listeners in real scenario
      }
      
      const mockShowExternalLinkModal = vi.fn().mockImplementation(async (config) => {
        // Simulate modal creation
        const container = domTestUtils.createModalContainer()
        
        // Simulate user interaction and cleanup
        await new Promise(resolve => setTimeout(resolve, 10))
        
        container.destroy()
        return true
      })
      
      global.import.mockResolvedValue({
        showExternalLinkModal: mockShowExternalLinkModal
      })
      
      mockModalManager.showConfirmationModal.mockImplementation(async (config) => {
        const { showExternalLinkModal } = await global.import('../../src/components/external-link-modal.jsx')
        return await showExternalLinkModal(config)
      })
      
      // Test: Multiple modal operations
      for (let i = 0; i < 5; i++) {
        await mockModalManager.showConfirmationModal({
          url: `https://test${i}.com`
        })
      }
      
      // Verify: Memory was cleaned up
      const memoryAfter = {
        containers: document.querySelectorAll('[id*="modal"]').length,
        listeners: 0
      }
      
      expect(memoryAfter.containers).toBe(memoryBefore.containers)
    })
  })

  describe('Error Recovery', () => {
    test('should recover from React component errors', async () => {
      // Setup: React component error
      const componentError = new Error('React component crashed')
      
      let attempt = 0
      global.import.mockImplementation(() => {
        attempt++
        if (attempt === 1) {
          return Promise.resolve({
            showExternalLinkModal: vi.fn().mockRejectedValue(componentError)
          })
        } else {
          return Promise.resolve({
            showExternalLinkModal: vi.fn().mockResolvedValue(false)
          })
        }
      })
      
      // React modal error handling test
      
      mockModalManager.showConfirmationModal.mockImplementation(async (config) => {
        try {
          const { showExternalLinkModal } = await global.import('../../src/components/external-link-modal.jsx')
          return await showExternalLinkModal(config)
        } catch (error) {
          console.error('React modal failed, using legacy:', error)
          throw new Error('React modal failed')
        }
      })
      
      // Test: Component error recovery
      const result = await mockModalManager.showConfirmationModal({
        url: 'https://test.com'
      })
      
      // Verify: Fallback was used
      // Test should verify React modal behavior
      expect(result).toBe(false)
    })

    test('should handle network errors gracefully', async () => {
      // Setup: Network error during import
      const networkError = new Error('Failed to fetch')
      networkError.name = 'NetworkError'
      
      global.import.mockRejectedValue(networkError)
      mockModalManager.showLegacyModal.mockResolvedValue(true)
      
      mockModalManager.showConfirmationModal.mockImplementation(async (config) => {
        try {
          await global.import('../../src/components/external-link-modal.jsx')
        } catch (error) {
          if (error.name === 'NetworkError') {
            console.warn('Network error, using legacy modal')
          }
          throw new Error('React modal failed')
        }
      })
      
      // Test: Network error handling
      const result = await mockModalManager.showConfirmationModal({
        url: 'https://test.com'
      })
      
      // Verify: Graceful degradation
      expect(result).toBe(true)
      // Test should verify React modal behavior
    })
  })
})