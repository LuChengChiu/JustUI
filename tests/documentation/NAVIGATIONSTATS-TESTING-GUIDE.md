# NavigationStats Testing Guide

This guide provides comprehensive testing procedures to verify that the NavigationStats feature is working correctly in the JustUI extension.

## Quick Test Summary

Based on code analysis, the NavigationStats tracking should work as follows:

1. **Initialization**: Stats start at `{ blockedCount: 0, allowedCount: 0 }`
2. **Tracking**: Updated when user makes decisions in Navigation Guardian modal
3. **Storage**: Persisted to `chrome.storage.local.navigationStats`
4. **Display**: Shown in popup under "Navigation Protection" section
5. **Synchronization**: Real-time updates via storage change listeners

## Test Files Created

- `navigation-stats-test.html` - Interactive test page with navigation triggers
- `test-navigation-stats.js` - Automated test suite for console testing

## Step-by-Step Testing Procedure

### 1. Build and Load Extension

```bash
npm run build
```

Load the `dist/` folder into Chrome Extensions (Developer mode).

### 2. Open Test Page

Open `navigation-stats-test.html` in Chrome. This page provides:
- Current stats display
- Navigation test buttons
- Cross-origin triggers
- Storage manipulation tools

### 3. Test Basic Functionality

#### Manual Stats Check:
1. Open extension popup
2. Look for "Navigation Protection" section
3. Verify blocked/allowed counts are displayed
4. Check if counts are initially 0

#### Storage Verification:
1. Open Chrome DevTools Console on test page
2. Run: `chrome.storage.local.get(['navigationStats'], console.log)`
3. Verify stats object exists and has correct structure

### 4. Test Navigation Interception

#### Test Window.open() Blocking:
1. Click "Open Ad Network (Malicious)" button
2. Navigation Guardian modal should appear
3. Click "Block" - blockedCount should increase
4. Check popup to verify counter updated

#### Test Window.open() Allowing:
1. Click "Open Google.com (Safe)" button  
2. Navigation Guardian modal should appear
3. Click "Allow" - allowedCount should increase
4. Check popup to verify counter updated

#### Test Location Navigation:
1. Click "Navigate to Suspicious TLD" button
2. Navigation Guardian modal should appear
3. Test both Block and Allow options
4. Verify stats update correctly

### 5. Automated Testing

#### Load Test Suite:
1. Open Console on test page
2. Copy and paste contents of `test-navigation-stats.js`
3. Run: `runNavigationStatsTests()`

#### Manual Storage Tests:
```javascript
// Check current stats
checkCurrentStats()

// Set test values
setTestStats(10, 5)

// Verify persistence
checkCurrentStats()
```

### 6. Test Edge Cases

#### Reset Functionality:
1. Use test page "Reset Stats" button
2. Verify both counts return to 0
3. Check that popup displays correctly

#### Large Numbers:
1. Set high values: `setTestStats(9999, 8888)`
2. Verify display handles large numbers
3. Test increment operations

#### Concurrent Updates:
1. Open multiple tabs with test page
2. Trigger navigation events in different tabs
3. Verify stats aggregate correctly

### 7. Integration Testing

#### Popup Display Sync:
1. Keep popup open while testing
2. Trigger navigation events on test page
3. Verify popup updates in real-time
4. Check if stats match storage values

#### Extension State Dependencies:
1. Test with Navigation Guardian disabled
2. Test with extension inactive
3. Test with domain whitelisted

### 8. Common Issues to Check

#### Stats Not Updating:
- Check if Navigation Guardian is enabled
- Verify extension is active
- Check if domain is whitelisted (bypasses protection)
- Look for JavaScript errors in console

#### Display Synchronization Issues:
- Check `chrome.storage.onChanged` listener
- Verify popup state management
- Check React reducer logic

#### Storage Persistence Problems:
- Test with extension reload
- Verify Chrome storage permissions
- Check for storage quota issues

### 9. Expected Behavior Verification

#### Navigation Guardian Modal:
- ✅ Should appear for cross-origin navigation
- ✅ Should not appear for same-origin navigation
- ✅ Should not appear if domain is whitelisted
- ✅ Should show threat analysis for malicious URLs

#### Stats Tracking:
- ✅ Block button increases `blockedCount`
- ✅ Allow button increases `allowedCount`
- ✅ Stats persist across browser sessions
- ✅ Stats sync across all extension components

#### Popup Display:
- ✅ Shows current blocked/allowed counts
- ✅ Updates in real-time when stats change
- ✅ Displays "Navigation Protection" section correctly
- ✅ Shows proper status based on extension state

### 10. Performance Testing

#### Memory Usage:
- Monitor stats object size in storage
- Check for memory leaks in NavigationGuardian
- Verify cleanup on extension reload

#### Response Time:
- Test modal appearance speed
- Verify stats update speed
- Check storage write performance

## Troubleshooting

### No Modal Appearing:
1. Check if Navigation Guardian is enabled
2. Verify extension is active
3. Check browser console for errors
4. Test with different domains

### Stats Not Persisting:
1. Check Chrome storage permissions
2. Verify storage API availability
3. Test storage operations manually

### Display Issues:
1. Check React component state
2. Verify storage change listeners
3. Check popup CSS styling

## Implementation Notes

The NavigationStats feature involves several components:

1. **NavigationGuardian.js**: Updates stats in `handleAllow()` and `handleDeny()` functions (lines 348-361)
2. **content.js**: Initializes stats from storage (line 484)
3. **App.jsx**: Displays stats in popup UI (lines 473-482)
4. **background.js**: Initializes default stats structure (line 329)

All components use `chrome.storage.local` for persistence and `chrome.storage.onChanged` for real-time synchronization.