import IconExpandButton from "@/components/ui/button/icon-expand";
import { H3, Text } from "@/components/ui/typography";

export default function CurrentDomain({
  domain,
  isWhitelisted,
  onWhitelistToggle,
  errorMessage,
}) {
  if (!domain) return null;

  return (
    <div className="flex flex-col card-purple gap-y-1">
      <div className="flex items-center w-full justify-between">
        <H3>Current Domain</H3>
        <IconExpandButton
          icon={isWhitelisted ? "minus" : "plus"}
          onClick={onWhitelistToggle}
        >
          {isWhitelisted ? "from Whitelist" : "to Whitelist"}
        </IconExpandButton>
      </div>

      <Text className="italic font-days-one text-truncate">{domain}</Text>

      {errorMessage && (
        <Text className="text-xs text-[#B23B3B]">{errorMessage}</Text>
      )}
    </div>
  );
}
