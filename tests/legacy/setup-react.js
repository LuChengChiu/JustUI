/**
 * React Testing Setup
 * Enhanced setup for testing React components in Chrome extension environment
 */

import { vi } from "vitest";

// Mock React and ReactDOM for testing
vi.mock("react", async () => {
  const actual = await vi.importActual("react");
  return {
    ...actual,
    useState: vi.fn(),
    useEffect: vi.fn(),
    useCallback: vi.fn(),
    createContext: vi.fn(),
    useContext: vi.fn(),
    isValidElement: vi.fn(),
    cloneElement: vi.fn(),
    createElement: vi.fn(),
  };
});

vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(),
    unmount: vi.fn(),
  })),
}));

vi.mock("react-dom", () => ({
  createPortal: vi.fn((children, container) => {
    // Mock portal by directly appending to container
    if (container && typeof container.appendChild === "function") {
      const portalElement = { type: "portal", children };
      container.appendChild(portalElement);
      return portalElement;
    }
    return children;
  }),
}));

// React testing utilities
export const reactTestUtils = {
  /**
   * Create a mock React component
   */
  createMockComponent: (name = "MockComponent") => {
    return vi.fn(({ children, ...props }) => ({
      type: name,
      props: { ...props, children },
      key: null,
      ref: null,
    }));
  },

  /**
   * Mock React hooks for testing
   */
  mockHooks: {
    useState: (initialValue) => {
      const state = { current: initialValue };
      const setState = vi.fn((newValue) => {
        state.current =
          typeof newValue === "function" ? newValue(state.current) : newValue;
      });
      return [() => state.current, setState];
    },

    useEffect: vi.fn((effect, deps) => {
      if (typeof effect === "function") {
        const cleanup = effect();
        return { cleanup, deps };
      }
      return { cleanup: null, deps };
    }),

    useCallback: vi.fn((callback, deps) => {
      return { callback, deps };
    }),

    useContext: vi.fn((context) => context?.defaultValue || {}),
  },

  /**
   * Create mock React root for testing
   */
  createMockRoot: () => {
    const root = {
      render: vi.fn(),
      unmount: vi.fn(),
      _rendered: null,
      _container: null,
    };

    root.render.mockImplementation((component) => {
      root._rendered = component;
    });

    root.unmount.mockImplementation(() => {
      root._rendered = null;
      if (root._container?.parentNode) {
        root._container.parentNode.removeChild(root._container);
      }
    });

    return root;
  },

  /**
   * Mock React.createElement for component testing
   */
  createElement: vi.fn((type, props = {}, ...children) => ({
    type,
    props: {
      ...props,
      children: children.length === 1 ? children[0] : children,
    },
    key: props?.key || null,
    ref: props?.ref || null,
  })),

  /**
   * Simulate component props
   */
  createProps: (overrides = {}) => ({
    key: null,
    ref: null,
    children: null,
    ...overrides,
  }),

  /**
   * Mock component lifecycle for testing
   */
  mockComponentLifecycle: () => {
    const lifecycle = {
      mounted: false,
      effects: [],
      cleanups: [],
    };

    const mount = vi.fn(() => {
      lifecycle.mounted = true;
      lifecycle.effects.forEach((effect) => {
        if (typeof effect === "function") {
          const cleanup = effect();
          if (typeof cleanup === "function") {
            lifecycle.cleanups.push(cleanup);
          }
        }
      });
    });

    const unmount = vi.fn(() => {
      lifecycle.mounted = false;
      lifecycle.cleanups.forEach((cleanup) => {
        try {
          cleanup();
        } catch (error) {
          console.warn("Cleanup error:", error);
        }
      });
      lifecycle.effects = [];
      lifecycle.cleanups = [];
    });

    return { lifecycle, mount, unmount };
  },
};

// Enhanced DOM testing utilities for React
export const domTestUtils = {
  /**
   * Create a modal container for testing
   */
  createModalContainer: () => {
    const container = document.createElement("div");
    container.id = "originalui-external-link-modal-root";
    document.body.appendChild(container);

    // Enhanced container with React portal support
    const originalAppendChild = container.appendChild.bind(container);
    const originalRemoveChild = container.removeChild.bind(container);

    container.appendChild = vi.fn((element) => {
      container._children = [...(container._children || []), element];
      return originalAppendChild(element);
    });

    container.removeChild = vi.fn((element) => {
      container._children = (container._children || []).filter(
        (child) => child !== element
      );
      return originalRemoveChild(element);
    });

    container.destroy = () => {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    };

    return container;
  },

  /**
   * Mock DOM element with enhanced features
   */
  createEnhancedElement: (tagName = "div") => {
    const element = document.createElement(tagName);

    // Add React-specific properties
    element._reactInternalInstance = {};
    element._reactEventHandlers = new Map();

    // Track style changes
    const originalStyle = element.style;
    element._styleHistory = [];

    Object.defineProperty(element, "style", {
      get: () => originalStyle,
      set: (value) => {
        element._styleHistory.push(value);
        originalStyle.cssText = value;
      },
    });

    // Track class changes
    element._classHistory = [];
    const originalSetAttribute = element.setAttribute.bind(element);

    element.setAttribute = vi.fn((name, value) => {
      if (name === "class") {
        element._classHistory.push(value);
      }
      return originalSetAttribute(name, value);
    });

    return element;
  },

  /**
   * Simulate keyboard events
   */
  simulateKeyEvent: (element, type, key, options = {}) => {
    const event = new KeyboardEvent(type, {
      key,
      code: `Key${key.toUpperCase()}`,
      bubbles: true,
      cancelable: true,
      ...options,
    });

    // Mock preventDefault and stopPropagation
    event.preventDefault = vi.fn();
    event.stopPropagation = vi.fn();

    element.dispatchEvent(event);
    return event;
  },

  /**
   * Simulate mouse events
   */
  simulateMouseEvent: (element, type, options = {}) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 100,
      ...options,
    });

    event.preventDefault = vi.fn();
    event.stopPropagation = vi.fn();

    element.dispatchEvent(event);
    return event;
  },
};

// Global setup for React testing
export const setupReactTesting = () => {
  // Add React test utilities to global scope
  global.reactTestUtils = reactTestUtils;
  global.domTestUtils = domTestUtils;

  // Mock body scroll control
  Object.defineProperty(document.body.style, "overflow", {
    get: vi.fn(() => "visible"),
    set: vi.fn(),
    configurable: true,
  });

  // Mock window getComputedStyle for layout tests
  global.getComputedStyle = vi.fn(() => ({
    getPropertyValue: vi.fn(() => ""),
    display: "block",
    visibility: "visible",
  }));

  // Mock ResizeObserver for responsive components
  global.ResizeObserver = vi.fn(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  console.log("React testing environment initialized");
};

// Auto-setup when imported
setupReactTesting();
