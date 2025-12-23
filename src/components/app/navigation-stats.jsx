import { H3 } from "../ui/typography";

export default function NavigationStats({ state }) {
  return (
    <div className="py-4 bg-gray-50 rounded-lg">
      <H3>Navigation Guardian Stats</H3>

      {state.protectionSystems.navigationGuard && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="text-center p-2 bg-red-50 rounded">
            <div className="text-lg font-bold text-red-600">
              {state.stats.navigation.blockedCount}
            </div>
            <div className="text-xs text-red-700">Blocked</div>
          </div>
          <div className="text-center p-2 bg-green-50 rounded">
            <div className="text-lg font-bold text-green-600">
              {state.stats.navigation.allowedCount}
            </div>
            <div className="text-xs text-green-700">Allowed</div>
          </div>
        </div>
      )}
    </div>
  );
}
