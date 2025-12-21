const Button = ({ 
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  className = '',
  children,
  ...props 
}) => {
  const sizeStyles = {
    xs: 'px-2 py-1 text-xs',
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
    xl: 'px-8 py-4 text-xl'
  };

  const variantStyles = {
    primary: `
      bg-purple-600 text-white border border-purple-600
      hover:bg-purple-700 hover:border-purple-700
      focus:ring-purple-500
      disabled:bg-purple-300 disabled:border-purple-300
    `,
    secondary: `
      bg-white text-purple-600 border border-purple-600
      hover:bg-purple-50 hover:border-purple-700
      focus:ring-purple-500
      disabled:bg-gray-50 disabled:text-gray-400 disabled:border-gray-300
    `,
    outline: `
      bg-transparent text-gray-700 border border-gray-300
      hover:bg-gray-50 hover:border-gray-400
      focus:ring-gray-500
      disabled:bg-gray-50 disabled:text-gray-400 disabled:border-gray-200
    `,
    ghost: `
      bg-transparent text-gray-700 border border-transparent
      hover:bg-gray-100
      focus:ring-gray-500
      disabled:text-gray-400
    `,
    danger: `
      bg-red-600 text-white border border-red-600
      hover:bg-red-700 hover:border-red-700
      focus:ring-red-500
      disabled:bg-red-300 disabled:border-red-300
    `,
    success: `
      bg-green-600 text-white border border-green-600
      hover:bg-green-700 hover:border-green-700
      focus:ring-green-500
      disabled:bg-green-300 disabled:border-green-300
    `
  };

  const baseStyles = `
    inline-flex items-center justify-center font-medium rounded-md
    transition-all duration-200
    focus:outline-none focus:ring-2 focus:ring-offset-2
    ${disabled || loading ? 'cursor-not-allowed' : 'cursor-pointer'}
    ${fullWidth ? 'w-full' : ''}
  `;

  return (
    <button
      disabled={disabled || loading}
      className={`
        font-barlow
        ${baseStyles}
        ${sizeStyles[size]}
        ${variantStyles[variant]}
        ${className}
      `}
      {...props}
    >
      {loading && (
        <svg 
          className="animate-spin -ml-1 mr-2 h-4 w-4" 
          xmlns="http://www.w3.org/2000/svg" 
          fill="none" 
          viewBox="0 0 24 24"
        >
          <circle 
            className="opacity-25" 
            cx="12" 
            cy="12" 
            r="10" 
            stroke="currentColor" 
            strokeWidth="4"
          />
          <path 
            className="opacity-75" 
            fill="currentColor" 
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      
      {!loading && leftIcon && (
        <span className="mr-2">
          {leftIcon}
        </span>
      )}
      
      {children}
      
      {!loading && rightIcon && (
        <span className="ml-2">
          {rightIcon}
        </span>
      )}
    </button>
  );
};

export default Button;