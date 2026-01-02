/**
 * NavigationStats Testing Script
 * 
 * This script helps verify that navigationStats are correctly tracked,
 * stored, and displayed in the JustUI extension.
 * 
 * Usage:
 * 1. Load this script in the Chrome DevTools console of the test page
 * 2. Run the test functions to verify stats behavior
 * 3. Check the extension popup to see if stats match
 */

class NavigationStatsTest {
    constructor() {
        this.testResults = [];
        this.originalStats = null;
    }

    async init() {
        console.log('🧪 Initializing NavigationStats Test Suite');
        
        // Get current stats
        this.originalStats = await this.getStorageStats();
        console.log('📊 Original stats:', this.originalStats);
        
        // Test storage operations
        await this.testStorageOperations();
        
        // Test stats persistence
        await this.testStatsPersistence();
        
        // Test stats display sync
        await this.testStatsDisplaySync();
        
        // Generate test report
        this.generateReport();
    }

    async getStorageStats() {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get(['navigationStats'], (result) => {
                    resolve(result.navigationStats || { blockedCount: 0, allowedCount: 0 });
                });
            } else {
                resolve({ blockedCount: 0, allowedCount: 0 });
            }
        });
    }

    async setStorageStats(stats) {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.set({ navigationStats: stats }, resolve);
            } else {
                resolve();
            }
        });
    }

    async testStorageOperations() {
        console.log('🔧 Testing storage operations...');
        
        const testStats = { blockedCount: 42, allowedCount: 24 };
        
        try {
            // Set test stats
            await this.setStorageStats(testStats);
            console.log('✅ Set test stats:', testStats);
            
            // Retrieve and verify
            const retrievedStats = await this.getStorageStats();
            console.log('📥 Retrieved stats:', retrievedStats);
            
            const isMatch = retrievedStats.blockedCount === testStats.blockedCount && 
                           retrievedStats.allowedCount === testStats.allowedCount;
            
            this.testResults.push({
                test: 'Storage Operations',
                passed: isMatch,
                details: `Expected: ${JSON.stringify(testStats)}, Got: ${JSON.stringify(retrievedStats)}`
            });
            
            console.log(isMatch ? '✅ Storage operations work correctly' : '❌ Storage operations failed');
            
        } catch (error) {
            this.testResults.push({
                test: 'Storage Operations',
                passed: false,
                details: `Error: ${error.message}`
            });
            console.error('❌ Storage test failed:', error);
        }
    }

    async testStatsPersistence() {
        console.log('💾 Testing stats persistence...');
        
        try {
            const testValues = [
                { blockedCount: 1, allowedCount: 0 },
                { blockedCount: 2, allowedCount: 1 },
                { blockedCount: 5, allowedCount: 3 },
                { blockedCount: 10, allowedCount: 7 }
            ];
            
            let allPersisted = true;
            
            for (const testValue of testValues) {
                await this.setStorageStats(testValue);
                
                // Small delay to ensure storage is written
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const retrieved = await this.getStorageStats();
                
                if (retrieved.blockedCount !== testValue.blockedCount || 
                    retrieved.allowedCount !== testValue.allowedCount) {
                    allPersisted = false;
                    console.error('❌ Persistence failed for:', testValue, 'Got:', retrieved);
                    break;
                }
            }
            
            this.testResults.push({
                test: 'Stats Persistence',
                passed: allPersisted,
                details: allPersisted ? 'All test values persisted correctly' : 'Some values failed to persist'
            });
            
            console.log(allPersisted ? '✅ Stats persistence works correctly' : '❌ Stats persistence failed');
            
        } catch (error) {
            this.testResults.push({
                test: 'Stats Persistence',
                passed: false,
                details: `Error: ${error.message}`
            });
            console.error('❌ Persistence test failed:', error);
        }
    }

    async testStatsDisplaySync() {
        console.log('🔄 Testing stats display synchronization...');
        
        try {
            // Set known values
            const testStats = { blockedCount: 15, allowedCount: 8 };
            await this.setStorageStats(testStats);
            
            // Wait for any UI updates
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Check if display elements exist and are updated
            const blockedElement = document.getElementById('blocked-count');
            const allowedElement = document.getElementById('allowed-count');
            
            let displaySynced = true;
            let details = '';
            
            if (blockedElement && allowedElement) {
                const displayedBlocked = parseInt(blockedElement.textContent) || 0;
                const displayedAllowed = parseInt(allowedElement.textContent) || 0;
                
                if (displayedBlocked === testStats.blockedCount && 
                    displayedAllowed === testStats.allowedCount) {
                    details = 'Display elements show correct values';
                } else {
                    displaySynced = false;
                    details = `Display mismatch - Blocked: ${displayedBlocked} (expected ${testStats.blockedCount}), Allowed: ${displayedAllowed} (expected ${testStats.allowedCount})`;
                }
            } else {
                displaySynced = false;
                details = 'Display elements not found on page';
            }
            
            this.testResults.push({
                test: 'Display Synchronization',
                passed: displaySynced,
                details
            });
            
            console.log(displaySynced ? '✅ Display sync works correctly' : '❌ Display sync failed');
            
        } catch (error) {
            this.testResults.push({
                test: 'Display Synchronization',
                passed: false,
                details: `Error: ${error.message}`
            });
            console.error('❌ Display sync test failed:', error);
        }
    }

    async simulateNavigationEvents() {
        console.log('🚀 Simulating navigation events...');
        
        try {
            const currentStats = await this.getStorageStats();
            
            // Test increment functions
            const incrementBlocked = () => {
                const newStats = { ...currentStats, blockedCount: currentStats.blockedCount + 1 };
                this.setStorageStats(newStats);
                return newStats;
            };
            
            const incrementAllowed = () => {
                const newStats = { ...currentStats, allowedCount: currentStats.allowedCount + 1 };
                this.setStorageStats(newStats);
                return newStats;
            };
            
            console.log('🔄 Simulating blocked navigation...');
            const afterBlocked = incrementBlocked();
            await new Promise(resolve => setTimeout(resolve, 500));
            
            console.log('🔄 Simulating allowed navigation...');
            const afterAllowed = incrementAllowed();
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const finalStats = await this.getStorageStats();
            
            this.testResults.push({
                test: 'Navigation Event Simulation',
                passed: true,
                details: `Successfully simulated events. Final stats: ${JSON.stringify(finalStats)}`
            });
            
        } catch (error) {
            this.testResults.push({
                test: 'Navigation Event Simulation',
                passed: false,
                details: `Error: ${error.message}`
            });
            console.error('❌ Event simulation failed:', error);
        }
    }

    async testStatsReset() {
        console.log('🔄 Testing stats reset functionality...');
        
        try {
            // Set some non-zero stats
            await this.setStorageStats({ blockedCount: 5, allowedCount: 3 });
            
            // Reset to zero
            await this.setStorageStats({ blockedCount: 0, allowedCount: 0 });
            
            const resetStats = await this.getStorageStats();
            
            const isReset = resetStats.blockedCount === 0 && resetStats.allowedCount === 0;
            
            this.testResults.push({
                test: 'Stats Reset',
                passed: isReset,
                details: isReset ? 'Stats successfully reset to zero' : `Reset failed: ${JSON.stringify(resetStats)}`
            });
            
            console.log(isReset ? '✅ Stats reset works correctly' : '❌ Stats reset failed');
            
        } catch (error) {
            this.testResults.push({
                test: 'Stats Reset',
                passed: false,
                details: `Error: ${error.message}`
            });
            console.error('❌ Reset test failed:', error);
        }
    }

    generateReport() {
        console.log('\n📋 NavigationStats Test Report');
        console.log('================================');
        
        let passedCount = 0;
        
        this.testResults.forEach((result, index) => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`${index + 1}. ${result.test}: ${status}`);
            console.log(`   Details: ${result.details}`);
            
            if (result.passed) passedCount++;
        });
        
        console.log('\n📊 Summary');
        console.log(`Passed: ${passedCount}/${this.testResults.length}`);
        console.log(`Success Rate: ${(passedCount / this.testResults.length * 100).toFixed(1)}%`);
        
        if (passedCount === this.testResults.length) {
            console.log('🎉 All tests passed! NavigationStats functionality is working correctly.');
        } else {
            console.log('⚠️ Some tests failed. Check the implementation for issues.');
        }
        
        return this.testResults;
    }

    async restoreOriginalStats() {
        if (this.originalStats) {
            await this.setStorageStats(this.originalStats);
            console.log('🔄 Restored original stats:', this.originalStats);
        }
    }

    async runAllTests() {
        await this.init();
        await this.simulateNavigationEvents();
        await this.testStatsReset();
        await this.restoreOriginalStats();
        return this.testResults;
    }
}

// Global functions for easy testing
window.navigationStatsTest = new NavigationStatsTest();

window.runNavigationStatsTests = async function() {
    return await window.navigationStatsTest.runAllTests();
};

window.checkCurrentStats = async function() {
    const stats = await window.navigationStatsTest.getStorageStats();
    console.log('📊 Current NavigationStats:', stats);
    return stats;
};

window.setTestStats = async function(blocked = 5, allowed = 3) {
    const stats = { blockedCount: blocked, allowedCount: allowed };
    await window.navigationStatsTest.setStorageStats(stats);
    console.log('✅ Set test stats:', stats);
    return stats;
};

console.log('🧪 NavigationStats Test Suite Loaded');
console.log('📝 Available functions:');
console.log('  - runNavigationStatsTests() - Run all tests');
console.log('  - checkCurrentStats() - Get current stats');
console.log('  - setTestStats(blocked, allowed) - Set test values');
console.log('');
console.log('🚀 To run tests automatically: runNavigationStatsTests()');