import { useCallback } from "react";
import TagsInput from "@/components/ui/tags-input";
import { H1, Text } from "@/components/ui/typography";

/**
 * Domain validation patterns and constants
 */
const VALIDATION_PATTERNS = {
  // IPv4 pattern with optional port
  IPV4: /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  // Localhost with port pattern
  LOCALHOST_PORT: /^localhost:\d+$/,
  // Basic domain structure validation
  DOMAIN:
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}(:\d+)?$/,
  // Pure numeric string (invalid)
  PURE_NUMERIC: /^\d+$/,
};

/**
 * Special domain values that are always considered valid
 */
const SPECIAL_DOMAINS = new Set(["*", "localhost"]);

/**
 * Validates basic domain structure and format
 * @param {string} domain - Domain to validate
 * @returns {boolean} - Whether the domain is valid
 */
const validateBasicDomain = (domain) => {
  // Must have at least one dot and proper TLD
  if (!domain.includes(".")) return false;
  if (VALIDATION_PATTERNS.PURE_NUMERIC.test(domain)) return false;
  if (!VALIDATION_PATTERNS.DOMAIN.test(domain)) return false;

  // Additional structure checks
  const parts = domain.split(":")[0].split(".");
  if (parts.length < 2) return false;

  // TLD must be at least 2 characters and contain letters
  const tld = parts[parts.length - 1];
  if (tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return false;
  return parts.every(
    (part) => part && !part.startsWith("-") && !part.endsWith("-")
  );
};

/**
 * Validates domain input according to whitelist requirements
 * @param {string} domain - Domain string to validate
 * @returns {boolean} - Whether the domain is valid for whitelisting
 */
const validateWhitelistDomain = (domain) => {
  const trimmed = domain.trim();
  if (SPECIAL_DOMAINS.has(trimmed)) return true;
  if (trimmed.startsWith("localhost:")) {
    return VALIDATION_PATTERNS.LOCALHOST_PORT.test(trimmed);
  }

  if (trimmed.startsWith("*.")) {
    const withoutWildcard = trimmed.substring(2);
    return validateBasicDomain(withoutWildcard);
  }

  if (VALIDATION_PATTERNS.IPV4.test(trimmed)) {
    const parts = trimmed.split(":")[0].split(".");
    return parts.every((part) => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  return validateBasicDomain(trimmed);
};

/**
 * WhitelistManager Component
 *
 * Manages domain whitelist for OriginalUI extension. Provides validation,
 * user-friendly input handling, and clear feedback for domain management.
 *
 * @component
 * @param {Object} props - Component props
 * @param {string[]} props.domains - Current whitelist domains
 * @param {function} props.onDomainsChange - Callback when domains change
 * @param {boolean} [props.disabled] - Whether input is disabled
 * @param {number} [props.maxLines=3] - Maximum lines of tags to display before showing "more" button
 * @param {string} [props.className] - Additional CSS classes
 */
export default function WhitelistManager({
  domains = [],
  onDomainsChange,
  disabled = false,
  maxLines = 3,
  className = "",
}) {
  /**
   * Handle domain changes with validation and persistence
   */
  const handleDomainChange = useCallback(
    (newDomains) => {
      if (typeof onDomainsChange === "function") {
        onDomainsChange(newDomains);
      }
    },
    [onDomainsChange]
  );

  return (
    <div className={`space-y-1.5 ${className}`}>
      <H1 color="primary">Whitelist Domains</H1>

      <Text
        color="muted"
        id="whitelist-help-text"
        className="text-sm leading-relaxed"
      >
        Trusted domains exempt from all blocking and protection features.
        <br />
        <strong>Supported formats:</strong> example.com, *.example.com,
        localhost, 192.168.1.1
      </Text>

      <TagsInput.Root
        value={domains}
        onChange={handleDomainChange}
        validate={validateWhitelistDomain}
        placeholder="Add trusted domain..."
        size="md"
        variant="outline"
        disabled={disabled}
        maxLines={maxLines}
        className="w-full"
        aria-label="Domain whitelist input"
      >
        <TagsInput.Control>
          <TagsInput.Items />
          <TagsInput.Input
            placeholder="example.com, *.subdomain.com, localhost:3000"
            aria-describedby="whitelist-help-text"
          />
        </TagsInput.Control>
      </TagsInput.Root>
    </div>
  );
}
