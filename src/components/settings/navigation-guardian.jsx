import CheckboxCard from "../ui/checkbox/card";
import { H1, Text } from "../ui/typography";

export default function NavigationGuardian({
  enabled,
  navigationStats,
  onChange,
}) {
  return (
    <div className="space-y-3">
      <H1 color="primary">
        Navigation Guardian{" "}
        <span className="text-[#913ced] text-[15px]">(beta)</span>
      </H1>

      <CheckboxCard
        checked={enabled}
        onChange={onChange}
        color="purple"
        label="Display confirmation modal before navigating to external sites"
        description="Protects against unwanted redirects, malicious popups, and clickjacking"
        size="md"
      >
        {enabled && (
          <div className="mt-3 p-3 bg-purple-50 rounded-lg">
            <div className="flex items-center justify-between">
              <Text color="accent">
                Blocked:{" "}
                <Text as="span" className="font-semibold">
                  {navigationStats.blockedCount}
                </Text>
              </Text>
              <Text color="accent">
                Allowed:{" "}
                <Text as="span" className="font-semibold">
                  {navigationStats.allowedCount}
                </Text>
              </Text>
            </div>
          </div>
        )}
      </CheckboxCard>
    </div>
  );
}
