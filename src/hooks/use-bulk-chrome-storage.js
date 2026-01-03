import { useState, useEffect, useCallback, useRef } from 'react';
import Logger from '@script-utils/logger.js';

/**
 * Check if Chrome extension context is still valid
 * @returns {boolean} True if context is valid
 */
const isChromeContextValid = () => {
  try {
    return chrome?.runtime?.id !== undefined;
  } catch {
    return false;
  }
};

/**
 * Custom hook for managing multiple Chrome storage keys efficiently
 *
 * @param {Object} schema - Object with storage keys and their default values
 * @returns {{ values: Object, updateValue: Function, loading: boolean, error: Error|null }}
 *
 * @example
 * const { values, updateValue, loading, error } = useBulkChromeStorage({
 *   whitelist: [],
 *   customRules: [],
 *   defaultRulesEnabled: true
 * });
 *
 * if (loading) return <Loading />;
 *
 * return (
 *   <>
 *     <WhitelistManager
 *       domains={values.whitelist}
 *       onDomainsChange={(domains) => updateValue('whitelist', domains)}
 *     />
 *     <Toggle
 *       enabled={values.defaultRulesEnabled}
 *       onChange={(enabled) => updateValue('defaultRulesEnabled', enabled)}
 *     />
 *   </>
 * );
 */
export function useBulkChromeStorage(schema) {
  // Validate schema
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    Logger.error('BulkChromeStorageHook', 'Schema must be a non-null object', {
      schemaType: typeof schema
    });
    schema = {};
  }

  const [values, setValues] = useState({ ...schema });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Store current values in ref for rollback on errors
  const valuesRef = useRef(values);

  // Update ref when values change
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    // Check if Chrome context is still valid
    if (!isChromeContextValid()) {
      Logger.warn('BulkChromeStorageHook', 'Chrome context invalidated, skipping storage load');
      setLoading(false);
      setError(new Error('Extension context invalidated'));
      return;
    }

    const keys = Object.keys(schema);

    // Batch load all keys from storage
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        setError(chrome.runtime.lastError);
        setLoading(false);
        return;
      }

      // Merge loaded values with defaults
      const loaded = {};
      keys.forEach(key => {
        loaded[key] = result[key] ?? schema[key];
      });

      setValues(loaded);
      setLoading(false);
    });

    // Real-time sync listener for all registered keys
    const listener = (changes, namespace) => {
      if (namespace !== 'local') return;

      // Collect all updates for registered keys
      const updates = {};
      keys.forEach(key => {
        if (changes[key]) {
          updates[key] = changes[key].newValue ?? schema[key];
        }
      });

      // Apply updates if any changes occurred
      if (Object.keys(updates).length > 0) {
        setValues(prev => ({ ...prev, ...updates }));
      }
    };

    chrome.storage.onChanged.addListener(listener);

    // Cleanup listener on unmount
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []); // Empty deps - schema is initial config only

  /**
   * Update a specific key in both state and Chrome storage
   *
   * @param {string} key - The storage key to update
   * @param {*} newValue - The new value to set
   */
  const updateValue = useCallback((key, newValue) => {
    // Check if Chrome context is still valid
    if (!isChromeContextValid()) {
      Logger.warn('BulkChromeStorageHook', 'Chrome context invalidated, cannot save to storage', {
        key
      });
      setError(new Error('Extension context invalidated'));
      return;
    }

    // Capture previous value for rollback on error
    const previousValue = valuesRef.current[key];

    // Optimistically update local state
    setValues(prev => ({ ...prev, [key]: newValue }));

    // Persist to Chrome storage
    chrome.storage.local.set({ [key]: newValue }, () => {
      if (chrome.runtime.lastError) {
        setError(chrome.runtime.lastError);
        // CRITICAL: Rollback optimistic update on storage error
        setValues(prev => ({ ...prev, [key]: previousValue }));
        Logger.error('BulkChromeStorageHook', `Failed to save ${key} to storage`, chrome.runtime.lastError);
      } else {
        // Clear any previous errors on successful save
        setError(null);
      }
    });
  }, []);

  return { values, updateValue, loading, error };
}
