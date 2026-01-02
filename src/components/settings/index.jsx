import { createRoot } from "react-dom/client";

import { H1 } from "@/components/ui/typography";
import { useBulkChromeStorage } from "@/hooks/use-bulk-chrome-storage";

import BlockRequestsManager from "./block-requests";
import CustomRulesManager from "./custom-rules";
import ErrorDisplay from "./error-display";
import Footer from "./footer";
import Loading from "./loading";
import NavigationGuardian from "./navigation-guardian";
import DefaultSelectorRuleManager from "./selector-rules";
import WhitelistManager from "./whitelist";

function SettingsBeta() {
  const { values, updateValue, loading, error } = useBulkChromeStorage({
    defaultRulesEnabled: true,
    customRulesEnabled: true,
    navigationGuardEnabled: true,
    defaultBlockRequestEnabled: true,
    whitelist: [],
    customRules: [],
    networkBlockPatterns: [],
    navigationStats: { blockedCount: 0, allowedCount: 0 },
  });

  // Handle removing custom rule
  const handleRemoveCustomRule = (ruleId) => {
    const updatedRules = values.customRules.filter(
      (rule) => rule.id !== ruleId
    );
    updateValue("customRules", updatedRules);
  };

  // Handle adding new custom rule
  const handleAddNewRule = (newRule) => {
    const updatedCustomRules = [...values.customRules, newRule];
    updateValue("customRules", updatedCustomRules);
  };

  // Handle editing existing custom rule
  const handleEditCustomRule = (editedRule) => {
    const updatedCustomRules = values.customRules.map((rule) =>
      rule.id === editedRule.id ? editedRule : rule
    );
    updateValue("customRules", updatedCustomRules);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Loading />
      </div>
    );
  }

  if (error) {
    return <ErrorDisplay error={error} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-[1px_4px_5px_3px_var(--color-accent)] pb-8 pt-0.5 gap-y-1">
          <div className="flex w-full items-center justify-end pr-2">
            <H1 color="accent" align="center" className="text-[30px]">
              OriginalUI
            </H1>
          </div>

          <div className="flex flex-col space-y-8 px-8">
            <WhitelistManager
              domains={values.whitelist}
              onDomainsChange={(domains) => updateValue("whitelist", domains)}
              disabled={loading}
            />

            <DefaultSelectorRuleManager
              checked={values.defaultRulesEnabled}
              onChange={(enabled) =>
                updateValue("defaultRulesEnabled", enabled)
              }
            />

            <CustomRulesManager
              enabled={values.customRulesEnabled}
              onToggleEnable={(enabled) =>
                updateValue("customRulesEnabled", enabled)
              }
              customRules={values.customRules}
              onRemoveCustomRule={handleRemoveCustomRule}
              onAddNewRule={handleAddNewRule}
              onEditRule={handleEditCustomRule}
            />

            <BlockRequestsManager
              checked={values.defaultBlockRequestEnabled}
              values={values.networkBlockPatterns}
              onToggleCheck={(enabled) =>
                updateValue("defaultBlockRequestEnabled", enabled)
              }
              onChange={(patterns) =>
                updateValue("networkBlockPatterns", patterns)
              }
            />

            <NavigationGuardian
              enabled={values.navigationGuardEnabled}
              navigationStats={values.navigationStats}
              onChange={(enabled) =>
                updateValue("navigationGuardEnabled", enabled)
              }
            />
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}

// Initialize the settings page
const container = document.getElementById("settings-root");
const root = createRoot(container);
root.render(<SettingsBeta />);
