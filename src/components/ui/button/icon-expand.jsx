import Minus from "@/components/icons/Minus";
import Plus from "@/components/icons/Plus";
import IconResetSetting from "@/components/icons/reset-settings";

const iconVariants = {
  plus: <Plus className="w-4 h-4 text-white" />,
  minus: <Minus className="w-4 h-4 text-white" />,
  "reset-setting": <IconResetSetting className="w-4 h-4 text-white" />,
};

export default function IconExpandButton({
  icon = "plus",
  children,
  onClick,
  containerClassName,
  ariaLabel,
}) {
  const iconComponent = iconVariants[icon];
  const resolvedAriaLabel =
    ariaLabel || (typeof children === "string" ? children : undefined);

  return (
    <button
      onClick={onClick}
      aria-label={resolvedAriaLabel}
      className={`group flex items-center justify-start w-6 h-6 border-none rounded-full cursor-pointer relative overflow-hidden transition-all duration-300 shadow-[2px_2px_10px_rgba(0,0,0,0.199)] bg-primary hover:w-32 hover:rounded-[40px] active:translate-x-0.5 active:translate-y-0.5 ${containerClassName}`}
    >
      <div className="w-full transition-all duration-100 flex items-center justify-center group-hover:w-[20%] group-hover:pl-1">
        {iconComponent}
      </div>
      <div className="absolute right-0 w-0 opacity-0 text-white text-nowrap !text-[11px] font-semibold transition-all duration-300 group-hover:opacity-100 group-hover:w-[80%] group-hover:pr-2.5">
        {children}
      </div>
    </button>
  );
}
