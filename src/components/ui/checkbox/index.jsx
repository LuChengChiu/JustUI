export default function Checkbox({
  checked = false,
  onChange,
  disabled = false,
  ...inputProps
}) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only peer"
        type="checkbox"
        {...inputProps}
      />
      <span className="relative w-6 h-6 flex justify-center items-center bg-[#fff] border-2 border-primary rounded-md shadow-md transition-all duration-500 peer-checked:border-accent peer-checked:bg-accent peer-hover:scale-105" />
      <span className="pointer-events-none absolute left-0 top-0 w-6 h-6 bg-gradient-to-br from-white/30 to-primary/10 opacity-0 peer-checked:opacity-100 rounded-md transition-all duration-500 peer-checked:animate-pulse" />
      <svg
        fill="currentColor"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute left-0 top-0 w-6 h-6 text-white opacity-0 transition-transform duration-500 transform scale-50 peer-checked:opacity-100 peer-checked:scale-100"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          clipRule="evenodd"
          d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 10-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
          fillRule="evenodd"
        />
      </svg>
    </label>
  );
}
