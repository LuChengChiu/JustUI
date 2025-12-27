import CheckboxCard from "../ui/checkbox/card";
import { H1, Text } from "../ui/typography";

const URL =
  "https://github.com/LuChengChiu/OriginalUI/blob/main/src/data/defaultRules.json";

export default function DefaultSelectorRuleManager({ checked, onChange }) {
  return (
    <div className="space-y-4">
      <H1 color="primary">Selector Rules</H1>

      <CheckboxCard
        checked={checked}
        onChange={onChange}
        label="Apply Default Rules"
      >
        <div className="flex gap-1">
          <Text variant="caption" color="muted">
            Checkout the default rules in:
          </Text>
          <a
            href={URL}
            className="text-[10px] text-accent cursor-pointer underline italic"
          >
            Github OriginalUI Selector Rules
          </a>
        </div>
      </CheckboxCard>
    </div>
  );
}
