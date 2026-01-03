import Logger from "@script-utils/logger.js";
import { IRuleSource } from "./i-rule-source.js";

/**
 * Default block requests source (daily updates from GitHub)
 */
export class DefaultBlockSource extends IRuleSource {
  constructor(name, url, idStart, idEnd, updateInterval = 1440) {
    super();
    this.name = name;
    this.url = url;
    this.idRange = { start: idStart, end: idEnd };
    this.updateInterval = updateInterval;
  }

  async fetchRules() {
    try {
      // Try to fetch from GitHub first
      const response = await fetch(this.url);
      if (!response.ok) {
        throw new Error(`GitHub fetch failed: ${response.status}`);
      }
      Logger.info(
        "NetworkBlocking:DefaultBlockSource",
        `Fetched ${this.name} from GitHub`
      );
      return await response.json();
    } catch (error) {
      // Fallback to bundled local file if GitHub fetch fails
      Logger.warn(
        "NetworkBlocking:DefaultBlockSource",
        `GitHub fetch failed for ${this.name}: ${error.message}`
      );
      Logger.info(
        "NetworkBlocking:DefaultBlockSource",
        "Falling back to bundled default-block-requests.json"
      );

      try {
        const bundledUrl = chrome.runtime.getURL('network-blocking/data/default-block-requests.json');
        const fallbackResponse = await fetch(bundledUrl);
        if (!fallbackResponse.ok) {
          throw new Error(`Bundled file not found: ${fallbackResponse.status}`);
        }
        Logger.info(
          "NetworkBlocking:DefaultBlockSource",
          `Loaded ${this.name} from bundled file`
        );
        return await fallbackResponse.json();
      } catch (fallbackError) {
        throw new Error(`Failed to fetch ${this.name} from both GitHub and bundled file: ${fallbackError.message}`);
      }
    }
  }

  getRuleIdRange() {
    return this.idRange;
  }

  getUpdateInterval() {
    return this.updateInterval;
  }

  getName() {
    return this.name;
  }

  getUpdateType() {
    return 'dynamic';
  }
}
