import Toggle from "@/components/ui/toggle";
import { H2, H4 } from "@/components/ui/typography";

export default function Status({ isActive, onChange }) {
  return (
    <div className="flex items-center justify-between card-purple">
      <div>
        <H2>Extension Status</H2>
        <H4 className={isActive ? "!text-accent" : "!text-text/50"}>
          {isActive ? "Active" : "Inactive"}
        </H4>
      </div>

      <Toggle checked={isActive} onChange={onChange} />
    </div>
  );
}
