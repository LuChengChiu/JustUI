import ShieldLink from "@/components/icons/shield-link";
import { H3 } from "@/components/ui/typography";
import PopupToggle from "@/components/ui/checkbox/popup-toggle";

const navigationLabel = (
  <>
    Navigation <ShieldLink />
  </>
);

export default function DefaultSections({ state, handleProtectionToggle }) {
  return (
    <div className="flex flex-col gap-y-1 card-purple">
      <H3>Default Sections</H3>

      <div className="grid grid-cols-2 gap-2">
        <PopupToggle
          id="defaultrules"
          label="Selector Rules"
          checked={state.protectionSystems.defaultRules}
          onChange={(newState) =>
            handleProtectionToggle("defaultRules", newState)
          }
        />
        <PopupToggle
          id="requestblocking"
          checked={state.protectionSystems.requestBlocking}
          label="Block Requests"
          onChange={(newState) =>
            handleProtectionToggle("requestBlocking", newState)
          }
        />
        <PopupToggle
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
