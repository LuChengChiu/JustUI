import { IRuleSource } from './i-rule-source.js';

/**
 * EasyList rule source implementation (LSP - substitutable)
 */
export class EasyListSource extends IRuleSource {
  constructor(name, url, idStart, idEnd, updateInterval = 10080, updateType = 'dynamic') {
    super();
    this.name = name;
    this.url = url;
    this.idRange = { start: idStart, end: idEnd };
    this.updateInterval = updateInterval;
    this.updateType = updateType;
  }

  async fetchRules() {
    const response = await fetch(this.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${this.name}: ${response.status}`);
    }
    return await response.text();
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
    return this.updateType;
  }
}
