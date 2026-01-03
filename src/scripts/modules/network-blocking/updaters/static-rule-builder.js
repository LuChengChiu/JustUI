import fs from "fs/promises";
import path from "path";
import Logger from "../../../utils/logger.js";

/**
 * Builds static rulesets at compile-time (for adservers)
 */
export class StaticRuleBuilder {
  constructor(outputPath) {
    this.outputPath = outputPath;
  }

  async build(rules, metadata = {}) {
    // Ensure output directory exists
    await fs.mkdir(this.outputPath, { recursive: true });

    const rulesetPath = path.join(this.outputPath, 'easylist-adservers.json');
    await fs.writeFile(rulesetPath, JSON.stringify(rules, null, 2));

    // Save metadata
    const metadataPath = path.join(path.dirname(this.outputPath), 'metadata.json');
    await fs.writeFile(
      metadataPath,
      JSON.stringify({
        ...metadata,
        generatedAt: new Date().toISOString(),
        ruleCount: rules.length
      }, null, 2)
    );

    Logger.info(
      "NetworkBlocking:StaticRuleBuilder",
      `Built static ruleset: ${rules.length} rules → ${rulesetPath}`
    );
  }
}
