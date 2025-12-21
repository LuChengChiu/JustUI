const Checkbox = ({
  checked = false,
  onChange,
  disabled = false,
  color = "purple",
  label,
  description,
  error = false,
  className = "",
  children,
  ...inputProps
}) => {
  return (
    <div className="flex items-center space-x-3">
      <label className="group flex items-center cursor-pointer">
        <input
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="hidden peer"
          type="checkbox"
          {...inputProps}
        />
        <span className="relative w-6 h-6 flex justify-center items-center bg-[#fff] border-2 border-[#913ced] rounded-md shadow-md transition-all duration-500 peer-checked:border-[#9647eb] peer-checked:bg-[#9647eb] peer-hover:scale-105">
          <span className="absolute inset-0 bg-gradient-to-br from-white/30 to-[#913ced]/10 opacity-0 peer-checked:opacity-100 rounded-md transition-all duration-500 peer-checked:animate-pulse" />
          <svg
            fill="currentColor"
            viewBox="0 0 20 20"
            className="hidden w-5 h-5 text-white peer-checked:block transition-transform duration-500 transform scale-50 peer-checked:scale-100"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              clipRule="evenodd"
              d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 10-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
              fillRule="evenodd"
            />
          </svg>
        </span>
      </label>
    </div>
  );
};

export default Checkbox;
