import https from 'https';
import { StaticRuleBuilder } from '../src/scripts/modules/network-blocking/updaters/static-rule-builder.js';
import { EasyListParser } from '../src/scripts/modules/network-blocking/parsers/easylist-parser.js';
import { RuleConverter } from '../src/scripts/modules/network-blocking/core/rule-converter.js';
import { RULE_SOURCES_CONFIG } from '../src/scripts/modules/network-blocking/config/sources.config.js';

const ADSERVERS_CONFIG = RULE_SOURCES_CONFIG.easylist.adservers;
const OUTPUT_PATH = 'src/scripts/modules/network-blocking/data/rulesets';

/**
 * Fetch content from URL using https module
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Build static ruleset for adservers
 */
async function buildAdserversRuleset() {
  console.log('📥 Fetching easylist_adservers.txt...');
  const content = await fetchUrl(ADSERVERS_CONFIG.url);

  console.log('🔍 Parsing adserver rules...');
  const parser = new EasyListParser();
  const filters = await parser.parse(content);
  console.log(`Found ${filters.length} adserver filters`);

  console.log('🔄 Converting to declarativeNetRequest format...');
  const converter = new RuleConverter();
  const dnrRules = await converter.convert(filters, ADSERVERS_CONFIG.idRange);

  console.log('📦 Building static ruleset...');
  const builder = new StaticRuleBuilder(OUTPUT_PATH);
  await builder.build(dnrRules, {
    source: ADSERVERS_CONFIG.name,
    url: ADSERVERS_CONFIG.url,
    filterCount: filters.length,
    ruleCount: dnrRules.length
  });

  console.log(`✅ Built ${dnrRules.length} adserver blocking rules`);
}

buildAdserversRuleset().catch(console.error);
