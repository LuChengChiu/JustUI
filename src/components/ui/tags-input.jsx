import {
  useState,
  useRef,
  useEffect,
  createContext,
  useContext,
  forwardRef,
  useCallback,
  useMemo,
  useReducer,
} from "react";

const TagsInputContext = createContext(null);

// Action types for reducer
const ACTIONS = {
  SET_INPUT_VALUE: 'SET_INPUT_VALUE',
  ADD_TAG: 'ADD_TAG',
  REMOVE_TAG: 'REMOVE_TAG',
  UPDATE_TAG: 'UPDATE_TAG',
  SET_FOCUSED_INDEX: 'SET_FOCUSED_INDEX',
  SET_EDITING_INDEX: 'SET_EDITING_INDEX',
  SET_VALIDATION_ERROR: 'SET_VALIDATION_ERROR',
  CLEAR_VALIDATION_ERROR: 'CLEAR_VALIDATION_ERROR',
  CLEAR_INPUT: 'CLEAR_INPUT',
  UPDATE_TAGS: 'UPDATE_TAGS',
  RESET_FOCUS: 'RESET_FOCUS',
};

// Validation helper
const getValidationErrorMessage = (domain) => {
  if (/^\d+$/.test(domain)) {
    return 'Pure numbers are not valid domains. Try adding a TLD like ".com"';
  }

  if (!domain.includes(".")) {
    return "Domain must include a TLD (e.g., example.com)";
  }

  if (!/^[a-zA-Z0-9.*:-]+$/.test(domain)) {
    return "Domain contains invalid characters";
  }

  return "Invalid domain format. Use format like: example.com, *.example.com, or localhost:3000";
};

// Reducer function - pure, testable, no closures
function tagsInputReducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_INPUT_VALUE:
      return {
        ...state,
        inputValue: action.payload,
        validationError: state.validationError ? '' : state.validationError,
      };

    case ACTIONS.ADD_TAG: {
      const { value, currentTags, max, allowDuplicates, validate } = action.payload;
      const trimmedValue = value.trim();

      if (!trimmedValue) {
        return { ...state, validationError: "Domain cannot be empty" };
      }

      if (currentTags.length >= max) {
        return { ...state, validationError: `Maximum ${max} domains allowed` };
      }

      if (!allowDuplicates && currentTags.includes(trimmedValue)) {
        return { ...state, validationError: "Domain already exists in the list" };
      }

      if (validate && !validate(trimmedValue)) {
        return { ...state, validationError: getValidationErrorMessage(trimmedValue) };
      }

      return { ...state, validationError: '' };
    }

    case ACTIONS.REMOVE_TAG: {
      const { index, currentTagsLength } = action.payload;
      return {
        ...state,
        focusedIndex: state.focusedIndex >= 0
          ? Math.min(state.focusedIndex, currentTagsLength - 2)
          : state.focusedIndex,
      };
    }

    case ACTIONS.UPDATE_TAG:
      return state;

    case ACTIONS.SET_FOCUSED_INDEX:
      return { ...state, focusedIndex: action.payload };

    case ACTIONS.SET_EDITING_INDEX:
      return { ...state, editingIndex: action.payload };

    case ACTIONS.SET_VALIDATION_ERROR:
      return { ...state, validationError: action.payload };

    case ACTIONS.CLEAR_VALIDATION_ERROR:
      return { ...state, validationError: '' };

    case ACTIONS.CLEAR_INPUT:
      return { ...state, inputValue: '' };

    case ACTIONS.RESET_FOCUS:
      return { ...state, focusedIndex: -1, editingIndex: -1 };

    default:
      return state;
  }
}

const useTagsInputContext = () => {
  const context = useContext(TagsInputContext);
  if (!context) {
    throw new Error("TagsInput components must be used within TagsInput.Root");
  }
  return context;
};

const TagsInputRoot = ({
  value,
  defaultValue = [],
  onChange,
  onTagClick,
  max = Infinity,
  maxLines = Infinity,
  delimiter = ",",
  validate,
  allowDuplicates = false,
  disabled = false,
  readOnly = false,
  size = "md",
  variant = "outline",
  addOnPaste = false,
  editable = true,
  blurBehavior = "clear",
  className = "",
  children,
  ...props
}) => {
  const [tags, setTags] = useState(value || defaultValue);
  const inputRef = useRef(null);

  // Use reducer for UI state (eliminates stale closures)
  const [state, dispatch] = useReducer(tagsInputReducer, {
    inputValue: "",
    focusedIndex: -1,
    editingIndex: -1,
    validationError: "",
  });

  // Handle controlled vs uncontrolled
  const isControlled = value !== undefined;
  const currentTags = isControlled ? value : tags;

  const updateTags = useCallback(
    (newTags) => {
      if (!isControlled) {
        setTags(newTags);
      }
      onChange?.(newTags);
    },
    [isControlled, onChange]
  );

  const addTag = useCallback(
    (tagValue) => {
      // Dispatch validation action
      dispatch({
        type: ACTIONS.ADD_TAG,
        payload: { value: tagValue, currentTags, max, allowDuplicates, validate },
      });

      // Check if validation passed
      const trimmedValue = tagValue.trim();
      if (!trimmedValue) return false;
      if (currentTags.length >= max) return false;
      if (!allowDuplicates && currentTags.includes(trimmedValue)) return false;
      if (validate && !validate(trimmedValue)) return false;

      // Update tags if validation passed
      updateTags([...currentTags, trimmedValue]);
      return true;
    },
    [currentTags, max, allowDuplicates, validate, updateTags]
  );

  const removeTag = useCallback(
    (index) => {
      const newTags = currentTags.filter((_, i) => i !== index);
      updateTags(newTags);
      dispatch({ type: ACTIONS.REMOVE_TAG, payload: { index, currentTagsLength: currentTags.length } });
    },
    [currentTags, updateTags]
  );

  const updateTag = useCallback(
    (index, newValue) => {
      const trimmedValue = newValue.trim();
      if (!trimmedValue) {
        removeTag(index);
        return;
      }

      if (validate && !validate(trimmedValue)) return false;

      if (
        !allowDuplicates &&
        currentTags.some((tag, i) => i !== index && tag === trimmedValue)
      )
        return false;

      const newTags = [...currentTags];
      newTags[index] = trimmedValue;
      updateTags(newTags);
      return true;
    },
    [currentTags, allowDuplicates, validate, removeTag, updateTags]
  );

  // Stable event handler with ref for current state - no recreations on keystroke!
  const stateRef = useRef(state);
  const currentTagsRef = useRef(currentTags);

  useEffect(() => {
    stateRef.current = state;
    currentTagsRef.current = currentTags;
  });

  const handleInputKeyDown = useCallback(
    (e) => {
      if (disabled || readOnly) return;

      const currentState = stateRef.current;
      const tags = currentTagsRef.current;

      switch (e.key) {
        case "Enter":
        case delimiter:
          e.preventDefault();
          if (currentState.inputValue.trim()) {
            const success = addTag(currentState.inputValue.trim());
            if (success) {
              dispatch({ type: ACTIONS.CLEAR_INPUT });
            }
          }
          break;

        case "Backspace":
          if (!currentState.inputValue && tags.length > 0) {
            if (currentState.focusedIndex >= 0) {
              removeTag(currentState.focusedIndex);
            } else {
              dispatch({ type: ACTIONS.SET_FOCUSED_INDEX, payload: tags.length - 1 });
            }
          }
          break;

        case "ArrowLeft":
          if (!currentState.inputValue || e.target.selectionStart === 0) {
            e.preventDefault();
            const newIndex = currentState.focusedIndex >= 0
              ? Math.max(0, currentState.focusedIndex - 1)
              : tags.length - 1;
            dispatch({ type: ACTIONS.SET_FOCUSED_INDEX, payload: newIndex });
          }
          break;

        case "ArrowRight":
          if (!currentState.inputValue || e.target.selectionStart === currentState.inputValue.length) {
            e.preventDefault();
            if (currentState.focusedIndex >= 0) {
              if (currentState.focusedIndex < tags.length - 1) {
                dispatch({ type: ACTIONS.SET_FOCUSED_INDEX, payload: currentState.focusedIndex + 1 });
              } else {
                dispatch({ type: ACTIONS.SET_FOCUSED_INDEX, payload: -1 });
                inputRef.current?.focus();
              }
            }
          }
          break;

        case "Escape":
          dispatch({ type: ACTIONS.RESET_FOCUS });
          break;
      }
    },
    [disabled, readOnly, delimiter, addTag, removeTag]
  );

  const handleInputBlur = useCallback(() => {
    const currentState = stateRef.current;
    if (blurBehavior === "add" && currentState.inputValue && addTag(currentState.inputValue)) {
      dispatch({ type: ACTIONS.CLEAR_INPUT });
    }
    dispatch({ type: ACTIONS.SET_FOCUSED_INDEX, payload: -1 });
  }, [blurBehavior, addTag]);

  const handlePaste = useCallback(
    (e) => {
      if (!addOnPaste) return;

      const paste = e.clipboardData.getData("text");
      const tags = paste
        .split(new RegExp(delimiter, "g"))
        .map((tag) => tag.trim())
        .filter(Boolean);

      if (tags.length > 0) {
        e.preventDefault();
        tags.forEach((tag) => addTag(tag));
        dispatch({ type: ACTIONS.CLEAR_INPUT });
      }
    },
    [addOnPaste, delimiter, addTag]
  );

  const sizeStyles = {
    xs: "text-xs px-2 py-1 min-h-[24px]",
    sm: "text-sm px-3 py-1.5 min-h-[32px]",
    md: "text-base px-3 py-2 min-h-[40px]",
    lg: "text-lg px-4 py-2.5 min-h-[48px]",
  };

  const variantStyles = useMemo(
    () => ({
      outline: `border-2 ${
        state.validationError
          ? "border-red-500 focus-within:border-red-600 focus-within:shadow-[0_0_0_1px_rgba(239,68,68,0.5)]"
          : "border-gray-300 focus-within:border-primary focus-within:shadow-[0_0_0_1px_rgba(59,130,246,0.5)]"
      } bg-white`,
      subtle: `border ${
        state.validationError
          ? "border-red-300 bg-red-50"
          : "border-gray-200 bg-gray-50"
      } focus-within:bg-white focus-within:border-gray-300`,
      flushed: `border-0 border-b-2 ${
        state.validationError ? "border-red-500" : "border-gray-300"
      } bg-transparent rounded-none focus-within:border-primary`,
    }),
    [state.validationError]
  );

  const contextValue = useMemo(
    () => ({
      tags: currentTags,
      inputValue: state.inputValue,
      setInputValue: (value) => dispatch({ type: ACTIONS.SET_INPUT_VALUE, payload: value }),
      focusedIndex: state.focusedIndex,
      setFocusedIndex: (index) => dispatch({ type: ACTIONS.SET_FOCUSED_INDEX, payload: index }),
      editingIndex: state.editingIndex,
      setEditingIndex: (index) => dispatch({ type: ACTIONS.SET_EDITING_INDEX, payload: index }),
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
      validationError: state.validationError,
      setValidationError: (error) => dispatch({ type: ACTIONS.SET_VALIDATION_ERROR, payload: error }),
      onTagClick,
      maxLines,
    }),
    [
      currentTags,
      state,
      addTag,
      removeTag,
      updateTag,
      handleInputKeyDown,
      handleInputBlur,
      handlePaste,
      disabled,
      readOnly,
      size,
      editable,
      onTagClick,
      maxLines,
    ]
  );

  return (
    <TagsInputContext.Provider value={contextValue}>
      <div>
        <div
          className={`
            font-barlow flex flex-wrap items-center gap-1 rounded-md transition-all
            ${sizeStyles[size]}
            ${variantStyles[variant]}
            ${disabled ? "opacity-50 cursor-not-allowed" : ""}
            ${className}
          `}
          {...props}
        >
          {children}
        </div>
        {state.validationError && (
          <div className="mt-1 text-sm text-red-600 font-barlow">
            {state.validationError}
          </div>
        )}
      </div>
    </TagsInputContext.Provider>
  );
};

const TagsInputLabel = ({ children, className = "", ...props }) => {
  return (
    <label
      className={`block text-sm font-medium text-gray-700 mb-1 font-barlow ${className}`}
      {...props}
    >
      {children}
    </label>
  );
};

const TagsInputControl = ({ children, className = "", ...props }) => {
  return (
    <div
      className={`flex flex-wrap items-center gap-1 w-full ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

const TagsInputInput = forwardRef(
  ({ placeholder = "Add tag...", className = "", ...props }, ref) => {
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
      setValidationError,
    } = useTagsInputContext();

    const sizeStyles = {
      xs: "text-xs px-1 py-0.5 min-w-[60px]",
      sm: "text-sm px-1 py-1 min-w-[80px]",
      md: "text-base px-1 py-1 min-w-[100px]",
      lg: "text-lg px-1 py-1 min-w-[120px]",
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
            setValidationError("");
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
        ${disabled ? "cursor-not-allowed" : ""}
        ${className}
      `}
        {...props}
      />
    );
  }
);

TagsInputInput.displayName = "TagsInputInput";

// Tag component
const TagsInputTag = ({
  tag,
  index,
  onRemove,
  className = "",
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
    editable,
    onTagClick,
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

  const handleTagClick = () => {
    if (disabled || readOnly) return;
    if (onTagClick) {
      onTagClick(tag, index);
    } else if (editable) {
      handleEdit();
    }
  };

  const handleEditSubmit = () => {
    if (updateTag(index, editValue)) {
      setEditingIndex(-1);
    }
  };

  const handleEditKeyDown = (e) => {
    switch (e.key) {
      case "Enter":
        e.preventDefault();
        handleEditSubmit();
        break;
      case "Escape":
        e.preventDefault();
        setEditingIndex(-1);
        setEditValue(tag);
        break;
    }
  };

  const sizeStyles = {
    xs: "text-xs px-2 py-0.5 h-5",
    sm: "text-sm px-2 py-1 h-6",
    md: "text-sm px-3 py-1 h-7",
    lg: "text-base px-3 py-1.5 h-8",
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
        ${isFocused ? "ring-2 ring-blue-500 ring-offset-1" : ""}
        ${
          (editable || onTagClick) && !disabled && !readOnly
            ? "cursor-pointer hover:bg-gray-200"
            : ""
        }
        ${className}
      `}
      onClick={handleTagClick}
      onDoubleClick={editable ? handleEdit : undefined}
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
const TagsInputTagText = ({ children, className = "", ...props }) => {
  return (
    <span className={`truncate font-barlow ${className}`} {...props}>
      {children}
    </span>
  );
};

// Tag remove button
const TagsInputTagRemove = ({
  onRemove,
  disabled = false,
  className = "",
  ...props
}) => {
  const { size } = useTagsInputContext();

  const sizeStyles = {
    xs: "w-3 h-3 text-xs",
    sm: "w-3.5 h-3.5 text-sm",
    md: "w-4 h-4 text-sm",
    lg: "w-4 h-4 text-base",
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
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
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
const TagsInputItems = ({ className = "", ...props }) => {
  const { tags, removeTag, maxLines } = useTagsInputContext();
  const [isExpanded, setIsExpanded] = useState(false);

  // Rough estimation: assume each tag takes ~120px width, container width ~400px
  // So approximately 3 tags per line, adjust based on maxLines
  const estimatedTagsPerLine = 3;
  const maxVisibleTags =
    maxLines === Infinity ? tags.length : maxLines * estimatedTagsPerLine;

  const visibleTags = isExpanded ? tags : tags.slice(0, maxVisibleTags);
  const hasHiddenTags = tags.length > maxVisibleTags && maxLines !== Infinity;

  return (
    <>
      {visibleTags.map((tag, index) => (
        <TagsInputTag
          key={`${tag}-${index}`}
          tag={tag}
          index={index}
          onRemove={removeTag}
          className={className}
          {...props}
        />
      ))}
      {hasHiddenTags && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="
            text-xs px-2 py-1 rounded-md bg-gray-200 text-gray-600 
            hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400
            transition-colors font-barlow
          "
        >
          {isExpanded ? `Show less` : `+${tags.length - maxVisibleTags} more`}
        </button>
      )}
    </>
  );
};

// Clear all button
const TagsInputClearTrigger = ({ children, className = "", ...props }) => {
  const { tags, updateTags, disabled, size } = useTagsInputContext();

  const handleClear = () => {
    if (!disabled) {
      updateTags([]);
    }
  };

  const sizeStyles = {
    xs: "text-xs px-1.5 py-0.5",
    sm: "text-sm px-2 py-1",
    md: "text-sm px-2 py-1",
    lg: "text-base px-3 py-1",
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
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        ${className}
      `}
      {...props}
    >
      {children || "Clear all"}
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
  Context: TagsInputContext_,
});

export default TagsInput;
