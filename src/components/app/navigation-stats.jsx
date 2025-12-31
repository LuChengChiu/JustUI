import { H3, H4 } from "@/components/ui/typography";

export default function NavigationStats({ state }) {
  return (
    <div className="card-purple">
      <H3>Navigation Guardian Stats</H3>

      {state.protectionSystems.navigationGuard && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="text-center p-2 justify-center items-center flex flex-col bg-red-50 rounded">
            <H4 className="!text-red-600">
              {state.stats.navigation.blockedCount}
            </H4>
            <div className="text-xs text-red-700">Blocked</div>
          </div>
          <div className="text-center p-2 justify-center items-center flex flex-col bg-green-50 rounded">
            <H4 className="text-green-600">
              {state.stats.navigation.allowedCount}
            </H4>
            <div className="text-xs text-green-700">Allowed</div>
          </div>
        </div>
      )}
    </div>
  );
}
