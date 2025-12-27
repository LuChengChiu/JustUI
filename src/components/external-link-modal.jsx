import React from "react";
import { createRoot } from "react-dom/client";
import AlertOctagon from "./icons/alert-octagon.jsx";
import ShieldLink from "./icons/shield-link.jsx";
import Button from "./ui/button/index.jsx";
import Dialog from "./ui/dialog.jsx";
import { H3, Text } from "./ui/typography.jsx";
import {
  createShadowDOMContainer,
  fetchCSSContent,
  injectCSSIntoShadow,
  injectGoogleFontsIntoShadow
} from "../utils/shadowDOM.js";

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
  isOpen = false,
  onClose,
  config = {},
  onAllow,
  onDeny,
  portalTarget = document.body, // NEW: Accept portal target for Shadow DOM support
}) {
  const { url: targetURL = "", threatDetails = null } = config;
  const { isPopUnder = false, riskScore = 0 } = threatDetails ?? {};

  const threatLevel = getThreatLevel(riskScore);

  // Handle user decisions
  const handleAllow = () => {
    onAllow?.();
    onClose?.();
  };

  const handleDeny = () => {
    onDeny?.();
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
  const [resolvePromise, setResolvePromise] = React.useState(null);

  const showModal = React.useCallback((modalConfig) => {
    return new Promise((resolve) => {
      setConfig(modalConfig);
      setIsOpen(true);
      setResolvePromise(() => resolve);
    });
  }, []);

  const handleAllow = React.useCallback(() => {
    if (resolvePromise) {
      resolvePromise(true);
      setResolvePromise(null);
    }
    setIsOpen(false);
  }, [resolvePromise]);

  const handleDeny = React.useCallback(() => {
    if (resolvePromise) {
      resolvePromise(false);
      setResolvePromise(null);
    }
    setIsOpen(false);
  }, [resolvePromise]);

  const handleClose = React.useCallback(() => {
    if (resolvePromise) {
      resolvePromise(false); // Default to deny when closed
      setResolvePromise(null);
    }
    setIsOpen(false);
  }, [resolvePromise]);

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
  return new Promise(async (resolve) => {
    let shadowDOMSetup = null;

    try {
      // Step 1: Create Shadow DOM container with portal target
      shadowDOMSetup = createShadowDOMContainer();
      const { container, shadowRoot, portalTarget } = shadowDOMSetup;

      // Step 2: Fetch CSS content
      const cssContent = await fetchCSSContent();

      // Step 3: Inject CSS and fonts in parallel into Shadow DOM
      await Promise.all([
        injectCSSIntoShadow(shadowRoot, cssContent),
        injectGoogleFontsIntoShadow(shadowRoot)
      ]);

      // Step 4: Create React root (on light DOM container for React internals)
      const root = createRoot(container);

      const cleanup = () => {
        root.unmount();
        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
      };

      const handleResult = (allowed) => {
        cleanup();
        resolve(allowed);
      };

      // Step 5: Render modal with Shadow DOM portal target
      root.render(
        React.createElement(ExternalLinkModal, {
          isOpen: true,
          config: config,
          portalTarget: portalTarget, // NEW: Pass Shadow DOM target
          onAllow: () => handleResult(true),
          onDeny: () => handleResult(false),
          onClose: () => handleResult(false),
        })
      );

    } catch (error) {
      console.error("OriginalUI: Failed to render React modal with Shadow DOM:", error);

      // Cleanup on error
      if (shadowDOMSetup?.container?.parentNode) {
        shadowDOMSetup.container.parentNode.removeChild(shadowDOMSetup.container);
      }

      resolve(false); // Default to deny on error
    }
  });
};
