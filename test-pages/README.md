# Shadow DOM Testing Suite

Comprehensive test pages for verifying the Navigation Guardian modal's Shadow DOM implementation.

## 🎯 Test Pages

### 1. CSS Isolation Test (`css-isolation-test.html`)

**Purpose**: Verify complete CSS isolation from host page styles

**What it tests**:

- Protection against aggressive CSS resets (`* { padding: 0 !important; }`)
- Immunity to page-level style overrides
- Proper spacing, colors, and fonts within Shadow DOM
- Border-radius, box-shadow, and backdrop effects

**Expected Results**:

- ✅ Modal has proper padding (NOT zero)
- ✅ Modal background is white (NOT red from page CSS)
- ✅ Buttons have normal font size and colors (NOT 8px green)
- ✅ Modal has rounded corners
- ✅ Backdrop blur effect visible
- ✅ Bundled fonts (Days One, Barlow) render correctly

---

### 2. Functional Test (`functional-test.html`)

**Purpose**: Verify all interactive features work correctly

**What it tests**:

- Keyboard shortcuts (ESC, Enter)
- Click handlers (Allow, Block, outside click)
- Focus management and tab trapping
- Z-index and stacking context
- Threat detection and display
- Pop-under detection
- Modal queueing (duplicate prevention)

**Expected Results**:

- ✅ ESC key closes modal
- ✅ Enter key triggers Allow action
- ✅ Click outside closes modal
- ✅ Block/Allow buttons work correctly
- ✅ Tab key stays within modal
- ✅ Modal appears above high z-index elements
- ✅ Threat details display for suspicious URLs
- ✅ Pop-under badge shows when detected
- ✅ No duplicate modals on rapid clicks

---

### 3. Performance Test (`performance-test.html`)

**Purpose**: Measure performance and detect memory leaks

**What it tests**:

- Modal open time benchmarks
- CSS injection performance
- Font loading performance
- Memory usage over 100 iterations
- Memory leak detection

**Expected Results**:

- ✅ Modal opens in <200ms
- ✅ CSS injection <50ms
- ✅ Font loading <150ms
- ✅ Memory remains stable after 100 cycles
- ✅ No detached DOM elements

---

## 🚀 How to Run Tests

### Step 1: Build the Extension

```bash
npm run build
```

### Step 2: Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `dist/` directory from this project

### Step 3: Run Test Pages

**Option A: Open test pages directly**

```bash
# Open in your default browser
open test-pages/css-isolation-test.html
open test-pages/functional-test.html
open test-pages/performance-test.html
```

**Option B: Use a local server (recommended)**

```bash
# Using Python
cd test-pages
python3 -m http.server 8000

# Then visit:
# http://localhost:8000/css-isolation-test.html
# http://localhost:8000/functional-test.html
# http://localhost:8000/performance-test.html
```

**Option C: Use Vite preview**

```bash
npm run preview
# Then navigate to the test pages
```

### Step 4: Open Chrome DevTools

Press `F12` or `Cmd+Opt+I` (Mac) / `Ctrl+Shift+I` (Windows/Linux)

**Recommended tabs**:

- **Console**: See performance metrics and logs
- **Elements**: Inspect Shadow DOM structure
- **Performance**: Profile modal opening process
- **Memory**: Take heap snapshots for leak detection

---

## 🔍 Detailed Testing Instructions

### CSS Isolation Test

1. Open `css-isolation-test.html`
2. Click any test link to trigger the modal
3. **Inspect the modal**:

   - Right-click the modal → Inspect Element
   - Look for `<div id="originalui-external-link-modal-root">`
   - Expand to find `#shadow-root`
   - Verify you see:
     - `<style data-justui-style="tailwind">` (~43KB CSS with bundled @font-face rules)
     - `<div class="shadow-content">` (portal target)

4. **Verify visual appearance**:

   - Modal should have proper spacing and padding
   - White background (not red)
   - Normal button sizes and colors (not 8px green)
   - Rounded corners and shadow effects
   - Professional typography

5. **Check console logs**:
   ```
   OriginalUI: Created Shadow DOM container with portal target
   OriginalUI: Fetched 43130 bytes of CSS in 12.45ms
   OriginalUI: Injected 43130 bytes of CSS into Shadow DOM in 1.87ms
   OriginalUI: Verified bundled fonts in 1.23ms
   ```

---

### Functional Test

1. Open `functional-test.html`
2. Work through the **interactive checklist**:

   - [ ] Click test link → Modal appears
   - [ ] Press ESC → Modal closes
   - [ ] Click test link → Press Enter → Navigation allowed
   - [ ] Click outside modal (backdrop) → Modal closes
   - [ ] Click "Block" button → Navigation denied
   - [ ] Click "Allow" button → Navigation proceeds
   - [ ] Press Tab multiple times → Focus stays in modal
   - [ ] Modal appears above green high-z-index box

3. **Test special scenarios**:

   - Click "Rapid Click Test" → Only one modal should appear
   - Click suspicious URLs → Threat details should display
   - Test pop-under simulation → "POP-UNDER" badge shows

4. **Verify statistics tracking**:
   - Stats should update after each interaction
   - Blocked/Allowed counts should increment correctly

---

### Performance Test

1. Open `performance-test.html`
2. **Run automated benchmarks**:

   - Click "Single Modal Test" → Check timing
   - Click "10 Iterations Test" → Average should be <200ms
   - Click "50 Iterations Test" → Monitor performance consistency
   - Click "100 Iterations (Memory Leak Test)" → Watch memory growth

3. **Review benchmark table**:

   - All rows should show "PASS" status (green badge)
   - Modal Open Time: <200ms ✅
   - CSS Injection Time: <50ms ✅
   - Font Loading Time: <150ms ✅
   - Memory Leak Test: Stable after 100 cycles ✅

4. **Memory leak detection**:

   - Open DevTools → Memory tab
   - Click "Take snapshot" before test
   - Run 100 iterations test
   - Click garbage collection icon (trash)
   - Click "Take snapshot" after test
   - Compare snapshots:
     - Look for "Detached HTMLDivElement" growth
     - Memory should return to ~baseline after GC
     - Growth <10MB is acceptable

5. **Performance profiling** (advanced):
   - Open DevTools → Performance tab
   - Click "Record" (circle icon)
   - Click a test link to trigger modal
   - Click "Stop" after modal appears
   - Review timeline:
     - JavaScript execution
     - Style recalculation
     - Layout/Paint events
     - Total time should be <200ms

---

## 📊 Success Criteria

### CSS Isolation (CRITICAL)

- ✅ Modal immune to `* { padding: 0 !important; }`
- ✅ Modal immune to page CSS resets
- ✅ Proper spacing maintained on all pages
- ✅ Shadow DOM structure visible in DevTools
- ✅ CSS and fonts loaded inside `#shadow-root`

### Functionality

- ✅ All keyboard shortcuts work
- ✅ All button interactions work
- ✅ Focus management correct
- ✅ Modal appears on top (z-index)
- ✅ Threat detection displays
- ✅ Statistics tracking works

### Performance

- ✅ Modal opens in <200ms
- ✅ CSS injection <50ms
- ✅ Font loading <150ms
- ✅ No memory leaks after 100+ cycles
- ✅ No console errors

---

## 🐛 Troubleshooting

### Modal doesn't appear

**Check**:

- Extension is loaded and active in `chrome://extensions`
- No console errors (red messages)
- Content script injected (check DevTools → Sources)
- `index.css` accessible via `chrome.runtime.getURL()`

**Solution**:

- Reload extension
- Reload test page
- Check manifest.json has `index.css` in `web_accessible_resources`

---

### Styles are broken

**Check**:

- Shadow DOM structure in Elements tab
- `<style>` tags present inside `#shadow-root`
- CSS content length (~43KB)
- No CSP violations in console

**Solution**:

- Inspect `#shadow-root` in DevTools
- Verify `data-justui-style="tailwind"` attribute
- Check Network tab for CSS load errors
- Rebuild extension: `npm run build`

---

### Fonts don't render correctly

**Check**:

- Verify bundled font files exist in `dist/fonts/`
- Check console for font verification logs
- Inspect Shadow DOM for `@font-face` rules in CSS

**Solution**:

- Rebuild extension with `npm run build` to copy fonts
- Verify manifest.json includes fonts in web_accessible_resources
- Check browser DevTools → Network tab for failed font requests
- Fonts are bundled locally - no internet connection needed

---

### Performance is slow (>200ms)

**Check**:

- Console performance logs
- Network tab for slow CSS fetch
- Chrome DevTools Performance profile

**Solution**:

- CSS should be cached after first load
- Check for network throttling
- Disable other extensions
- Test in incognito mode

---

### Memory leaks detected

**Check**:

- DevTools → Memory → Heap snapshots
- Look for "Detached HTMLDivElement" growth
- Check if containers are being removed

**Solution**:

- Verify `cleanup()` calls `container.remove()`
- Check for event listener cleanup
- Test with fewer iterations
- Compare memory before/after GC

---

## 📝 Test Report Template

After running all tests, use this template to document results:

```markdown
# Shadow DOM Test Report

**Date**: [Date]
**Chrome Version**: [Version]
**Extension Version**: 1.0.0

## CSS Isolation Test

- [ ] Passed - Modal styling intact despite aggressive page CSS
- [ ] Shadow DOM structure verified in DevTools
- [ ] CSS and fonts loaded correctly
- **Notes**: [Any issues or observations]

## Functional Test

- [ ] All keyboard shortcuts working
- [ ] All button interactions working
- [ ] Focus management correct
- [ ] Z-index layering correct
- [ ] Threat detection working
- **Notes**: [Any issues or observations]

## Performance Test

- [ ] Modal open time: [X]ms (target: <200ms)
- [ ] CSS injection: [X]ms (target: <50ms)
- [ ] Font loading: [X]ms (target: <150ms)
- [ ] Memory growth after 100 cycles: [X]MB (target: <10MB)
- [ ] Memory leak test: PASS / FAIL
- **Notes**: [Any issues or observations]

## Overall Result

- [ ] ✅ PASS - All tests passed
- [ ] ⚠️ PARTIAL - Some issues found
- [ ] ❌ FAIL - Critical issues found

**Summary**: [Brief summary of results]
```

---

## 🎓 Additional Resources

- **Chrome Extension DevTools**: `chrome://extensions` → Details → Inspect views
- **Shadow DOM Guide**: https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM
- **Performance API**: https://developer.mozilla.org/en-US/docs/Web/API/Performance
- **Memory Profiling**: https://developer.chrome.com/docs/devtools/memory-problems/

---

## ✅ Quick Checklist

Before considering testing complete:

- [ ] Built extension with `npm run build`
- [ ] Loaded extension in Chrome from `dist/`
- [ ] Ran CSS isolation test - Modal styling intact
- [ ] Ran functional test - All checkboxes checked
- [ ] Ran performance test - All benchmarks PASS
- [ ] Inspected Shadow DOM in DevTools
- [ ] Checked console for errors/warnings
- [ ] Took memory snapshots (no leaks)
- [ ] Tested on multiple websites
- [ ] Documented any issues found

---

**Happy Testing! 🚀**
