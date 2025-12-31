import SettingsCheckbox from "@/components/ui/checkbox/settings-checkbox";
import { H1, Text } from "@/components/ui/typography";

export default function NavigationGuardian({
  enabled,
  navigationStats,
  onChange,
}) {
  return (
    <div className="space-y-3">
      <H1 color="primary">
        Navigation Guardian{" "}
        <span className="text-primary text-[15px]">(beta)</span>
      </H1>

      <SettingsCheckbox
        checked={enabled}
        onChange={onChange}
        color="purple"
        label="Display confirmation modal before navigating to external sites"
        description="Protects against unwanted redirects, malicious popups, and clickjacking"
        size="md"
      >
        {enabled && (
          <div className="mt-3 p-3 bg-purple-50 rounded-lg">
            <div className="flex gap-x-2 items-center justify-between">
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
      </SettingsCheckbox>
    </div>
  );
}
