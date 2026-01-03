import {
  createShadowDOMContainer,
  fetchCSSContent,
  injectCSSIntoShadow,
  injectBaseShadowStyles,
  injectFontsIntoDocument,
  injectGoogleFontsIntoShadow,
} from "@utils/shadow-dom.js";
import React from "react";
import { createRoot } from "react-dom/client";
import AlertOctagon from "./icons/alert-octagon.jsx";
import ShieldLink from "./icons/shield-link.jsx";
import Button from "./ui/button/index.jsx";
import Dialog from "./ui/dialog.jsx";
import { H3, Text } from "./ui/typography.jsx";
import Logger from "@script-utils/logger.js";

// Ensure React is available globally for JSX components in content script
if (typeof window !== "undefined" && !window.React) {
  window.React = React;
}

/**
 * ThreatDisplay Component - Shows security threat information
 */
const ThreatDisplay = ({ threatDetails, threatLevel, isPopUnder }) => {
  if (!threatDetails || !threatDetails.threats?.length) return null;

  const topThreats = threatDetails?.threats.slice(0, 3);

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
      <div className="flex items-center mb-2">
        <div className="flex gap-x-1 items-center">
          <AlertOctagon />

          <Text
            className="font-semibold text-sm"
            style={{ color: threatLevel.color }}
          >
            Threat Level: {threatLevel.level}
          </Text>
        </div>

        {isPopUnder && (
          <Text className="ml-2 bg-red-600 text-white px-2 py-1 rounded text-xs font-medium">
            POP-UNDER
          </Text>
        )}
      </div>

      <div className="text-sm text-red-800">
        <H3>Detected threats:</H3>
        <ul className="mt-1 ml-4 space-y-1">
          {topThreats.map((threat, index) => (
            <li key={index}>
              {threat.type} (Risk: {threat.score})
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

/**
 * URLDisplay Component - Safely displays the target URL
 */
const URLDisplay = ({ url }) => (
  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2">
    <Text className="break-all whitespace-pre-wrap italic">{url}</Text>
  </div>
);

// Calculate threat level
const getThreatLevel = (score) => {
  if (score >= 8) {
    return { level: "HIGH", color: "#dc2626" };
  }
  if (score >= 4) {
    return { level: "MEDIUM", color: "#d97706" };
  }
  return { level: "LOW", color: "#059669" };
};

/**
 * ExternalLinkModal Component - Navigation Guardian confirmation modal
 */
export default function ExternalLinkModal({
  isOpen,
  onClose,
  config = {},
  onAllow,
  onDeny,
  portalTarget = document.body, // NEW: Accept portal target for Shadow DOM support
}) {
  const { url: targetURL = "", threatDetails = null } = config;
  const { isPopUnder = false, riskScore = 0 } = threatDetails ?? {};

  const threatLevel = getThreatLevel(riskScore);

  // Remember choice state
  const [rememberChoice, setRememberChoice] = React.useState(false);

  // Handle user decisions
  const handleAllow = () => {
    onAllow?.(rememberChoice); // Pass remember flag
    onClose?.();
  };

  const handleDeny = () => {
    onDeny?.(rememberChoice); // Pass remember flag
    onClose?.();
  };

  // Handle escape key (handled by Dialog, but also Enter key)
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAllow(); // Enter = Allow (safer default in this context)
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <Dialog.Content
        portalTarget={portalTarget}
        maxWidth="max-w-lg"
        showCloseButton={false}
        onKeyDown={handleKeyDown}
        className="shadow-[1px_2px_3px_1px_var(--color-accent)]"
      >
        <Dialog.Header className="flex flex-col gap-y-1">
          <Dialog.Title className="flex gap-x-1 items-center">
            <ShieldLink className="!w-5.5 !h-5.5" /> Navigation Guardian
          </Dialog.Title>

          <Dialog.Description className="!text-[16px]">
            {isPopUnder
              ? "Blocked a pop-under advertisement attempting to open:"
              : "This page is trying to navigate to an external site:"}
          </Dialog.Description>
        </Dialog.Header>

        <Dialog.Main>
          <ThreatDisplay
            threatDetails={threatDetails}
            threatLevel={threatLevel}
            isPopUnder={isPopUnder}
          />

          <URLDisplay url={targetURL} />

          {/* Remember choice checkbox */}
          <div className="flex items-center gap-2 mt-3 mb-1">
            <input
              type="checkbox"
              id="remember-choice"
              checked={rememberChoice}
              onChange={(e) => setRememberChoice(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
            />
            <label
              htmlFor="remember-choice"
              className="text-sm text-gray-600 cursor-pointer select-none"
            >
              Remember this choice for 30 days
            </label>
          </div>
        </Dialog.Main>

        <Dialog.Footer>
          <Button
            variant="danger"
            onClick={handleDeny}
            autoFocus
            className="!font-days-one"
          >
            {isPopUnder ? "Block Ad" : "Block"}
          </Button>
          <Button
            variant="success"
            onClick={handleAllow}
            className="!font-days-one"
          >
            Allow
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

/**
 * Hook for managing ExternalLinkModal state
 */
export const useExternalLinkModal = () => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [config, setConfig] = React.useState({});
  const resolvePromiseRef = React.useRef(null);

  const showModal = React.useCallback((modalConfig) => {
    return new Promise((resolve) => {
      setConfig(modalConfig);
      setIsOpen(true);
      resolvePromiseRef.current = resolve;
    });
  }, []);

  const handleAllow = React.useCallback(() => {
    if (resolvePromiseRef.current) {
      resolvePromiseRef.current(true);
      resolvePromiseRef.current = null;
    }
    setIsOpen(false);
  }, []);

  const handleDeny = React.useCallback(() => {
    if (resolvePromiseRef.current) {
      resolvePromiseRef.current(false);
      resolvePromiseRef.current = null;
    }
    setIsOpen(false);
  }, []);

  const handleClose = React.useCallback(() => {
    if (resolvePromiseRef.current) {
      resolvePromiseRef.current(false); // Default to deny when closed
      resolvePromiseRef.current = null;
    }
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    config,
    showModal,
    onAllow: handleAllow,
    onDeny: handleDeny,
    onClose: handleClose,
  };
};

// Legacy injection functions removed - now using Shadow DOM utilities

/**
 * Standalone function for showing confirmation modal with Shadow DOM encapsulation
 * Used by ModalManager for content script integration
 */
export const showExternalLinkModal = async (config) => {
  return new Promise((resolve) => {
    let shadowDOMSetup = null;

    const setupModal = async () => {
      try {
        // Step 1: Inject fonts into main document <head> (global scope)
        // CRITICAL: Shadow DOM blocks font loading from chrome-extension:// URLs
        // Solution: Load fonts globally so Shadow DOM elements can use them
        injectFontsIntoDocument();

        // Step 2: Create Shadow DOM container with portal target
        shadowDOMSetup = createShadowDOMContainer();
        const { container, shadowRoot, portalTarget } = shadowDOMSetup;

        // Step 3: Inject base Shadow DOM typography styles
        // Sets font-family to use globally-loaded fonts
        injectBaseShadowStyles(shadowRoot);

        // Step 4: Inject CSS via <link> element and WAIT for it to load
        await injectCSSIntoShadow(shadowRoot);

        // Step 4: Create React root (on light DOM container for React internals)
        const root = createRoot(container);

        const cleanup = () => {
          root.unmount();
          if (container.parentNode) {
            container.parentNode.removeChild(container);
          }
        };

        const handleResult = (allowed, remember = false) => {
          cleanup();
          resolve({ allowed, remember }); // Return object with both values
        };

        // Step 5: Render modal with Shadow DOM portal target
        root.render(
          React.createElement(ExternalLinkModal, {
            isOpen: true,
            config: config,
            portalTarget: portalTarget, // NEW: Pass Shadow DOM target
            onAllow: (remember) => handleResult(true, remember),
            onDeny: (remember) => handleResult(false, remember),
            onClose: () => handleResult(false, false),
          })
        );
      } catch (error) {
        Logger.error(
          "ExternalLinkModal",
          "Failed to render React modal with Shadow DOM",
          error
        );

        // Cleanup on error
        if (shadowDOMSetup?.container?.parentNode) {
          shadowDOMSetup.container.parentNode.removeChild(
            shadowDOMSetup.container
          );
        }

        resolve({ allowed: false, remember: false }); // Default to deny on error
      }
    };

    setupModal();
  });
};
