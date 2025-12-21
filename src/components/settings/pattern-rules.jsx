import CheckboxCard from "../ui/checkbox/card";
import { H1, Text } from "../ui/typography";

export default function PatternRules({ enabled, onToggleCheck }) {
  return (
    <div className="space-y-4">
      <H1 color="primary">Pattern Rules</H1>

      <CheckboxCard
        checked={enabled}
        onChange={onToggleCheck}
        label="Apply Pattern Rules"
      >
        <Text variant="caption" color="muted">
          Behavioral analysis for sophisticated threats.
        </Text>
        <Text variant="caption" color="muted">
          Scored Detection System: overlays, scams, click hijacking, etc
        </Text>
      </CheckboxCard>
    </div>
  );
}
