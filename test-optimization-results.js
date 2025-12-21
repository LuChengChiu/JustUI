/**
 * Test script to demonstrate the performance improvements
 * Run this in the browser console on a page with the optimized extension
 */

// Function to simulate the old vs new approach
function comparePerformance() {
  const elements = document.querySelectorAll('div, iframe, section, aside, nav, header');
  console.log(`Testing with ${elements.length} elements`);
  
  // Simulate OLD approach (layout thrashing)
  console.time('Old Approach (Simulated Layout Thrashing)');
  let oldProcessedCount = 0;
  elements.forEach(element => {
    // Simulate READ operation (getComputedStyle)
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    
    // Simulate analysis decision
    if (rect.width > 100 && rect.height > 50) {
      // Simulate WRITE operation (forced synchronous layout)
      element.setAttribute('data-test-old', 'processed');
      oldProcessedCount++;
    }
  });
  console.timeEnd('Old Approach (Simulated Layout Thrashing)');
  
  // Clean up
  elements.forEach(el => el.removeAttribute('data-test-old'));
  
  // Simulate NEW approach (batched READ/write)
  console.time('New Approach (Batched Operations)');
  
  // PHASE 1: READ (batch all layout queries)
  const candidates = [];
  elements.forEach(element => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    
    if (rect.width > 100 && rect.height > 50) {
      candidates.push(element);
    }
  });
  
  // PHASE 2: WRITE (batch all DOM modifications)
  let newProcessedCount = 0;
  candidates.forEach(element => {
    element.setAttribute('data-test-new', 'processed');
    newProcessedCount++;
  });
  console.timeEnd('New Approach (Batched Operations)');
  
  // Clean up
  candidates.forEach(el => el.removeAttribute('data-test-new'));
  
  console.log('Performance Comparison:', {
    totalElements: elements.length,
    oldProcessed: oldProcessedCount,
    newProcessed: newProcessedCount,
    filteringEfficiency: `${((elements.length - newProcessedCount) / elements.length * 100).toFixed(1)}% elements skipped`
  });
}

// Function to test smart filtering
function testSmartFiltering() {
  const elements = document.querySelectorAll('div, iframe, section, aside, nav, header');
  console.log(`Testing smart filtering with ${elements.length} elements`);
  
  let skippedCount = 0;
  let processedCount = 0;
  
  console.time('Smart Filtering');
  
  elements.forEach(element => {
    // Simulate the smart filtering logic
    
    // Skip disconnected elements
    if (!element.isConnected) {
      skippedCount++;
      return;
    }
    
    // Skip tiny elements
    const rect = element.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) {
      skippedCount++;
      return;
    }
    
    // Skip invisible elements
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      skippedCount++;
      return;
    }
    
    processedCount++;
  });
  
  console.timeEnd('Smart Filtering');
  
  console.log('Smart Filtering Results:', {
    totalElements: elements.length,
    processedElements: processedCount,
    skippedElements: skippedCount,
    efficiency: `${(skippedCount / elements.length * 100).toFixed(1)}% elements skipped`,
    analysisReduction: `${skippedCount} fewer elements to analyze`
  });
}

// Function to test Promise.all concurrency
async function testConcurrency() {
  const elementCount = 50; // Smaller count for demo
  const elements = Array.from(document.querySelectorAll('div, iframe, section, aside, nav, header')).slice(0, elementCount);
  
  console.log(`Testing concurrency with ${elements.length} elements`);
  
  // Simulate analysis function
  const simulateAnalysis = (element) => {
    return new Promise(resolve => {
      // Simulate variable analysis time (1-10ms)
      const analysisTime = Math.random() * 9 + 1;
      setTimeout(() => {
        resolve({
          isAd: Math.random() > 0.8, // 20% chance of being an ad
          confidence: Math.random(),
          element: element.tagName
        });
      }, analysisTime);
    });
  };
  
  // Serial approach
  console.time('Serial Analysis');
  const serialResults = [];
  for (const element of elements) {
    const result = await simulateAnalysis(element);
    serialResults.push(result);
  }
  console.timeEnd('Serial Analysis');
  
  // Concurrent approach
  console.time('Concurrent Analysis (Promise.all)');
  const promises = elements.map(element => simulateAnalysis(element));
  const concurrentResults = await Promise.all(promises);
  console.timeEnd('Concurrent Analysis (Promise.all)');
  
  console.log('Concurrency Results:', {
    elementsAnalyzed: elements.length,
    serialAds: serialResults.filter(r => r.isAd).length,
    concurrentAds: concurrentResults.filter(r => r.isAd).length,
    note: 'Concurrent approach should be significantly faster'
  });
}

// Main test function
async function runAllTests() {
  console.log('🚀 Running JustUI Performance Optimization Tests');
  console.log('================================================');
  
  console.log('\n1. Layout Thrashing Comparison:');
  comparePerformance();
  
  console.log('\n2. Smart Filtering Test:');
  testSmartFiltering();
  
  console.log('\n3. Concurrency Test:');
  await testConcurrency();
  
  console.log('\n✅ All tests completed!');
  console.log('Check the performance timings above to see the improvements.');
}

// Auto-run if in console
if (typeof window !== 'undefined') {
  console.log('JustUI Performance Test Suite loaded.');
  console.log('Run runAllTests() to see the optimization benefits!');
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runAllTests, comparePerformance, testSmartFiltering, testConcurrency };
}