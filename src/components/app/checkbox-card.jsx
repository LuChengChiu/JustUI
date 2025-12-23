import CheckPath from "../ui/checkbox/check-path";

export default function CheckboxCard({
  checked,
  disabled,
  id,
  className,
  onChange,
  label,
}) {
  console.log("checked: ", checked);
  return (
    <label
      className={`relative flex justify-center items-center cursor-pointer select-none w-40 h-9 border border-[#BB92E7] rounded-sm 
        font-days-one text-[13px] gap-x-2
        ${
          disabled ? "opacity-50 cursor-not-allowed" : "hover:scale-105"
        } transition-all duration-300 rounded-lg ${
        checked ? "bg-[#913ced]" : "bg-white"
      } ${className}`}
      htmlFor={id}
    >
      <CheckPath
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className={`!absolute left-3 ${checked ? "opacity-100" : "opacity-0"}`}
      />

      <span
        className={`absolute top-1/2 duration-300 -translate-y-1/2  -translate-x-1/2 text-nowrap flex items-center gap-1 ${
          checked ? "left-[calc(50%+10px)] text-white" : "left-1/2"
        }`}
      >
        {label}
      </span>
    </label>
  );
}
