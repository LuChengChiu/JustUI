import { useEffect, useReducer } from "react";
import Switch from "./components/ui/switch";
import Loading from "./components/ui/loading";

import { H1 } from "./components/ui/typography";
import DefaultSections from "./components/app/default-sections";
import CurrentDomain from "./components/app/current-domain";
import NavigationStats from "./components/app/navigation-stats";

// Action types
const actionTypes = {
  LOAD_SETTINGS: "LOAD_SETTINGS",
  TOGGLE_MAIN: "TOGGLE_MAIN",
  TOGGLE_PROTECTION_SYSTEM: "TOGGLE_PROTECTION_SYSTEM",
  SET_DOMAIN_INFO: "SET_DOMAIN_INFO",
  UPDATE_STATS: "UPDATE_STATS",
  SET_LOADING: "SET_LOADING",
};

// Initial state
const initialState = {
  isActive: false,
  protectionSystems: {
    navigationGuard: true,
    patternRules: true,
    defaultRules: true,
    customRules: true,
    requestBlocking: true,
  },
  domain: {
    current: "",
    isWhitelisted: false,
  },
  stats: {
    domain: {},
    navigation: { blockedCount: 0, allowedCount: 0 },
  },
  loading: true,
};

// Reducer
const protectionReducer = (state, action) => {
  switch (action.type) {
    case actionTypes.LOAD_SETTINGS:
      return {
        ...state,
        isActive: action.payload.isActive || false,
        protectionSystems: {
          navigationGuard: action.payload.navigationGuardEnabled !== false,
          patternRules: action.payload.patternRulesEnabled !== false,
          defaultRules: action.payload.defaultRulesEnabled !== false,
          customRules: action.payload.customRulesEnabled !== false,
          requestBlocking: action.payload.defaultBlockRequestEnabled !== false,
        },
        stats: {
          domain: action.payload.domainStats || {},
          navigation: action.payload.navigationStats || {
            blockedCount: 0,
            allowedCount: 0,
          },
        },
      };
    case actionTypes.TOGGLE_MAIN:
      return { ...state, isActive: action.value };
    case actionTypes.TOGGLE_PROTECTION_SYSTEM:
      return {
        ...state,
        protectionSystems: {
          ...state.protectionSystems,
          [action.system]: action.value,
        },
      };
    case actionTypes.SET_DOMAIN_INFO:
      return {
        ...state,
        domain: {
          current: action.domain,
          isWhitelisted: action.isWhitelisted,
        },
      };
    case actionTypes.UPDATE_STATS:
      return {
        ...state,
        stats: {
          ...state.stats,
          [action.statType]: action.stats,
        },
      };
    case actionTypes.SET_LOADING:
      return { ...state, loading: action.value };
    default:
      return state;
  }
};

// Chrome storage integration
const storageAdapter = {
  async load() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        [
          "isActive",
          "domainStats",
          "patternRulesEnabled",
          "defaultRulesEnabled",
          "defaultBlockRequestEnabled",
          "navigationGuardEnabled",
          "customRulesEnabled",
          "navigationStats",
        ],
        resolve
      );
    });
  },

  save(key, value) {
    chrome.storage.local.set({ [key]: value });
  },

  saveProtectionSystem(system, value) {
    const storageKey = {
      navigationGuard: "navigationGuardEnabled",
      patternRules: "patternRulesEnabled",
      defaultRules: "defaultRulesEnabled",
      customRules: "customRulesEnabled",
      requestBlocking: "defaultBlockRequestEnabled",
    }[system];

    if (storageKey) {
      this.save(storageKey, value);
    }
  },
};

export default function App() {
  const [state, dispatch] = useReducer(protectionReducer, initialState);

  // Toggle handlers
  const handleToggle = (newState) => {
    dispatch({ type: actionTypes.TOGGLE_MAIN, value: newState });
    storageAdapter.save("isActive", newState);
  };

  const handleProtectionToggle = (system, newState) => {
    dispatch({
      type: actionTypes.TOGGLE_PROTECTION_SYSTEM,
      system,
      value: newState,
    });
    storageAdapter.saveProtectionSystem(system, newState);
  };

  const handleWhitelistToggle = () => {
    const whitelistAction = state.domain.isWhitelisted ? "remove" : "add";

    const timeout = setTimeout(() => {
      console.error("Timeout updating whitelist");
    }, 5000);

    chrome.runtime.sendMessage(
      {
        action: "updateWhitelist",
        domain: state.domain.current,
        whitelistAction,
      },
      (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          console.error("Error updating whitelist:", chrome.runtime.lastError);
          return;
        }
        if (response && response.success) {
          dispatch({
            type: actionTypes.SET_DOMAIN_INFO,
            domain: state.domain.current,
            isWhitelisted: !state.domain.isWhitelisted,
          });
        }
      }
    );
  };

  const handleResetStats = () => {
    if (!state.domain.current) return;

    const updatedStats = { ...state.stats.domain };
    delete updatedStats[state.domain.current];

    chrome.storage.local.set({ domainStats: updatedStats }, () => {
      dispatch({
        type: actionTypes.UPDATE_STATS,
        statType: "domain",
        stats: updatedStats,
      });
    });
  };

  useEffect(() => {
    const initializeExtension = async () => {
      try {
        // Load extension state from storage
        const settings = await storageAdapter.load();
        dispatch({ type: actionTypes.LOAD_SETTINGS, payload: settings });

        // Get current domain with timeout
        const domainResponse = await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve(null), 1000); // 3 second timeout

          chrome.runtime.sendMessage(
            { action: "getCurrentDomain" },
            (response) => {
              clearTimeout(timeout);
              if (chrome.runtime.lastError) {
                console.error(
                  "Error getting current domain:",
                  chrome.runtime.lastError
                );
                resolve(null);
              } else {
                resolve(response);
              }
            }
          );
        });

        if (domainResponse && domainResponse.domain) {
          // Check if domain is whitelisted with timeout
          const whitelistResponse = await new Promise((resolve) => {
            const timeout = setTimeout(
              () => resolve({ isWhitelisted: false }),
              1000
            );

            chrome.runtime.sendMessage(
              { action: "checkDomainWhitelist", domain: domainResponse.domain },
              (response) => {
                clearTimeout(timeout);
                if (chrome.runtime.lastError) {
                  console.error(
                    "Error checking whitelist:",
                    chrome.runtime.lastError
                  );
                  resolve({ isWhitelisted: false });
                } else {
                  resolve(response);
                }
              }
            );
          });

          dispatch({
            type: actionTypes.SET_DOMAIN_INFO,
            domain: domainResponse.domain,
            isWhitelisted: whitelistResponse.isWhitelisted,
          });
        }
      } catch (error) {
        console.error("Extension initialization error:", error);
      } finally {
        dispatch({ type: actionTypes.SET_LOADING, value: false });
      }
    };

    initializeExtension();

    // Listen for storage changes to update state in real-time
    const storageListener = (changes, namespace) => {
      if (namespace === "local") {
        const updates = {};

        if (changes.domainStats) {
          updates.domainStats = changes.domainStats.newValue || {};
        }
        if (changes.navigationGuardEnabled) {
          updates.navigationGuardEnabled =
            changes.navigationGuardEnabled.newValue;
        }
        if (changes.navigationStats) {
          updates.navigationStats = changes.navigationStats.newValue || {
            blockedCount: 0,
            allowedCount: 0,
          };
        }
        if (changes.patternRulesEnabled) {
          updates.patternRulesEnabled = changes.patternRulesEnabled.newValue;
        }
        if (changes.defaultRulesEnabled) {
          updates.defaultRulesEnabled = changes.defaultRulesEnabled.newValue;
        }
        if (changes.customRulesEnabled) {
          updates.customRulesEnabled = changes.customRulesEnabled.newValue;
        }
        if (changes.defaultBlockRequestEnabled) {
          updates.defaultBlockRequestEnabled =
            changes.defaultBlockRequestEnabled.newValue;
        }

        if (Object.keys(updates).length > 0) {
          dispatch({ type: actionTypes.LOAD_SETTINGS, payload: updates });
        }
      }
    };

    chrome.storage.onChanged.addListener(storageListener);

    // Cleanup listener on unmount
    return () => {
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, []);

  if (state.loading) {
    return <Loading />;
  }

  return (
    <div className="w-90 rounded-lg h-auto p-0 bg-[#F9F8FB]">
      <header className="flex w-full items-center justify-end pr-2">
        <H1 color="accent" align="center" className="text-[26px]">
          JustUI
        </H1>
      </header>

      <main className="p-4 pt-0 space-y-4">
        {/* Extension Status */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              Extension Status
            </h2>
            <p className="text-sm text-gray-600">
              {state.isActive ? "Active" : "Inactive"}
            </p>
          </div>
          <Switch checked={state.isActive} onChange={handleToggle} />
        </div>

        <CurrentDomain
          domain={state.domain.current}
          isWhitelisted={state.domain.isWhitelisted}
          onWhitelistToggle={handleWhitelistToggle}
        />

        <DefaultSections
          state={state}
          handleProtectionToggle={handleProtectionToggle}
        />

        <NavigationStats state={state} />

        {/* Statistics */}
        {state.domain.current && (
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-md font-semibold text-gray-800">
                Removal Stats
              </h3>
              {state.stats.domain[state.domain.current] && (
                <button
                  onClick={handleResetStats}
                  className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded transition-colors"
                  title="Reset statistics for this domain"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Default Rules:</span>
                <span className="text-sm font-semibold text-purple-600">
                  {state.stats.domain[state.domain.current]
                    ?.defaultRulesRemoved || 0}{" "}
                  elements
                </span>
              </div>
              {!!state.stats.domain[state.domain.current]
                ?.customRulesRemoved && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Custom Rules:</span>
                  <span className="text-sm font-semibold text-violet-600">
                    {state.stats.domain[state.domain.current]
                      ?.customRulesRemoved || 0}{" "}
                    elements
                  </span>
                </div>
              )}
              <div className="pt-2 mt-2 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-800">
                    Total:
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    {(state.stats.domain[state.domain.current]
                      ?.defaultRulesRemoved || 0) +
                      (state.stats.domain[state.domain.current]
                        ?.customRulesRemoved || 0)}{" "}
                    elements
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Settings Link */}
        <div className="pt-4 border-t border-gray-600">
          <button
            onClick={() =>
              chrome.tabs.create({
                url: chrome.runtime.getURL("settings.html"),
              })
            }
            className="w-full px-3 py-2 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors flex items-center justify-center gap-2"
          >
            ⚙️ Advanced Settings
          </button>
        </div>
      </main>
    </div>
  );
}
