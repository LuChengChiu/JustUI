/**
 * Utility functions for accessing Chrome extension manifest data
 */

/**
 * Get the version from manifest.json
 * @returns {string} The extension version
 */
export function getVersion() {
  try {
    return chrome.runtime.getManifest().version;
  } catch (error) {
    console.error('Error reading version from manifest:', error);
    return 'Unknown';
  }
}

/**
 * Get the extension name from manifest.json
 * @returns {string} The extension name
 */
export function getName() {
  try {
    return chrome.runtime.getManifest().name;
  } catch (error) {
    console.error('Error reading name from manifest:', error);
    return 'Unknown';
  }
}

/**
 * Get the entire manifest object (if needed for advanced use cases)
 * @returns {object} The manifest object
 */
export function getManifest() {
  try {
    return chrome.runtime.getManifest();
  } catch (error) {
    console.error('Error reading manifest:', error);
    return {};
  }
}