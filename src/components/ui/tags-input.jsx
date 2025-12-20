import { useState, useRef, useEffect, createContext, useContext, forwardRef } from 'react';

// Context for component communication
const TagsInputContext = createContext();

const useTagsInputContext = () => {
  const context = useContext(TagsInputContext);
  if (!context) {
    throw new Error('TagsInput components must be used within TagsInput.Root');
  }
  return context;
};

// Main TagsInput Root component
const TagsInputRoot = ({
  value,
  defaultValue = [],
  onChange,
  max = Infinity,
  delimiter = ',',
  validate,
  allowDuplicates = false,
  disabled = false,
  readOnly = false,
  size = 'md',
  variant = 'outline',
  addOnPaste = false,
  editable = true,
  blurBehavior = 'clear',
  className = '',
  children,
  ...props
}) => {
  const [tags, setTags] = useState(value || defaultValue);
  const [inputValue, setInputValue] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [editingIndex, setEditingIndex] = useState(-1);
  const [validationError, setValidationError] = useState('');
  const inputRef = useRef(null);

  // Handle controlled vs uncontrolled
  const isControlled = value !== undefined;
  const currentTags = isControlled ? value : tags;

  const updateTags = (newTags) => {
    if (!isControlled) {
      setTags(newTags);
    }
    onChange?.(newTags);
  };

  const addTag = (tagValue) => {
    const trimmedValue = tagValue.trim();
    setValidationError('');
    
    if (!trimmedValue) {
      setValidationError('Domain cannot be empty');
      return false;
    }

    // Check max limit
    if (currentTags.length >= max) {
      setValidationError(`Maximum ${max} domains allowed`);
      return false;
    }

    // Check duplicates
    if (!allowDuplicates && currentTags.includes(trimmedValue)) {
      setValidationError('Domain already exists in the list');
      return false;
    }

    // Validate tag with specific error messages
    if (validate && !validate(trimmedValue)) {
      setValidationError(getValidationErrorMessage(trimmedValue));
      return false;
    }

    updateTags([...currentTags, trimmedValue]);
    setValidationError('');
    return true;
  };

  const getValidationErrorMessage = (domain) => {
    // Pure numbers check
    if (/^\d+$/.test(domain)) {
      return 'Pure numbers are not valid domains. Try adding a TLD like ".com"';
    }
    
    // No dot check
    if (!domain.includes('.')) {
      return 'Domain must include a TLD (e.g., example.com)';
    }
    
    // Invalid characters or format
    if (!/^[a-zA-Z0-9.*:-]+$/.test(domain)) {
      return 'Domain contains invalid characters';
    }
    
    // Generic message for other validation failures
    return 'Invalid domain format. Use format like: example.com, *.example.com, or localhost:3000';
  };

  const removeTag = (index) => {
    updateTags(currentTags.filter((_, i) => i !== index));
  };

  const updateTag = (index, newValue) => {
    const trimmedValue = newValue.trim();
    if (!trimmedValue) {
      removeTag(index);
      return;
    }

    // Validate updated tag
    if (validate && !validate(trimmedValue)) return false;

    // Check duplicates (excluding current index)
    if (!allowDuplicates && currentTags.some((tag, i) => i !== index && tag === trimmedValue)) return false;

    const newTags = [...currentTags];
    newTags[index] = trimmedValue;
    updateTags(newTags);
    return true;
  };

  const handleInputKeyDown = (e) => {
    if (disabled || readOnly) return;

    switch (e.key) {
      case 'Enter':
      case delimiter:
        e.preventDefault();
        const trimmedValue = inputValue.trim();
        if (trimmedValue) {
          const success = addTag(trimmedValue);
          if (success) {
            setInputValue('');
          }
        }
        break;

      case 'Backspace':
        if (!inputValue && currentTags.length > 0) {
          if (focusedIndex >= 0) {
            removeTag(focusedIndex);
            setFocusedIndex(Math.min(focusedIndex, currentTags.length - 2));
          } else {
            setFocusedIndex(currentTags.length - 1);
          }
        }
        break;

      case 'ArrowLeft':
        if (!inputValue || e.target.selectionStart === 0) {
          e.preventDefault();
          setFocusedIndex(prev => 
            prev >= 0 ? Math.max(0, prev - 1) : currentTags.length - 1
          );
        }
        break;

      case 'ArrowRight':
        if (!inputValue || e.target.selectionStart === inputValue.length) {
          e.preventDefault();
          if (focusedIndex >= 0) {
            if (focusedIndex < currentTags.length - 1) {
              setFocusedIndex(prev => prev + 1);
            } else {
              setFocusedIndex(-1);
              inputRef.current?.focus();
            }
          }
        }
        break;

      case 'Escape':
        setFocusedIndex(-1);
        setEditingIndex(-1);
        break;
    }
  };

  const handleInputBlur = () => {
    if (blurBehavior === 'add' && inputValue && addTag(inputValue)) {
      setInputValue('');
    }
    setFocusedIndex(-1);
  };

  const handlePaste = (e) => {
    if (!addOnPaste) return;

    const paste = e.clipboardData.getData('text');
    const tags = paste.split(new RegExp(delimiter, 'g')).map(tag => tag.trim()).filter(Boolean);
    
    if (tags.length > 0) {
      e.preventDefault();
      tags.forEach(tag => addTag(tag));
      setInputValue('');
    }
  };

  const sizeStyles = {
    xs: 'text-xs px-2 py-1 min-h-[24px]',
    sm: 'text-sm px-3 py-1.5 min-h-[32px]',
    md: 'text-base px-3 py-2 min-h-[40px]',
    lg: 'text-lg px-4 py-2.5 min-h-[48px]'
  };

  const variantStyles = {
    outline: `border-2 ${validationError ? 'border-red-500 focus-within:border-red-600 focus-within:shadow-[0_0_0_1px_rgba(239,68,68,0.5)]' : 'border-gray-300 focus-within:border-blue-600 focus-within:shadow-[0_0_0_1px_rgba(59,130,246,0.5)]'} bg-white`,
    subtle: `border ${validationError ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'} focus-within:bg-white focus-within:border-gray-300`,
    flushed: `border-0 border-b-2 ${validationError ? 'border-red-500' : 'border-gray-300'} bg-transparent rounded-none focus-within:border-blue-600`
  };

  const contextValue = {
    tags: currentTags,
    inputValue,
    setInputValue,
    focusedIndex,
    setFocusedIndex,
    editingIndex,
    setEditingIndex,
    addTag,
    removeTag,
    updateTag,
    handleInputKeyDown,
    handleInputBlur,
    handlePaste,
    inputRef,
    disabled,
    readOnly,
    size,
    editable,
    validationError,
    setValidationError
  };

  return (
    <TagsInputContext.Provider value={contextValue}>
      <div>
        <div 
          className={`
            font-barlow flex flex-wrap items-center gap-1 rounded-md transition-all
            ${sizeStyles[size]}
            ${variantStyles[variant]}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            ${className}
          `}
          {...props}
        >
          {children}
        </div>
        {validationError && (
          <div className="mt-1 text-sm text-red-600 font-barlow">
            {validationError}
          </div>
        )}
      </div>
    </TagsInputContext.Provider>
  );
};

// Label component
const TagsInputLabel = ({ children, className = '', ...props }) => {
  return (
    <label 
      className={`block text-sm font-medium text-gray-700 mb-1 font-barlow ${className}`}
      {...props}
    >
      {children}
    </label>
  );
};

// Control container
const TagsInputControl = ({ children, className = '', ...props }) => {
  return (
    <div className={`flex flex-wrap items-center gap-1 w-full ${className}`} {...props}>
      {children}
    </div>
  );
};

// Input component
const TagsInputInput = forwardRef(({ 
  placeholder = 'Add tag...', 
  className = '', 
  ...props 
}, ref) => {
  const { 
    inputValue, 
    setInputValue, 
    handleInputKeyDown, 
    handleInputBlur, 
    handlePaste, 
    inputRef, 
    disabled, 
    readOnly,
    size,
    validationError,
    setValidationError 
  } = useTagsInputContext();

  const sizeStyles = {
    xs: 'text-xs px-1 py-0.5 min-w-[60px]',
    sm: 'text-sm px-1 py-1 min-w-[80px]',
    md: 'text-base px-1 py-1 min-w-[100px]',
    lg: 'text-lg px-1 py-1 min-w-[120px]'
  };

  return (
    <input
      ref={ref || inputRef}
      type="text"
      value={inputValue}
      onChange={(e) => {
        setInputValue(e.target.value);
        // Clear validation error when user starts typing
        if (validationError) {
          setValidationError('');
        }
      }}
      onKeyDown={handleInputKeyDown}
      onBlur={handleInputBlur}
      onPaste={handlePaste}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      className={`
        font-barlow flex-1 border-0 outline-none bg-transparent
        ${sizeStyles[size]}
        ${disabled ? 'cursor-not-allowed' : ''}
        ${className}
      `}
      {...props}
    />
  );
});

TagsInputInput.displayName = 'TagsInputInput';

// Tag component
const TagsInputTag = ({ 
  tag, 
  index, 
  onRemove, 
  className = '', 
  children,
  ...props 
}) => {
  const { 
    focusedIndex, 
    setFocusedIndex,
    editingIndex,
    setEditingIndex,
    updateTag,
    disabled,
    readOnly,
    size,
    editable
  } = useTagsInputContext();

  const [editValue, setEditValue] = useState(tag);
  const editInputRef = useRef(null);

  const isEditing = editingIndex === index;
  const isFocused = focusedIndex === index;

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  const handleEdit = () => {
    if (!editable || disabled || readOnly) return;
    setEditingIndex(index);
    setEditValue(tag);
  };

  const handleEditSubmit = () => {
    if (updateTag(index, editValue)) {
      setEditingIndex(-1);
    }
  };

  const handleEditKeyDown = (e) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        handleEditSubmit();
        break;
      case 'Escape':
        e.preventDefault();
        setEditingIndex(-1);
        setEditValue(tag);
        break;
    }
  };

  const sizeStyles = {
    xs: 'text-xs px-2 py-0.5 h-5',
    sm: 'text-sm px-2 py-1 h-6',
    md: 'text-sm px-3 py-1 h-7',
    lg: 'text-base px-3 py-1.5 h-8'
  };

  if (isEditing) {
    return (
      <span 
        className={`
          inline-flex items-center rounded-md bg-blue-100 border border-blue-300
          ${sizeStyles[size]}
          ${className}
        `}
        {...props}
      >
        <input
          ref={editInputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleEditKeyDown}
          onBlur={handleEditSubmit}
          className="bg-transparent border-0 outline-none text-blue-900 min-w-0 flex-1"
        />
      </span>
    );
  }

  return (
    <span 
      className={`
        inline-flex items-center rounded-md bg-gray-100 text-gray-800 group
        ${sizeStyles[size]}
        ${isFocused ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
        ${editable && !disabled && !readOnly ? 'cursor-pointer hover:bg-gray-200' : ''}
        ${className}
      `}
      onClick={handleEdit}
      onDoubleClick={handleEdit}
      {...props}
    >
      {children || (
        <>
          <TagsInputTagText>{tag}</TagsInputTagText>
          <TagsInputTagRemove 
            onRemove={() => onRemove?.(index)}
            disabled={disabled || readOnly}
          />
        </>
      )}
    </span>
  );
};

// Tag text component
const TagsInputTagText = ({ children, className = '', ...props }) => {
  return (
    <span 
      className={`truncate font-barlow ${className}`} 
      {...props}
    >
      {children}
    </span>
  );
};

// Tag remove button
const TagsInputTagRemove = ({ onRemove, disabled = false, className = '', ...props }) => {
  const { size } = useTagsInputContext();
  
  const sizeStyles = {
    xs: 'w-3 h-3 text-xs',
    sm: 'w-3.5 h-3.5 text-sm',
    md: 'w-4 h-4 text-sm',
    lg: 'w-4 h-4 text-base'
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (!disabled) {
      onRemove?.();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`
        ml-1 rounded-full hover:bg-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-400
        flex items-center justify-center transition-colors
        ${sizeStyles[size]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      {...props}
    >
      <svg viewBox="0 0 14 14" className="w-full h-full">
        <path
          fill="currentColor"
          d="m8.116 7 3.75 3.75-.884.884L7.232 7.884l-3.75 3.75-.884-.884L6.348 7l-3.75-3.75.884-.884 3.75 3.75L10.982 2.366l.884.884L8.116 7z"
        />
      </svg>
    </button>
  );
};

// Items shortcut component
const TagsInputItems = ({ className = '', ...props }) => {
  const { tags, removeTag } = useTagsInputContext();

  return (
    <>
      {tags.map((tag, index) => (
        <TagsInputTag
          key={`${tag}-${index}`}
          tag={tag}
          index={index}
          onRemove={removeTag}
          className={className}
          {...props}
        />
      ))}
    </>
  );
};

// Clear all button
const TagsInputClearTrigger = ({ 
  children, 
  className = '',
  ...props 
}) => {
  const { tags, updateTags, disabled, size } = useTagsInputContext();

  const handleClear = () => {
    if (!disabled) {
      updateTags([]);
    }
  };

  const sizeStyles = {
    xs: 'text-xs px-1.5 py-0.5',
    sm: 'text-sm px-2 py-1',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1'
  };

  if (tags.length === 0) return null;

  return (
    <button
      type="button"
      onClick={handleClear}
      disabled={disabled}
      className={`
        text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400
        rounded transition-colors
        ${sizeStyles[size]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      {...props}
    >
      {children || 'Clear all'}
    </button>
  );
};

// Context consumer for advanced usage
const TagsInputContext_ = ({ children }) => {
  const context = useTagsInputContext();
  return children(context);
};

// Main export with compound components
const TagsInput = Object.assign(TagsInputRoot, {
  Root: TagsInputRoot,
  Label: TagsInputLabel,
  Control: TagsInputControl,
  Input: TagsInputInput,
  Tag: TagsInputTag,
  TagText: TagsInputTagText,
  TagRemove: TagsInputTagRemove,
  Items: TagsInputItems,
  ClearTrigger: TagsInputClearTrigger,
  Context: TagsInputContext_
});

export default TagsInput;