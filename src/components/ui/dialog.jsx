import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { H2, Text } from "./typography";

const DialogContext = createContext(null);

const useDialogContext = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("Dialog components must be used within Dialog.Root");
  }
  return context;
};

/**
 * DialogRoot - Main Dialog wrapper with state management
 */
const DialogRoot = ({
  open = false,
  onOpenChange,
  className = "",
  children,
  ...props
}) => {
  const [isOpen, setIsOpen] = useState(open);

  useEffect(() => {
    setIsOpen(open);
  }, [open]);

  const handleOpenChange = (newOpen) => {
    setIsOpen(newOpen);
    onOpenChange?.(newOpen);
  };

  const contextValue = {
    isOpen,
    onOpenChange: handleOpenChange,
    onClose: () => handleOpenChange(false),
  };

  return (
    <DialogContext.Provider value={contextValue}>
      {children}
    </DialogContext.Provider>
  );
};

/**
 * DialogTrigger - Element that opens the dialog
 */
const DialogTrigger = ({ asChild = false, children, ...props }) => {
  const { onOpenChange } = useDialogContext();

  const handleClick = () => {
    onOpenChange?.(true);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: handleClick,
      ...props,
    });
  }

  return (
    <button onClick={handleClick} {...props}>
      {children}
    </button>
  );
};

/**
 * DialogContent - Main dialog container with overlay and animations
 */
const DialogContent = ({
  portalTarget = document.body, // NEW: Accept portal target for Shadow DOM support
  className = "",
  children,
  showCloseButton = true,
  maxWidth = "max-w-md",
  ...props
}) => {
  const { isOpen, onClose } = useDialogContext();
  const contentRef = useRef(null);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Trap focus within dialog while open
  useEffect(() => {
    if (!isOpen) return;

    const contentNode = contentRef.current;
    if (!contentNode) return;

    const previouslyFocused = document.activeElement;
    const focusableSelector =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    const getFocusableElements = () =>
      Array.from(contentNode.querySelectorAll(focusableSelector)).filter(
        (element) => !element.hasAttribute("disabled")
      );

    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    } else {
      contentNode.focus();
    }

    const handleTabKey = (event) => {
      if (event.key !== "Tab") return;

      const elements = getFocusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        contentNode.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      const isShift = event.shiftKey;

      if (isShift && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!isShift && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleTabKey);

    return () => {
      document.removeEventListener("keydown", handleTabKey);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`
        fixed inset-0 z-2147483647 flex items-center justify-center p-4
        bg-black/80 backdrop-blur-sm animate-in fade-in duration-200
        ${className}
      `}
      onClick={onClose}
      {...props}
    >
      <div
        className={`
          bg-white rounded-xl shadow-2xl ${maxWidth} w-full max-h-[90vh] overflow-y-auto
          animate-in zoom-in-95 duration-200 scale-100 relative
        `}
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {showCloseButton && <DialogClose />}
        {children}
      </div>
    </div>,
    portalTarget // Changed from document.body to support Shadow DOM
  );
};

/**
 * DialogHeader - Semantic header section
 */
const DialogHeader = ({ className = "", children, ...props }) => (
  <div className={`px-6 py-4 ${className}`} {...props}>
    {children}
  </div>
);

/**
 * DialogTitle - Accessible title component
 */
const DialogTitle = ({ className = "", children, ...props }) => (
  <H2 className={className} {...props}>
    {children}
  </H2>
);

/**
 * DialogDescription - Subtitle/description text
 */
const DialogDescription = ({ className = "", children, ...props }) => (
  <Text
    className={`text-sm text-gray-600 mt-1 leading-relaxed ${className}`}
    {...props}
  >
    {children}
  </Text>
);

/**
 * DialogContent main area - Content wrapper
 */
const DialogMain = ({ className = "", children, ...props }) => (
  <div className={`px-6 pb-4 ${className}`} {...props}>
    {children}
  </div>
);

/**
 * DialogFooter - Action buttons container
 */
const DialogFooter = ({ className = "", children, ...props }) => (
  <div
    className={`px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 ${className}`}
    {...props}
  >
    {children}
  </div>
);

/**
 * DialogClose - Close button component
 */
const DialogClose = ({ className = "", children, ...props }) => {
  const { onClose } = useDialogContext();

  if (children) {
    // Custom close button content
    return (
      <button type="button" onClick={onClose} className={className} {...props}>
        {children}
      </button>
    );
  }

  // Default close X button
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close dialog"
      className={`
        absolute top-4 right-4 text-gray-400 hover:text-gray-600
        focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2
        rounded-full p-1 transition-colors z-10
        ${className}
      `}
      {...props}
    >
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
          clipRule="evenodd"
        />
      </svg>
      <span className="sr-only">Close dialog</span>
    </button>
  );
};

// Compound component export
const Dialog = Object.assign(DialogRoot, {
  Root: DialogRoot,
  Trigger: DialogTrigger,
  Content: DialogContent,
  Header: DialogHeader,
  Title: DialogTitle,
  Description: DialogDescription,
  Main: DialogMain,
  Footer: DialogFooter,
  Close: DialogClose,
});

export default Dialog;
export {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogMain,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
};
