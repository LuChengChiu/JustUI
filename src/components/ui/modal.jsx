import { useEffect, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

const ModalContext = createContext(null);

const useModalContext = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('Modal components must be used within Modal.Root');
  }
  return context;
};

const ModalRoot = ({
  isOpen,
  onClose,
  className = '',
  children,
  ...props
}) => {
  // Handle ESC key - only listener, no DOM manipulation
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const contextValue = { onClose };

  return createPortal(
    <ModalContext.Provider value={contextValue}>
      <div 
        className={`
          fixed inset-0 z-50 flex items-center justify-center p-4
          bg-black/50 backdrop-blur-sm
          ${className}
        `}
        onClick={onClose}
        {...props}
      >
        <div 
          className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </ModalContext.Provider>,
    document.getElementById('settings-root') || document.body
  );
};

const ModalHeader = ({ children, className = '', ...props }) => (
  <div 
    className={`px-6 py-4 border-b border-gray-200 font-barlow ${className}`} 
    {...props}
  >
    {children}
  </div>
);

const ModalTitle = ({ children, className = '', ...props }) => (
  <h2 
    className={`text-lg font-semibold text-gray-900 font-barlow ${className}`}
    {...props}
  >
    {children}
  </h2>
);

const ModalContent = ({ children, className = '', ...props }) => (
  <div 
    className={`px-6 py-4 font-barlow ${className}`}
    {...props}
  >
    {children}
  </div>
);

const ModalFooter = ({ children, className = '', ...props }) => (
  <div 
    className={`px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 font-barlow ${className}`}
    {...props}
  >
    {children}
  </div>
);

const ModalCloseButton = ({ className = '', ...props }) => {
  const { onClose } = useModalContext();

  return (
    <button
      type="button"
      onClick={onClose}
      className={`
        absolute top-4 right-4 text-gray-400 hover:text-gray-600
        focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
        rounded-full p-1 transition-colors
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
    </button>
  );
};

// Main export with compound components
const Modal = Object.assign(ModalRoot, {
  Root: ModalRoot,
  Header: ModalHeader,
  Title: ModalTitle,
  Content: ModalContent,
  Footer: ModalFooter,
  CloseButton: ModalCloseButton
});

export default Modal;