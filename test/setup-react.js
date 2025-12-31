import { vi } from "vitest";

export const domTestUtils = {
  createModalContainer() {
    const container = document.createElement("div");
    container.id = "originalui-external-link-modal-root";
    const isDomNode =
      (typeof Node !== "undefined" && container instanceof Node) ||
      typeof container?.nodeType === "number";
    if (document.body && typeof document.body.appendChild === "function" && isDomNode) {
      document.body.appendChild(container);
    }

    return {
      element: container,
      destroy() {
        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
      },
    };
  },
};

export const reactTestUtils = {
  createMockRoot() {
    return {
      render: vi.fn(),
      unmount: vi.fn(),
      _container: null,
    };
  },
};
