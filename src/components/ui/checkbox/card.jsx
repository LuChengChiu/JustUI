import Checkbox from ".";

export default function CheckboxCard({
  checked = false,
  disabled = false,
  onChange,
  label,
  description,
  children,
  ...props
}) {
  const handleChange = (e) => {
    if (!disabled && onChange) {
      onChange(e.target.checked, e);
    }
  };

  return (
    <div className="flex items-start gap-2" {...props}>
      <Checkbox checked={checked} onChange={handleChange} disabled={disabled} />

      <div className="flex flex-col pt-0 items-start">
        {label && (
          <label
            className={`block text-sm font-medium font-barlow ${
              disabled ? "text-gray-400" : "text-gray-700"
            } cursor-pointer`}
            onClick={() => !disabled && onChange?.(!checked)}
          >
            {label}
          </label>
        )}
        {description && (
          <p
            className={`text-xs mt-1 font-barlow ${
              disabled ? "text-gray-400" : "text-gray-500"
            }`}
          >
            {description}
          </p>
        )}
        {Boolean(children) && children}
      </div>
    </div>
  );
}
