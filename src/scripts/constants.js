/**
 * Shared constants for JustUI Chrome Extension
 */

// Maximum z-index value (2^31 - 1) - used for overlay detection and modal positioning
export const MAX_Z_INDEX = 2147483647;

// High z-index threshold for suspicious element detection
export const HIGH_Z_INDEX_THRESHOLD = 1000000;

// Pattern detection performance tuning
export const PATTERN_DETECTION_CONFIG = {
  TARGET_FRAME_BUDGET: 12,      // Target ms per batch (60fps safe)
  MAX_TOTAL_TIME: 5000,          // Maximum total execution time (ms)
  MAX_ELEMENT_TIME: 50,          // Skip elements taking longer than this (ms)
  MIN_BATCH_SIZE: 5,             // Minimum elements per batch
  MAX_BATCH_SIZE: 100,           // Maximum elements per batch
  INITIAL_BATCH_SIZE: 10,        // Starting batch size
  PERF_WINDOW_SIZE: 5            // Moving average window size
};

// Hybrid processing configuration
export const HYBRID_CONFIG = {
  SNAPSHOT_MAX_AGE: 100,           // ms - maximum snapshot age before considered stale
  CRITICAL_ELEMENT_TIMEOUT: 30,   // ms - maximum time per critical element analysis
  BULK_VALIDATION_THRESHOLD: 10,  // px - maximum geometry change threshold
  ADAPTIVE_DETECTION_ENABLED: true, // enable evasion detection
  GEOMETRY_CHANGE_THRESHOLD: 10,  // px - threshold for detecting geometry changes
  VALIDATION_RETRY_LIMIT: 2,      // maximum validation retries
  FALLBACK_TO_REALTIME: true,     // fallback to real-time processing on hybrid failure
  BULK_VALIDATION_ENABLED: true,  // enable snapshot validation before removal
  MUTATION_DETECTION_ENABLED: true, // enable mutation monitoring for critical elements
  CACHE_ENABLED: true,             // enable element classification caching
  DEBUG_LOGGING: false            // enable detailed debug logging for hybrid processing
};
