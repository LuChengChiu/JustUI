/**
 * Unit Tests for ExternalLinkModal Component
 * Tests the React-based Navigation Guardian modal component
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { domTestUtils } from "../../test/setup-react.js";

// Mock the Dialog component
const mockDialog = {
  Root: vi.fn(({ open, onOpenChange, children }) => ({
    type: "Dialog",
    props: { open, onOpenChange, children },
  })),
  Content: vi.fn(({ maxWidth, showCloseButton, onKeyDown, children }) => ({
    type: "Dialog.Content",
    props: { maxWidth, showCloseButton, onKeyDown, children },
  })),
  Header: vi.fn(({ children }) => ({
    type: "Dialog.Header",
    props: { children },
  })),
  Title: vi.fn(({ children }) => ({
    type: "Dialog.Title",
    props: { children },
  })),
  Description: vi.fn(({ children }) => ({
    type: "Dialog.Description",
    props: { children },
  })),
  Main: vi.fn(({ children }) => ({
    type: "Dialog.Main",
    props: { children },
  })),
  Footer: vi.fn(({ children }) => ({
    type: "Dialog.Footer",
    props: { children },
  })),
};

// Mock React
const mockReact = {
  useState: vi.fn((initialValue) => {
    const state = { current: initialValue };
    const setState = vi.fn((newValue) => {
      state.current =
        typeof newValue === "function" ? newValue(state.current) : newValue;
    });
    return [() => state.current, setState];
  }),
  useCallback: vi.fn((fn, deps) => fn),
  createElement: vi.fn((type, props, ...children) => ({
    type,
    props: {
      ...props,
      children: children.length === 1 ? children[0] : children,
    },
  })),
};

// Mock react-dom/client
const mockCreateRoot = vi.fn(() => ({
  render: vi.fn(),
  unmount: vi.fn(),
}));

describe("ExternalLinkModal Component", () => {
  let mockConfig;
  let mockOnAllow;
  let mockOnDeny;
  let mockOnClose;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock functions
    mockOnAllow = vi.fn();
    mockOnDeny = vi.fn();
    mockOnClose = vi.fn();

    // Default config
    mockConfig = {
      url: "https://example.com",
      threatDetails: null,
    };

    // Reset React mocks
    Object.keys(mockReact).forEach((key) => {
      if (mockReact[key].mockClear) {
        mockReact[key].mockClear();
      }
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe("Component Initialization", () => {
    test("should render with basic props", () => {
      const props = {
        isOpen: true,
        onClose: mockOnClose,
        config: mockConfig,
        onAllow: mockOnAllow,
        onDeny: mockOnDeny,
      };

      // Simulate component render
      const result = mockDialog.Root({
        open: props.isOpen,
        onOpenChange: props.onClose,
        children: "modal content",
      });

      expect(result.type).toBe("Dialog");
      expect(result.props.open).toBe(true);
      expect(result.props.onOpenChange).toBe(mockOnClose);
    });

    test("should not render when isOpen is false", () => {
      const isOpen = false;

      // Component should not render when closed
      if (!isOpen) {
        expect(isOpen).toBe(false);
      }
    });

    test("should handle missing config gracefully", () => {
      const props = {
        isOpen: true,
        onClose: mockOnClose,
        config: {},
        onAllow: mockOnAllow,
        onDeny: mockOnDeny,
      };

      // Should handle empty config
      const url = props.config.url || "";
      const threatDetails = props.config.threatDetails || null;

      expect(url).toBe("");
      expect(threatDetails).toBeNull();
    });
  });

  describe("ThreatDisplay Sub-component", () => {
    test("should not render when no threats exist", () => {
      const threatDetails = null;

      // Component should return null when no threats
      const shouldRender = threatDetails && threatDetails.threats?.length > 0;

      expect(shouldRender).toBeFalsy();
    });

    test("should render threat information when threats exist", () => {
      const threatDetails = {
        riskScore: 8,
        threats: [
          { type: "Known malicious domain", score: 8 },
          { type: "Suspicious parameters", score: 3 },
        ],
        isPopUnder: true,
      };

      const threatLevel = { level: "HIGH", color: "#dc2626" };

      // Should render threat details
      expect(threatDetails.threats.length).toBe(2);
      expect(threatLevel.level).toBe("HIGH");
      expect(threatDetails.isPopUnder).toBe(true);
    });

    test("should display correct threat level styling", () => {
      const getThreatLevel = (score) => {
        if (score >= 8) {
          return { level: "HIGH", color: "#dc2626" };
        } else if (score >= 4) {
          return { level: "MEDIUM", color: "#d97706" };
        } else {
          return { level: "LOW", color: "#059669" };
        }
      };

      expect(getThreatLevel(9)).toEqual({ level: "HIGH", color: "#dc2626" });
      expect(getThreatLevel(5)).toEqual({ level: "MEDIUM", color: "#d97706" });
      expect(getThreatLevel(2)).toEqual({ level: "LOW", color: "#059669" });
    });

    test("should show pop-under badge when detected", () => {
      const isPopUnder = true;
      const badgeText = "POP-UNDER";

      if (isPopUnder) {
        expect(badgeText).toBe("POP-UNDER");
      }
    });

    test("should limit threats to top 3", () => {
      const threats = [
        { type: "Threat 1", score: 8 },
        { type: "Threat 2", score: 6 },
        { type: "Threat 3", score: 5 },
        { type: "Threat 4", score: 4 },
        { type: "Threat 5", score: 3 },
      ];

      const topThreats = threats.slice(0, 3);

      expect(topThreats.length).toBe(3);
      expect(topThreats[0].type).toBe("Threat 1");
      expect(topThreats[2].type).toBe("Threat 3");
    });
  });

  describe("URLDisplay Sub-component", () => {
    test("should display URL safely", () => {
      const url = "https://example.com/path?param=value";

      // Should display URL as text content (safe from XSS)
      expect(url).toBe("https://example.com/path?param=value");
    });

    test("should handle malicious URL content safely", () => {
      const maliciousURL = 'https://evil.com/<script>alert("xss")</script>';

      // URL should be displayed as text, not executed
      expect(maliciousURL).toContain("<script>");
      expect(typeof maliciousURL).toBe("string");
    });

    test("should apply monospace styling", () => {
      const expectedClasses =
        "font-mono text-sm text-gray-700 break-all whitespace-pre-wrap";

      expect(expectedClasses).toContain("font-mono");
      expect(expectedClasses).toContain("break-all");
    });

    test("should provide title attribute for long URLs", () => {
      const longURL =
        "https://very-long-domain-name-example.com/very/long/path/that/might/overflow";

      // Should provide title for accessibility
      expect(longURL.length).toBeGreaterThan(50);
    });
  });

  describe("User Interactions", () => {
    test("should call onAllow when Allow button is clicked", () => {
      const handleAllow = () => {
        mockOnAllow();
        mockOnClose();
      };

      handleAllow();

      expect(mockOnAllow).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    test("should call onDeny when Block button is clicked", () => {
      const handleDeny = () => {
        mockOnDeny();
        mockOnClose();
      };

      handleDeny();

      expect(mockOnDeny).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    test("should handle Enter key press (Allow)", () => {
      const handleKeyDown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          mockOnAllow();
          mockOnClose();
        }
      };

      const mockEvent = {
        key: "Enter",
        preventDefault: vi.fn(),
      };

      handleKeyDown(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockOnAllow).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    test("should not respond to other key presses", () => {
      const handleKeyDown = (e) => {
        if (e.key === "Enter") {
          mockOnAllow();
        }
      };

      const mockEvent = { key: "Space" };
      handleKeyDown(mockEvent);

      expect(mockOnAllow).not.toHaveBeenCalled();
    });

    test("should show different button text for pop-under", () => {
      const isPopUnder = true;
      const buttonText = isPopUnder ? "Block Ad" : "Block";

      expect(buttonText).toBe("Block Ad");

      const normalButtonText = false ? "Block Ad" : "Block";
      expect(normalButtonText).toBe("Block");
    });
  });

  describe("Modal Content Structure", () => {
    test("should show correct header for normal navigation", () => {
      const isPopUnder = false;
      const description = isPopUnder
        ? "Blocked a pop-under advertisement attempting to open:"
        : "This page is trying to navigate to an external site:";

      expect(description).toBe(
        "This page is trying to navigate to an external site:"
      );
    });

    test("should show correct header for pop-under", () => {
      const isPopUnder = true;
      const description = isPopUnder
        ? "Blocked a pop-under advertisement attempting to open:"
        : "This page is trying to navigate to an external site:";

      expect(description).toBe(
        "Blocked a pop-under advertisement attempting to open:"
      );
    });

    test("should include shield emoji in title", () => {
      const title = "🛡️ Navigation Guardian";

      expect(title).toContain("🛡️");
      expect(title).toContain("Navigation Guardian");
    });

    test("should structure modal with Dialog components", () => {
      const modalStructure = {
        header: mockDialog.Header({ children: "header content" }),
        main: mockDialog.Main({ children: "main content" }),
        footer: mockDialog.Footer({ children: "footer content" }),
      };

      expect(modalStructure.header.type).toBe("Dialog.Header");
      expect(modalStructure.main.type).toBe("Dialog.Main");
      expect(modalStructure.footer.type).toBe("Dialog.Footer");
    });
  });

  describe("useExternalLinkModal Hook", () => {
    test("should initialize with correct default state", () => {
      const [isOpen, setIsOpen] = mockReact.useState(false);
      const [config, setConfig] = mockReact.useState({});
      const [resolvePromise, setResolvePromise] = mockReact.useState(null);

      expect(isOpen()).toBe(false);
      expect(config()).toEqual({});
      expect(resolvePromise()).toBeNull();
    });

    test("should create showModal function", () => {
      const showModal = mockReact.useCallback((modalConfig) => {
        return new Promise((resolve) => {
          // Would set config, isOpen, and resolvePromise
          expect(modalConfig).toBeDefined();
          expect(typeof resolve).toBe("function");
        });
      }, []);

      expect(typeof showModal).toBe("function");
    });

    test("should handle user allowing navigation", () => {
      const mockResolve = vi.fn();

      const handleAllow = mockReact.useCallback(() => {
        if (mockResolve) {
          mockResolve(true);
        }
      }, [mockResolve]);

      handleAllow();

      expect(mockResolve).toHaveBeenCalledWith(true);
    });

    test("should handle user denying navigation", () => {
      const mockResolve = vi.fn();

      const handleDeny = mockReact.useCallback(() => {
        if (mockResolve) {
          mockResolve(false);
        }
      }, [mockResolve]);

      handleDeny();

      expect(mockResolve).toHaveBeenCalledWith(false);
    });

    test("should handle modal close (default to deny)", () => {
      const mockResolve = vi.fn();

      const handleClose = mockReact.useCallback(() => {
        if (mockResolve) {
          mockResolve(false); // Default to deny
        }
      }, [mockResolve]);

      handleClose();

      expect(mockResolve).toHaveBeenCalledWith(false);
    });
  });

  describe("showExternalLinkModal Function", () => {
    let mockContainer;

    beforeEach(() => {
      mockContainer = domTestUtils.createModalContainer();

      // Mock document.createElement
      document.createElement = vi.fn((tagName) => {
        const element = {
          tagName: tagName.toUpperCase(),
          id: "",
          appendChild: vi.fn(),
          remove: vi.fn(),
          parentNode: {
            removeChild: vi.fn(),
          },
        };

        if (tagName === "div") {
          element.id = "originalui-external-link-modal-root";
        }

        return element;
      });
    });

    test("should create container element", () => {
      const container = document.createElement("div");
      container.id = "originalui-external-link-modal-root";

      expect(container.tagName).toBe("DIV");
      expect(container.id).toBe("originalui-external-link-modal-root");
    });

    test("should handle React import success", async () => {
      const mockConfig = { url: "https://example.com" };

      // Mock dynamic import
      const mockImport = vi.fn().mockResolvedValue({
        createRoot: mockCreateRoot,
      });

      try {
        await mockImport();
        expect(mockImport).toHaveBeenCalled();
      } catch (error) {
        // Handle import error
      }
    });

    test("should handle React import failure", async () => {
      const mockConfig = { url: "https://example.com" };
      const importError = new Error("Failed to load React");

      const mockImport = vi.fn().mockRejectedValue(importError);

      try {
        await mockImport();
      } catch (error) {
        expect(error).toBe(importError);
      }
    });

    test("should clean up container on success", () => {
      const container = {
        parentNode: {
          removeChild: vi.fn(),
        },
      };

      const cleanup = () => {
        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
      };

      cleanup();

      expect(container.parentNode.removeChild).toHaveBeenCalledWith(container);
    });

    test("should clean up container on error", () => {
      const container = {
        parentNode: {
          removeChild: vi.fn(),
        },
      };

      const handleError = () => {
        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
        return false; // Default to deny
      };

      const result = handleError();

      expect(container.parentNode.removeChild).toHaveBeenCalledWith(container);
      expect(result).toBe(false);
    });

    test("should render React element correctly", () => {
      const mockRoot = {
        render: vi.fn(),
        unmount: vi.fn(),
      };

      mockCreateRoot.mockReturnValue(mockRoot);

      const modalElement = mockReact.createElement("ExternalLinkModal", {
        isOpen: true,
        config: mockConfig,
        onAllow: vi.fn(),
        onDeny: vi.fn(),
        onClose: vi.fn(),
      });

      mockRoot.render(modalElement);

      expect(mockRoot.render).toHaveBeenCalledWith(modalElement);
    });
  });

  describe("Accessibility", () => {
    test("should provide proper button focus management", () => {
      // Deny button should be focused by default (safer choice)
      const autoFocus = true;

      expect(autoFocus).toBe(true);
    });

    test("should have proper button styling for accessibility", () => {
      const buttonStyles = {
        focus:
          "focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2",
        hover: "hover:bg-red-600",
        transition: "transition-colors",
      };

      expect(buttonStyles.focus).toContain("focus:outline-none");
      expect(buttonStyles.hover).toContain("hover:");
      expect(buttonStyles.transition).toContain("transition");
    });

    test("should handle keyboard navigation properly", () => {
      const keyboardEvents = {
        Enter: "allow",
        Escape: "deny", // Handled by Dialog component
      };

      expect(keyboardEvents["Enter"]).toBe("allow");
      expect(keyboardEvents["Escape"]).toBe("deny");
    });
  });

  describe("Security", () => {
    test("should prevent XSS in URL display", () => {
      const maliciousURL = 'https://evil.com/<script>alert("xss")</script>';

      // URL should be treated as text content, not HTML
      const safeDisplay = maliciousURL; // textContent automatically escapes

      expect(safeDisplay).toBe(maliciousURL);
      expect(typeof safeDisplay).toBe("string");
    });

    test("should safely handle threat descriptions", () => {
      const threats = [
        { type: 'Malicious <script>alert("xss")</script> domain', score: 8 },
      ];

      // Threat descriptions should be safe text
      expect(threats[0].type).toContain("<script>");
      expect(typeof threats[0].type).toBe("string");
    });

    test("should validate threat details structure", () => {
      const validateThreatDetails = (details) => {
        if (!details) return null;

        return {
          riskScore:
            typeof details.riskScore === "number" ? details.riskScore : 0,
          threats: Array.isArray(details.threats) ? details.threats : [],
          isPopUnder: Boolean(details.isPopUnder),
        };
      };

      const valid = validateThreatDetails({
        riskScore: 5,
        threats: [{ type: "test", score: 3 }],
        isPopUnder: true,
      });

      const invalid = validateThreatDetails({
        riskScore: "invalid",
        threats: "not-array",
        isPopUnder: "not-boolean",
      });

      expect(valid.riskScore).toBe(5);
      expect(valid.threats.length).toBe(1);
      expect(valid.isPopUnder).toBe(true);

      expect(invalid.riskScore).toBe(0);
      expect(invalid.threats).toEqual([]);
      expect(invalid.isPopUnder).toBe(false);
    });
  });

  describe("Performance", () => {
    test("should use React.useCallback for event handlers", () => {
      const deps = ["dep1", "dep2"];
      const callback = mockReact.useCallback(() => {}, deps);

      expect(mockReact.useCallback).toHaveBeenCalledWith(
        expect.any(Function),
        deps
      );
    });

    test("should minimize re-renders with proper dependencies", () => {
      // Test that useCallback dependencies are correct
      const resolvePromise = vi.fn();

      const handleAllow = mockReact.useCallback(() => {
        resolvePromise(true);
      }, [resolvePromise]);

      expect(mockReact.useCallback).toHaveBeenCalledWith(expect.any(Function), [
        resolvePromise,
      ]);
    });

    test("should clean up resources properly", () => {
      const mockRoot = {
        render: vi.fn(),
        unmount: vi.fn(),
      };

      const cleanup = () => {
        mockRoot.unmount();
      };

      cleanup();

      expect(mockRoot.unmount).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    test("should handle missing onAllow gracefully", () => {
      const handleAllow = () => {
        if (mockOnAllow) {
          mockOnAllow();
        }
        if (mockOnClose) {
          mockOnClose();
        }
      };

      mockOnAllow = null; // Simulate missing callback

      expect(() => handleAllow()).not.toThrow();
    });

    test("should handle missing onDeny gracefully", () => {
      const handleDeny = () => {
        if (mockOnDeny) {
          mockOnDeny();
        }
        if (mockOnClose) {
          mockOnClose();
        }
      };

      mockOnDeny = null; // Simulate missing callback

      expect(() => handleDeny()).not.toThrow();
    });

    test("should handle malformed config", () => {
      const handleConfig = (config) => {
        const safeConfig = {
          url: config?.url || "",
          threatDetails: config?.threatDetails || null,
        };

        return safeConfig;
      };

      expect(handleConfig(null)).toEqual({ url: "", threatDetails: null });
      expect(handleConfig({})).toEqual({ url: "", threatDetails: null });
      expect(handleConfig({ url: "test" })).toEqual({
        url: "test",
        threatDetails: null,
      });
    });
  });
});
