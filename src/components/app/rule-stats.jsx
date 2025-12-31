import IconExpandButton from "@/components/ui/button/icon-expand";
import { H3, H4, Text } from "@/components/ui/typography";

const renderRuleCount = (label, count) => {
  return (
    <div className="flex justify-between items-center">
      <Text>{label}</Text>

      <Text className="text-sm text-primary">{count}</Text>
    </div>
  );
};

export default function RuleStates({ domain, stats, onResetStats }) {
  if (!domain) return null;

  const defaultCount = stats?.defaultRulesRemoved || 0;
  const customCount = stats?.customRulesRemoved || 0;

  return (
    <div className="card-purple">
      <div className="flex justify-between items-center mb-2">
        <H3>Removal Stats</H3>

        {stats && onResetStats && (
          <IconExpandButton
            icon="reset-setting"
            onClick={() => onResetStats(domain)}
            containerClassName="hover:!w-26"
          >
            Reset
          </IconExpandButton>
        )}
      </div>

      <div className="space-y-2 pr-1">
        {renderRuleCount("Default Rules:", `${defaultCount} elements`)}
        {customCount > 0 &&
          renderRuleCount("Custom Rules:", `${customCount} elements`)}

        <div className="flex mt-2 pt-2 border-t border-[#141117]/50 justify-between items-center">
          <H4>Total:</H4>
          <Text className="!font-bold">
            {defaultCount + customCount} elements
          </Text>
        </div>
      </div>
    </div>
  );
}
