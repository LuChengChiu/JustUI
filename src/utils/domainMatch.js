/**
 * Domain matcher for whitelist and rule evaluation.
 */
export function domainMatches(domain, pattern) {
  if (!domain || !pattern) {
    return false;
  }

  if (domain === pattern) {
    return true;
  }

  if (pattern.startsWith('*.')) {
    const baseDomain = pattern.slice(2);
    return domain === baseDomain || domain.endsWith('.' + baseDomain);
  }

  return domain.endsWith('.' + pattern);
}
