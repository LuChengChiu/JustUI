import CheckboxCard from "./checkbox-card";
import MdiRadioTower from "../icons/MdiRadioTower";
import MdiShieldLinkVariant from "../icons/MdiShieldLinkVariant";
import { H3 } from "../ui/typography";

const navigationLabel = (
  <>
    Navigation <MdiShieldLinkVariant />
  </>
);

const patternLabel = (
  <>
    Pattern <MdiRadioTower />
  </>
);

export default function DefaultSections({ state, handleProtectionToggle }) {
  return (
    <div className="flex flex-col gap-y-1">
      <H3>Default Sections</H3>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <CheckboxCard
          id="defaultrules"
          label="Selector Rules"
          checked={state.protectionSystems.defaultRules}
          onChange={(newState) =>
            handleProtectionToggle("defaultRules", newState)
          }
        />
        <CheckboxCard
          id="patternrules"
          checked={state.protectionSystems.patternRules}
          label={patternLabel}
          onChange={(newState) =>
            handleProtectionToggle("patternRules", newState)
          }
        />
        <CheckboxCard
          id="requestblocking"
          checked={state.protectionSystems.requestBlocking}
          label="Block Requests"
          onChange={(newState) =>
            handleProtectionToggle("requestBlocking", newState)
          }
        />
        <CheckboxCard
          id="navigationguard"
          checked={state.protectionSystems.navigationGuard}
          label={navigationLabel}
          onChange={(newState) =>
            handleProtectionToggle("navigationGuard", newState)
          }
        />
      </div>
    </div>
  );
}
