import Button from "../ui/button";
import IconExpandButton from "../ui/button/icon-expand";
import { H3, Text } from "../ui/typography";

export default function CurrentDomain({
  domain,
  isWhitelisted,
  onWhitelistToggle,
}) {
  if (!domain) return null;

  return (
    <div className="px-4 py-3 bg-[#bb92e7]/20 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <H3>Current Domain</H3>
        {/* <Text
          className={`${
            isWhitelisted
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-800"
          }`}
        >
          {isWhitelisted ? "Whitelisted" : "Not Whitelisted"}
        </Text> */}
      </div>

      <div className="flex"></div>
      <Text className="italic font-days-one">{domain}</Text>

      <IconExpandButton>
        {isWhitelisted ? "Remove from Whitelist" : "Add to Whitelist"}
      </IconExpandButton>

      <Button onClick={onWhitelistToggle} variant="primary" size="sm">
        {isWhitelisted ? "Remove from Whitelist" : "Add to Whitelist"}
      </Button>
    </div>
  );
}
