import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";

import { H1, Text } from "./components/ui/typography";

import WhitelistManager from "./components/settings/whitelist";
import DefaultSelectorRuleManager from "./components/settings/selector-rules";
import CustomRulesManager from "./components/settings/custom-rules";
import BlockRequestsManager from "./components/settings/block-requests";
import NavigationGuardian from "./components/settings/navigation-guardian";

function SettingsBeta() {
  // State for all settings
  const [defaultRulesEnabled, setDefaultRulesEnabled] = useState(true);
  const [customRulesEnabled, setCustomRulesEnabled] = useState(true);
  const [patternRulesEnabled, setPatternRulesEnabled] = useState(true);
  const [chromeAdTagEnabled, setChromeAdTagEnabled] = useState(true);
  const [navigationGuardEnabled, setNavigationGuardEnabled] = useState(true);
  const [popUnderProtectionEnabled, setPopUnderProtectionEnabled] =
    useState(true);
  const [scriptAnalysisEnabled, setScriptAnalysisEnabled] = useState(true);
  const [defaultBlockRequestEnabled, setDefaultBlockRequestEnabled] =
    useState(true);

  // Data states
  const [whitelist, setWhitelist] = useState([]);
  const [defaultRules, setDefaultRules] = useState([]);
  const [customRules, setCustomRules] = useState([]);
  const [networkBlockPatterns, setNetworkBlockPatterns] = useState([]);
  const [navigationStats, setNavigationStats] = useState({
    blockedCount: 0,
    allowedCount: 0,
  });

  const [loading, setLoading] = useState(true);

  // Load settings from Chrome storage
  useEffect(() => {
    chrome.storage.local.get(
      [
        "defaultRulesEnabled",
        "customRulesEnabled",
        "patternRulesEnabled",
        "chromeAdTagEnabled",
        "navigationGuardEnabled",
        "popUnderProtectionEnabled",
        "scriptAnalysisEnabled",
        "defaultBlockRequestEnabled",
        "whitelist",
        "defaultRules",
        "customRules",
        "networkBlockPatterns",
        "navigationStats",
      ],
      (result) => {
        setDefaultRulesEnabled(result.defaultRulesEnabled !== false);
        setCustomRulesEnabled(result.customRulesEnabled !== false);
        setPatternRulesEnabled(result.patternRulesEnabled !== false);
        setChromeAdTagEnabled(result.chromeAdTagEnabled !== false);
        setNavigationGuardEnabled(result.navigationGuardEnabled !== false);
        setPopUnderProtectionEnabled(
          result.popUnderProtectionEnabled !== false
        );
        setScriptAnalysisEnabled(result.scriptAnalysisEnabled !== false);
        setDefaultBlockRequestEnabled(
          result.defaultBlockRequestEnabled !== false
        );
        setWhitelist(result.whitelist || []);
        setDefaultRules(result.defaultRules || []);
        setCustomRules(result.customRules || []);
        setNetworkBlockPatterns(result.networkBlockPatterns || []);
        setNavigationStats(
          result.navigationStats || { blockedCount: 0, allowedCount: 0 }
        );
        setLoading(false);
      }
    );
  }, []);

  // Update settings in Chrome storage
  const updateSetting = (key, value) => {
    chrome.storage.local.set({ [key]: value });
  };

  // Handle whitelist changes
  const handleWhitelistChange = (domains) => {
    setWhitelist(domains);
    updateSetting("whitelist", domains);
  };

  // Handle default rules toggle
  const handleDefaultRulesToggle = (enabled) => {
    setDefaultRulesEnabled(enabled);
    updateSetting("defaultRulesEnabled", enabled);
  };

  const handleDefaultRuleSelectorsChange = (selectors) => {
    const updatedRules = defaultRules.map((rule) => ({
      ...rule,
      enabled: selectors.includes(rule.selector),
    }));
    setDefaultRules(updatedRules);
    updateSetting("defaultRules", updatedRules);
  };

  // Handle removing custom rule
  const handleRemoveCustomRule = (ruleId) => {
    const updatedRules = customRules.filter((rule) => rule.id !== ruleId);
    setCustomRules(updatedRules);
    updateSetting("customRules", updatedRules);
  };

  // Handle adding new custom rule
  const handleAddNewRule = (newRule) => {
    const updatedCustomRules = [...customRules, newRule];
    setCustomRules(updatedCustomRules);
    updateSetting("customRules", updatedCustomRules);
  };

  // Handle editing existing custom rule
  const handleEditCustomRule = (editedRule) => {
    const updatedCustomRules = customRules.map((rule) =>
      rule.id === editedRule.id ? editedRule : rule
    );
    setCustomRules(updatedCustomRules);
    updateSetting("customRules", updatedCustomRules);
  };

  // Handle network block patterns
  const handleNetworkBlockChange = (patterns) => {
    setNetworkBlockPatterns(patterns);
    updateSetting("networkBlockPatterns", patterns);
  };

  // Handle navigation guardian toggle
  const handleNavigationGuardToggle = (enabled) => {
    setNavigationGuardEnabled(enabled);
    updateSetting("navigationGuardEnabled", enabled);
  };

  // Handle default block request toggle
  const handleDefaultBlockRequestToggle = (enabled) => {
    setDefaultBlockRequestEnabled(enabled);
    updateSetting("defaultBlockRequestEnabled", enabled);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <Text color="secondary">Loading settings...</Text>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-[1px_4px_5px_3px_#9647eb] pb-8 pt-0.5 gap-y-1">
          <div className="flex w-full items-center justify-end pr-2">
            <H1 color="accent" align="center" className="text-[30px]">
              JustUI
            </H1>
          </div>

          <div className="flex flex-col space-y-8 px-8">
            <WhitelistManager
              domains={whitelist}
              onDomainsChange={handleWhitelistChange}
              disabled={loading}
            />

            <DefaultSelectorRuleManager
              checked={defaultRulesEnabled}
              onChange={handleDefaultRulesToggle}
            />

            <CustomRulesManager
              customRules={customRules}
              onRemoveCustomRule={handleRemoveCustomRule}
              onAddNewRule={handleAddNewRule}
              onEditRule={handleEditCustomRule}
            />

            <BlockRequestsManager
              checked={defaultBlockRequestEnabled}
              values={networkBlockPatterns}
              onToggleCheck={handleDefaultBlockRequestToggle}
              onChange={handleNetworkBlockChange}
            />

            <NavigationGuardian
              enabled={navigationGuardEnabled}
              navigationStats={navigationStats}
              onChange={handleNavigationGuardToggle}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <Text color="muted" align="center">
            JustUI v2.0.0 Beta - Modern Privacy Protection
          </Text>
        </div>
      </div>
    </div>
  );
}

// Initialize the settings page
const container = document.getElementById("settings-root");
const root = createRoot(container);
root.render(<SettingsBeta />);
