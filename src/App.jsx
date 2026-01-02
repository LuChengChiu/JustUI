import { useEffect, useReducer, useRef } from "react";
import Loading from "./components/ui/loading";

import CurrentDomain from "./components/app/current-domain";
import DefaultSections from "./components/app/default-sections";
import NavigationStats from "./components/app/navigation-stats";
import RuleStates from "./components/app/rule-stats";
import Status from "./components/app/status";
import Gear from "./components/icons/gear";
import Button from "./components/ui/button";
import { H1 } from "./components/ui/typography";

// Action types
const actionTypes = {
  LOAD_SETTINGS: "LOAD_SETTINGS",
  TOGGLE_MAIN: "TOGGLE_MAIN",
  TOGGLE_PROTECTION_SYSTEM: "TOGGLE_PROTECTION_SYSTEM",
  UPDATE_PROTECTION_SYSTEMS: "UPDATE_PROTECTION_SYSTEMS",
  SET_DOMAIN_INFO: "SET_DOMAIN_INFO",
  UPDATE_STATS: "UPDATE_STATS",
  SET_LOADING: "SET_LOADING",
  SET_WHITELIST_ERROR: "SET_WHITELIST_ERROR",
};

// Initial state
const initialState = {
  isActive: false,
  protectionSystems: {
    navigationGuard: true,
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
  whitelistError: "",
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
    case actionTypes.UPDATE_PROTECTION_SYSTEMS:
      return {
        ...state,
        protectionSystems: {
          ...state.protectionSystems,
          ...action.systems,
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
    case actionTypes.SET_WHITELIST_ERROR:
      return { ...state, whitelistError: action.message || "" };
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
  const whitelistTimeoutRef = useRef(null);
  const whitelistErrorTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  const currentDomain = state?.domain?.current ?? "";
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

  const setWhitelistError = (message) => {
    dispatch({ type: actionTypes.SET_WHITELIST_ERROR, message });

    if (whitelistErrorTimeoutRef.current) {
      clearTimeout(whitelistErrorTimeoutRef.current);
      whitelistErrorTimeoutRef.current = null;
    }

    if (message) {
      whitelistErrorTimeoutRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        dispatch({ type: actionTypes.SET_WHITELIST_ERROR, message: "" });
        whitelistErrorTimeoutRef.current = null;
      }, 3000);
    }
  };

  const handleWhitelistToggle = () => {
    if (!currentDomain) return;
    const whitelistAction = state.domain.isWhitelisted ? "remove" : "add";
    setWhitelistError("");

    if (whitelistTimeoutRef.current) {
      clearTimeout(whitelistTimeoutRef.current);
    }

    const timeout = setTimeout(() => {
      if (!isMountedRef.current) return;
      console.error("Timeout updating whitelist");
      setWhitelistError("Whitelist update timed out. Please try again.");
    }, 5000);
    whitelistTimeoutRef.current = timeout;

    chrome.runtime.sendMessage(
      {
        action: "updateWhitelist",
        domain: currentDomain,
        whitelistAction,
      },
      (response) => {
        clearTimeout(timeout);
        whitelistTimeoutRef.current = null;

        if (!isMountedRef.current) return;

        if (chrome.runtime.lastError) {
          console.error("Error updating whitelist:", chrome.runtime.lastError);
          setWhitelistError("Failed to update whitelist. Please try again.");
          return;
        }
        if (response && response.success) {
          dispatch({
            type: actionTypes.SET_DOMAIN_INFO,
            domain: currentDomain,
            isWhitelisted: !state.domain.isWhitelisted,
          });
          setWhitelistError("");
          return;
        }
        setWhitelistError(
          response?.message || "Whitelist update failed. Please try again."
        );
      }
    );
  };

  const handleResetStats = () => {
    if (!currentDomain) return;

    const updatedStats = { ...state.stats.domain };
    delete updatedStats[currentDomain];

    chrome.storage.local.set({ domainStats: updatedStats }, () => {
      dispatch({
        type: actionTypes.UPDATE_STATS,
        statType: "domain",
        stats: updatedStats,
      });
    });
  };

  const handleOpenSettings = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
  };

  useEffect(() => {
    const initializeExtension = async () => {
      try {
        // Load extension state from storage
        const settings = await storageAdapter.load();
        if (!isMountedRef.current) {
          return;
        }
        dispatch({ type: actionTypes.LOAD_SETTINGS, payload: settings });

        // Get current domain with timeout
        const domainResponse = await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            if (!isMountedRef.current) return;
            resolve(null);
          }, 1000); // 1 second timeout

          chrome.runtime.sendMessage(
            { action: "getCurrentDomain" },
            (response) => {
              clearTimeout(timeout);
              if (!isMountedRef.current) return;

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

        if (!isMountedRef.current) {
          return;
        }
        if (domainResponse && domainResponse.domain) {
          // Check if domain is whitelisted with timeout
          const whitelistResponse = await new Promise((resolve) => {
            const timeout = setTimeout(() => {
              if (!isMountedRef.current) return;
              resolve({ isWhitelisted: false });
            }, 1000);

            chrome.runtime.sendMessage(
              { action: "checkDomainWhitelist", domain: domainResponse.domain },
              (response) => {
                clearTimeout(timeout);
                if (!isMountedRef.current) return;

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

          if (!isMountedRef.current) {
            return;
          }
          dispatch({
            type: actionTypes.SET_DOMAIN_INFO,
            domain: domainResponse.domain,
            isWhitelisted: whitelistResponse.isWhitelisted,
          });
        }
      } catch (error) {
        console.error("Extension initialization error:", error);
      } finally {
        if (isMountedRef.current) {
          dispatch({ type: actionTypes.SET_LOADING, value: false });
        }
      }
    };

    initializeExtension();

    // Listen for storage changes to update state in real-time
    const storageListener = (changes, namespace) => {
      if (namespace === "local") {
        const protectionUpdates = {};
        const protectionStorageMap = {
          navigationGuardEnabled: "navigationGuard",
          defaultRulesEnabled: "defaultRules",
          customRulesEnabled: "customRules",
          defaultBlockRequestEnabled: "requestBlocking",
        };

        Object.keys(protectionStorageMap).forEach((storageKey) => {
          if (Object.prototype.hasOwnProperty.call(changes, storageKey)) {
            const systemKey = protectionStorageMap[storageKey];
            const newValue = changes[storageKey].newValue;
            protectionUpdates[systemKey] = newValue !== false;
          }
        });

        if (Object.keys(protectionUpdates).length > 0) {
          dispatch({
            type: actionTypes.UPDATE_PROTECTION_SYSTEMS,
            systems: protectionUpdates,
          });
        }

        if (Object.prototype.hasOwnProperty.call(changes, "domainStats")) {
          dispatch({
            type: actionTypes.UPDATE_STATS,
            statType: "domain",
            stats: changes.domainStats.newValue || {},
          });
        }

        if (Object.prototype.hasOwnProperty.call(changes, "navigationStats")) {
          dispatch({
            type: actionTypes.UPDATE_STATS,
            statType: "navigation",
            stats: changes.navigationStats.newValue || {
              blockedCount: 0,
              allowedCount: 0,
            },
          });
        }
      }
    };

    chrome.storage.onChanged.addListener(storageListener);

    // Cleanup listener on unmount
    return () => {
      isMountedRef.current = false;
      if (whitelistTimeoutRef.current) {
        clearTimeout(whitelistTimeoutRef.current);
      }
      if (whitelistErrorTimeoutRef.current) {
        clearTimeout(whitelistErrorTimeoutRef.current);
      }
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, []);

  useEffect(() => {
    setWhitelistError("");
  }, [currentDomain]);

  if (state.loading) {
    return <Loading />;
  }

  return (
    <div className="w-96 rounded-lg h-auto p-0 bg-[#F9F8FB]">
      <header className="flex w-full items-center justify-end pr-2 pb-1">
        <H1 color="accent" align="center" className="text-[26px]">
          OriginalUI
        </H1>
      </header>

      <main className="p-4 pt-0 space-y-2">
        <Status isActive={state.isActive} onChange={handleToggle} />

        <CurrentDomain
          domain={currentDomain}
          isWhitelisted={state.domain.isWhitelisted}
          onWhitelistToggle={handleWhitelistToggle}
          errorMessage={state.whitelistError}
        />

        <DefaultSections
          state={state}
          handleProtectionToggle={handleProtectionToggle}
        />

        <NavigationStats state={state} />

        <RuleStates
          domain={currentDomain}
          stats={state?.stats?.domain?.[currentDomain]}
          onResetStats={handleResetStats}
        />

        <Button
          variant="primary"
          onClick={handleOpenSettings}
          className="w-full flex gap-x-1.5 font-days-one"
        >
          <Gear /> Advanced Settings
        </Button>
      </main>
    </div>
  );
}
