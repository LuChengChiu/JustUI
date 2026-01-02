import { useState, useEffect, useCallback, useRef } from 'react';

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
 * Custom hook for managing a single Chrome storage key
 *
 * @param {string} key - The storage key to manage
 * @param {*} defaultValue - Default value if key doesn't exist in storage
 * @returns {[value, setValue, loading, error]} - Tuple similar to useState with loading and error states
 *
 * @example
 * const [whitelist, setWhitelist, loading, error] = useChromeStorage('whitelist', []);
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
export function useChromeStorage(key, defaultValue) {
  // Use ref to avoid dependency on defaultValue reference changes
  const defaultValueRef = useRef(defaultValue);
  const [value, setValue] = useState(defaultValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check if Chrome context is still valid
    if (!isChromeContextValid()) {
      console.warn('Chrome context invalidated, skipping storage load');
      setLoading(false);
      setError(new Error('Extension context invalidated'));
      return;
    }

    // Initial load from storage
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        setError(chrome.runtime.lastError);
      } else {
        setValue(result[key] ?? defaultValueRef.current);
      }
      setLoading(false);
    });

    // Real-time sync listener for changes from other components/tabs
    const listener = (changes, namespace) => {
      if (namespace === 'local' && changes[key]) {
        setValue(changes[key].newValue ?? defaultValueRef.current);
      }
    };

    chrome.storage.onChanged.addListener(listener);

    // Cleanup listener on unmount
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [key]); // Only depend on key, not defaultValue

  /**
   * Update value in both state and Chrome storage
   */
  const updateValue = useCallback((newValue) => {
    // Check if Chrome context is still valid
    if (!isChromeContextValid()) {
      console.warn('Chrome context invalidated, cannot save to storage');
      setError(new Error('Extension context invalidated'));
      return;
    }

    setValue(newValue);
    chrome.storage.local.set({ [key]: newValue }, () => {
      if (chrome.runtime.lastError) {
        setError(chrome.runtime.lastError);
      } else {
        // Clear any previous errors on successful save
        setError(null);
      }
    });
  }, [key]);

  return [value, updateValue, loading, error];
}
