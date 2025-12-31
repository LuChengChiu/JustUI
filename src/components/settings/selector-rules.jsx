import SettingsCheckbox from "@/components/ui/checkbox/settings-checkbox";
import { H1, Text } from "@/components/ui/typography";

const URL =
  "https://github.com/LuChengChiu/OriginalUI/blob/main/src/data/defaultRules.json";

export default function DefaultSelectorRuleManager({ checked, onChange }) {
  return (
    <div className="space-y-4">
      <H1 color="primary">Selector Rules</H1>

      <SettingsCheckbox
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
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-accent cursor-pointer underline italic"
          >
            Github OriginalUI Selector Rules
          </a>
        </div>
      </SettingsCheckbox>
    </div>
  );
}
