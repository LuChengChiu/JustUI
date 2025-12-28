/**
 * Centralized configuration for all rule sources (DRY principle)
 */
export const RULE_SOURCES_CONFIG = {
  customPatterns: {
    name: "Custom User Patterns",
    idRange: { start: 60000, end: 64999 },
    updateInterval: 0, // Manual updates only
    updateType: "dynamic",
  },

  easylist: {
    thirdparty: {
      name: "EasyList Thirdparty",
      url: "https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_thirdparty.txt",
      idRange: { start: 10000, end: 11999 },
      updateInterval: 10080, // 7 days
      updateType: "dynamic",
    },
    specificBlock: {
      name: "EasyList Specific Block",
      url: "https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_specific_block.txt",
      idRange: { start: 12000, end: 12999 },
      updateInterval: 10080, // 7 days
      updateType: "dynamic",
    },
    adservers: {
      name: "EasyList Adservers",
      url: "https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_adservers.txt",
      idRange: { start: 1, end: 50000 },
      updateType: "static", // Built at compile-time
    },
  },

  defaultBlocks: {
    name: "Default Block Requests",
    // NOTE: Update this URL to point to your GitHub repository after publishing
    // For local development, the extension will use the bundled file
    url: "https://raw.githubusercontent.com/LuChengChiu/OriginalUI/main/src/network-blocking/data/default-block-requests.json",
    idRange: { start: 50000, end: 50999 },
    updateInterval: 1440, // 24 hours
    updateType: "dynamic",
  },
};
