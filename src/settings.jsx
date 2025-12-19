import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';
import Switch from './components/ui/switch';

function Settings() {
  const [defaultRulesEnabled, setDefaultRulesEnabled] = useState(true);
  const [customRulesEnabled, setCustomRulesEnabled] = useState(true);
  const [patternRulesEnabled, setPatternRulesEnabled] = useState(true);
  const [chromeAdTagEnabled, setChromeAdTagEnabled] = useState(true);
  const [navigationGuardEnabled, setNavigationGuardEnabled] = useState(true);
  const [popUnderProtectionEnabled, setPopUnderProtectionEnabled] = useState(true);
  const [scriptAnalysisEnabled, setScriptAnalysisEnabled] = useState(true);
  const [whitelist, setWhitelist] = useState([]);
  const [defaultRules, setDefaultRules] = useState([]);
  const [customRules, setCustomRules] = useState([]);
  const [navigationStats, setNavigationStats] = useState({ blockedCount: 0, allowedCount: 0 });
  const [newDomain, setNewDomain] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load settings from storage
    chrome.storage.local.get([
      'defaultRulesEnabled',
      'customRulesEnabled', 
      'patternRulesEnabled',
      'chromeAdTagEnabled',
      'navigationGuardEnabled',
      'popUnderProtectionEnabled',
      'scriptAnalysisEnabled',
      'whitelist',
      'defaultRules',
      'customRules',
      'navigationStats'
    ], (result) => {
      setDefaultRulesEnabled(result.defaultRulesEnabled !== false);
      setCustomRulesEnabled(result.customRulesEnabled !== false);
      setPatternRulesEnabled(result.patternRulesEnabled !== false);
      setChromeAdTagEnabled(result.chromeAdTagEnabled !== false);
      setNavigationGuardEnabled(result.navigationGuardEnabled !== false);
      setPopUnderProtectionEnabled(result.popUnderProtectionEnabled !== false);
      setScriptAnalysisEnabled(result.scriptAnalysisEnabled !== false);
      setWhitelist(result.whitelist || []);
      setDefaultRules(result.defaultRules || []);
      setCustomRules(result.customRules || []);
      setNavigationStats(result.navigationStats || { blockedCount: 0, allowedCount: 0 });
      setLoading(false);
    });
  }, []);

  const updateSetting = (key, value) => {
    chrome.storage.local.set({ [key]: value });
  };

  const handleDefaultRulesToggle = (enabled) => {
    setDefaultRulesEnabled(enabled);
    updateSetting('defaultRulesEnabled', enabled);
  };

  const handleCustomRulesToggle = (enabled) => {
    setCustomRulesEnabled(enabled);
    updateSetting('customRulesEnabled', enabled);
  };

  const handlePatternRulesToggle = (enabled) => {
    setPatternRulesEnabled(enabled);
    updateSetting('patternRulesEnabled', enabled);
  };

  const handleChromeAdTagToggle = (enabled) => {
    setChromeAdTagEnabled(enabled);
    updateSetting('chromeAdTagEnabled', enabled);
  };

  const handleNavigationGuardToggle = (enabled) => {
    setNavigationGuardEnabled(enabled);
    updateSetting('navigationGuardEnabled', enabled);
  };

  const handlePopUnderProtectionToggle = (enabled) => {
    setPopUnderProtectionEnabled(enabled);
    updateSetting('popUnderProtectionEnabled', enabled);
  };

  const handleScriptAnalysisToggle = (enabled) => {
    setScriptAnalysisEnabled(enabled);
    updateSetting('scriptAnalysisEnabled', enabled);
  };


  const resetNavigationStats = () => {
    const resetStats = { blockedCount: 0, allowedCount: 0 };
    setNavigationStats(resetStats);
    updateSetting('navigationStats', resetStats);
  };

  const addDomainToWhitelist = () => {
    if (!newDomain.trim() || whitelist.includes(newDomain.trim())) return;
    
    const updatedWhitelist = [...whitelist, newDomain.trim()];
    setWhitelist(updatedWhitelist);
    updateSetting('whitelist', updatedWhitelist);
    setNewDomain('');
  };

  const removeDomainFromWhitelist = (domain) => {
    const updatedWhitelist = whitelist.filter(d => d !== domain);
    setWhitelist(updatedWhitelist);
    updateSetting('whitelist', updatedWhitelist);
  };

  const toggleDefaultRule = (ruleId, enabled) => {
    const updatedRules = defaultRules.map(rule => 
      rule.id === ruleId ? { ...rule, enabled } : rule
    );
    setDefaultRules(updatedRules);
    updateSetting('defaultRules', updatedRules);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <header className="bg-white p-6 rounded-lg shadow-sm">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">JustUI Settings</h1>
          <p className="text-gray-600">Configure element removal rules, navigation protection, and whitelist management</p>
        </header>

        {/* Rule Type Controls */}
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Detection Rules</h2>
          
          <div className="space-y-4">
            {/* Default Rules Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-medium text-gray-800">Default Rules</h3>
                <p className="text-sm text-gray-600">Built-in CSS selector rules for common ad patterns</p>
                <p className="text-xs text-gray-500">{defaultRules.length} rules available</p>
              </div>
              <Switch 
                checked={defaultRulesEnabled} 
                onChange={handleDefaultRulesToggle} 
              />
            </div>

            {/* Pattern Detection Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-medium text-gray-800">Advanced Pattern Detection</h3>
                <p className="text-sm text-gray-600">AI-powered detection of suspicious overlays, scam content, and malicious domains</p>
                <p className="text-xs text-gray-500">7 detection algorithms with weighted scoring</p>
              </div>
              <Switch 
                checked={patternRulesEnabled} 
                onChange={handlePatternRulesToggle} 
              />
            </div>

            {/* Chrome Ad Tag Detection */}
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div>
                <h3 className="font-medium text-gray-800">Chrome Ad Tag Detection</h3>
                <p className="text-sm text-gray-600">Leverage Chrome's native ad detection and heavy ad intervention reports</p>
                <p className="text-xs text-gray-500">Detects Google ad attributes, ad network iframes, and intervention reports</p>
              </div>
              <Switch 
                checked={chromeAdTagEnabled} 
                onChange={handleChromeAdTagToggle} 
              />
            </div>

            {/* Custom Rules Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-medium text-gray-800">Custom Rules</h3>
                <p className="text-sm text-gray-600">User-defined CSS selector rules</p>
                <p className="text-xs text-gray-500">{customRules.length} custom rules</p>
              </div>
              <Switch 
                checked={customRulesEnabled} 
                onChange={handleCustomRulesToggle} 
              />
            </div>
          </div>
        </div>

        {/* Navigation Guardian Controls */}
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Navigation Guardian</h2>
          
          <div className="space-y-4">
            {/* Navigation Guard Toggle */}
            <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div>
                <h3 className="font-medium text-gray-800">Cross-Origin Navigation Protection</h3>
                <p className="text-sm text-gray-600">Display confirmation modal before navigating to external sites</p>
                <p className="text-xs text-gray-500">Protects against unwanted redirects, malicious popups, and clickjacking</p>
              </div>
              <Switch 
                checked={navigationGuardEnabled} 
                onChange={handleNavigationGuardToggle} 
              />
            </div>

            {/* Navigation Stats */}
            {navigationGuardEnabled && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium text-gray-800 mb-3">Navigation Statistics</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">{navigationStats.blockedCount}</div>
                    <div className="text-sm text-red-700">Blocked Navigations</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{navigationStats.allowedCount}</div>
                    <div className="text-sm text-green-700">Allowed Navigations</div>
                  </div>
                </div>
                <button
                  onClick={resetNavigationStats}
                  className="text-sm px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                >
                  Reset Statistics
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Pop-Under Protection Controls */}
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">🛡️ Pop-Under Protection</h2>
          <p className="text-gray-600 mb-4">Advanced protection against pop-under advertisements and malicious script injection</p>
          
          <div className="space-y-4">
            {/* Pop-Under Protection Master Toggle */}
            <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
              <div>
                <h3 className="font-medium text-gray-800">Pop-Under Advertisement Blocking</h3>
                <p className="text-sm text-gray-600">Comprehensive protection against pop-under ads and click hijacking</p>
                <p className="text-xs text-gray-500">Blocks window.open() abuse, malicious click listeners, and focus manipulation</p>
              </div>
              <Switch 
                checked={popUnderProtectionEnabled} 
                onChange={handlePopUnderProtectionToggle} 
              />
            </div>

            {/* Script Analysis */}
            <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div>
                <h3 className="font-medium text-gray-800">Real-time Script Analysis</h3>
                <p className="text-sm text-gray-600">Analyze JavaScript content for pop-under signatures and malicious patterns</p>
                <p className="text-xs text-gray-500">Advanced threat scoring with 8 pop-under pattern detectors</p>
              </div>
              <Switch 
                checked={scriptAnalysisEnabled} 
                onChange={handleScriptAnalysisToggle} 
              />
            </div>


            {/* Protection Details */}
            {popUnderProtectionEnabled && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium text-gray-800 mb-3">Protection Features</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 bg-white rounded-lg border">
                    <h4 className="font-medium text-red-800 mb-2">🚫 Script Blocking</h4>
                    <ul className="text-sm text-gray-700 space-y-1">
                      <li>• Pop-under function detection</li>
                      <li>• Malicious event listener removal</li>
                      <li>• LocalStorage abuse prevention</li>
                      <li>• Dynamic script injection blocking</li>
                    </ul>
                  </div>
                  <div className="p-3 bg-white rounded-lg border">
                    <h4 className="font-medium text-blue-800 mb-2">🔍 Analysis Methods</h4>
                    <ul className="text-sm text-gray-700 space-y-1">
                      <li>• Pattern-based signature detection</li>
                      <li>• Behavioral analysis scoring</li>
                      <li>• URL threat assessment</li>
                      <li>• Focus manipulation detection</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pattern Detection Details */}
        {patternRulesEnabled && (
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Pattern Detection Rules</h2>
            <p className="text-gray-600 mb-4">Advanced detection algorithms automatically identify suspicious content:</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-800 mb-2">High-Confidence Rules (95%+ accuracy)</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Z-Index overlay detection (weight: 10)</li>
                  <li>• Click hijacking patterns (weight: 9)</li>
                  <li>• Suspicious iframe analysis (weight: 8)</li>
                </ul>
              </div>
              
              <div className="p-4 bg-green-50 rounded-lg">
                <h4 className="font-medium text-green-800 mb-2">Domain & Content Analysis</h4>
                <ul className="text-sm text-green-700 space-y-1">
                  <li>• Malicious domain detection (weight: 7)</li>
                  <li>• Scam language patterns (weight: 5)</li>
                  <li>• Interaction blocking detection (weight: 4)</li>
                  <li>• Protocol-relative URLs (weight: 3)</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Whitelist Management */}
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Whitelist Management</h2>
          <p className="text-gray-600 mb-4">Domains in the whitelist are considered trusted and exempt from both element removal and navigation protection</p>

          {/* Add Domain */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="example.com"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyPress={(e) => e.key === 'Enter' && addDomainToWhitelist()}
            />
            <button
              onClick={addDomainToWhitelist}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              Add Domain
            </button>
          </div>

          {/* Domain List */}
          <div className="space-y-2">
            {whitelist.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No domains in whitelist</p>
            ) : (
              whitelist.map(domain => (
                <div key={domain} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-800">{domain}</span>
                  <button
                    onClick={() => removeDomainFromWhitelist(domain)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Default Rules List */}
        {defaultRulesEnabled && defaultRules.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Default Rules Configuration</h2>
            
            <div className="space-y-2">
              {defaultRules.map(rule => (
                <div key={rule.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <h4 className="font-medium text-gray-800">{rule.description}</h4>
                    <p className="text-xs text-gray-500">
                      Selector: <code className="bg-gray-200 px-1 rounded">{rule.selector}</code>
                    </p>
                    <p className="text-xs text-gray-500">
                      Category: {rule.category} | Confidence: {rule.confidence}
                    </p>
                  </div>
                  <Switch
                    checked={rule.enabled !== false}
                    onChange={(enabled) => toggleDefaultRule(rule.id, enabled)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm">
          <p>JustUI v1.0.0 - Advanced Ad Removal & Navigation Protection</p>
        </div>
      </div>
    </div>
  );
}

// Initialize the settings page
const container = document.getElementById('settings-root');
const root = createRoot(container);
root.render(<Settings />);