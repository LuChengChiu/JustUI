# Performance Impact Notes

This document summarizes performance characteristics introduced by the
navigation permission cache and related features. Values are approximate and
intended for engineering awareness.

## Permission Cache

- Bundle size impact: ~1KB (minified, approximate).
- Memory impact: up to ~10MB in heavy-use scenarios.
- Storage impact: persisted entries under `permissionCacheV1`.
- Runtime impact: cache lookups are O(1) for hits; eviction can be more costly
  when the cache exceeds its configured size.

## User Experience Tradeoffs

- Cache reduces modal fatigue by reusing recent allow/deny decisions.
- Debounced persistence reduces storage API calls but may delay writes.

## Measurement Notes

These figures are based on local profiling and should be revalidated after
significant changes to cache size, eviction strategy, or persistence logic.
