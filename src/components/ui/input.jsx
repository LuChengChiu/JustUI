const Input = ({ 
  type = 'text',
  size = 'md',
  variant = 'outline',
  error = false,
  disabled = false,
  className = '',
  ...props 
}) => {
  const sizeStyles = {
    xs: 'px-2 py-1 text-xs',
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-3 py-2 text-base',
    lg: 'px-4 py-2.5 text-lg'
  };

  const variantStyles = {
    outline: `
      border border-gray-300 bg-white
      focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
      hover:border-gray-400
    `,
    filled: `
      border border-transparent bg-gray-100
      focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white
      hover:bg-gray-50
    `,
    flushed: `
      border-0 border-b border-gray-300 bg-transparent rounded-none px-0
      focus:outline-none focus:border-purple-500
      hover:border-gray-400
    `
  };

  const baseStyles = `
    w-full rounded-md transition-all duration-200
    placeholder-gray-400
    ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}
    ${error ? 'border-red-500 focus:ring-red-500' : ''}
  `;

  return (
    <input
      type={type}
      disabled={disabled}
      className={`
        font-barlow
        ${baseStyles}
        ${sizeStyles[size]}
        ${variantStyles[variant]}
        ${className}
      `}
      {...props}
    />
  );
};

export default Input;