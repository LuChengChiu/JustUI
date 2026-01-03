import { useState, useEffect, useCallback, useRef } from 'react';
import {
  safeStorageGet,
  safeStorageSet,
  isExtensionContextValid
} from '../scripts/utils/chrome-api-safe.js';
import Logger from '@script-utils/logger.js';

/**
 * Custom hook for managing Chrome storage with production-grade safety
 *
 * @param {string} key - The storage key to manage
 * @param {*} defaultValue - Default value if key doesn't exist in storage
 * @param {object} options - Hook configuration options
 * @param {number} options.maxRetries - Maximum retry attempts for transient errors (default: 3)
 * @param {boolean} options.useCircuitBreaker - Enable circuit breaker protection (default: true)
 * @param {boolean} options.validateWrite - Validate write operations succeeded (default: false)
 * @returns {[value, setValue, loading, error]} - Tuple similar to useState with loading and error states
 *
 * @example
 * // Basic usage with defaults
 * const [whitelist, setWhitelist, loading, error] = useChromeStorage('whitelist', []);
 *
 * @example
 * // Critical data with validation
 * const [settings, setSettings, loading, error] = useChromeStorage('settings', {}, {
 *   maxRetries: 5,
 *   validateWrite: true
 * });
 *
 * if (loading) return <Loading />;
 * if (error) return <Error message={error.message} />;
 *
 * return (
 *   <WhitelistManager
 *     domains={whitelist}
 *     onDomainsChange={setWhitelist}
 *   />
 * );
 */
export function useChromeStorage(key, defaultValue, options = {}) {
  const { maxRetries = 3, useCircuitBreaker = true, validateWrite = false } = options;

  // Use ref to avoid dependency on defaultValue reference changes
  const defaultValueRef = useRef(defaultValue);
  const [value, setValue] = useState(defaultValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    // Check if Chrome context is still valid
    if (!isExtensionContextValid()) {
      Logger.warn('ChromeStorageHook', 'Chrome context invalidated, using default value', {
        key
      });
      setLoading(false);
      setError(new Error('Extension context invalidated'));
      return;
    }

    // Load from storage using production-grade safe API
    const loadStorage = async () => {
      try {
        const result = await safeStorageGet([key], null, {
          maxRetries,
          useCircuitBreaker
        });

        if (isMounted) {
          setValue(result[key] ?? defaultValueRef.current);
          setError(null); // Clear previous errors on success
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          Logger.warn('ChromeStorageHook', `Failed to load storage key "${key}"`, err);
          setValue(defaultValueRef.current); // Explicit default on error
          setError(err);
          setLoading(false); // Loading complete even on error
        }
      }
    };

    loadStorage();

    // Real-time sync listener for changes from other components/tabs
    const listener = (changes, namespace) => {
      if (namespace === 'local' && changes[key] && isMounted) {
        setValue(changes[key].newValue ?? defaultValueRef.current);
      }
    };

    chrome.storage.onChanged.addListener(listener);

    // Cleanup listener on unmount
    return () => {
      isMounted = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, [key, maxRetries, useCircuitBreaker]); // Include options in dependencies

  /**
   * Update value with production-grade safety and automatic retries
   */
  const updateValue = useCallback(async (newValue) => {
    // Optimistic update for better UX
    setValue(newValue);

    if (!isExtensionContextValid()) {
      Logger.warn('ChromeStorageHook', 'Chrome context invalidated, cannot save to storage', {
        key
      });
      setError(new Error('Extension context invalidated'));
      return;
    }

    try {
      await safeStorageSet({ [key]: newValue }, {
        maxRetries,
        useCircuitBreaker,
        validateWrite // Ensure write actually succeeded
      });

      setError(null); // Clear errors on successful save
    } catch (err) {
      Logger.error('ChromeStorageHook', `Failed to save storage key "${key}"`, err);
      setError(err);
      // Note: We keep optimistic update even on error for UX
      // The storage listener will revert if needed
    }
  }, [key, maxRetries, useCircuitBreaker, validateWrite]);

  return [value, updateValue, loading, error];
}
