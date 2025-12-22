import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";

import { H1, Text } from "./components/ui/typography";

import WhitelistManager from "./components/settings/whitelist";
import DefaultSelectorRuleManager from "./components/settings/selector-rules";
import CustomRulesManager from "./components/settings/custom-rules";
import BlockRequestsManager from "./components/settings/block-requests";
import NavigationGuardian from "./components/settings/navigation-guardian";
import PatternRules from "./components/settings/pattern-rules";
import Footer from "./components/settings/footer";
import Loading from "./components/settings/loading";

function SettingsBeta() {
  const [defaultRulesEnabled, setDefaultRulesEnabled] = useState(true);
  const [customRulesEnabled, setCustomRulesEnabled] = useState(true);
  const [patternRulesEnabled, setPatternRulesEnabled] = useState(true);
  const [navigationGuardEnabled, setNavigationGuardEnabled] = useState(true);
  const [defaultBlockRequestEnabled, setDefaultBlockRequestEnabled] =
    useState(true);

  // Data states
  const [whitelist, setWhitelist] = useState([]);
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
        "navigationGuardEnabled",
        "defaultBlockRequestEnabled",
        "whitelist",
        "customRules",
        "networkBlockPatterns",
        "navigationStats",
      ],
      (result) => {
        setDefaultRulesEnabled(result.defaultRulesEnabled !== false);
        setCustomRulesEnabled(result.customRulesEnabled !== false);
        setPatternRulesEnabled(result.patternRulesEnabled !== false);
        setNavigationGuardEnabled(result.navigationGuardEnabled !== false);
        setDefaultBlockRequestEnabled(
          result.defaultBlockRequestEnabled !== false
        );
        setWhitelist(result.whitelist || []);
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

  const handleCustomRulesToggle = (enabled) => {
    setCustomRulesEnabled(enabled);
    updateSetting("customRulesEnabled", enabled);
  };

  const handlePatternRulesToggle = (enabled) => {
    setPatternRulesEnabled(enabled);
    updateSetting("patternRulesEnabled", enabled);
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
    return <Loading />;
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
              enabled={customRulesEnabled}
              onToggleEnable={handleCustomRulesToggle}
              customRules={customRules}
              onRemoveCustomRule={handleRemoveCustomRule}
              onAddNewRule={handleAddNewRule}
              onEditRule={handleEditCustomRule}
            />

            <PatternRules
              enabled={patternRulesEnabled}
              onToggleCheck={handlePatternRulesToggle}
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

        <Footer />
      </div>
    </div>
  );
}

// Initialize the settings page
const container = document.getElementById("settings-root");
const root = createRoot(container);
root.render(<SettingsBeta />);
