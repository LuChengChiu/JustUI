import SettingsCheckbox from "@/components/ui/checkbox/settings-checkbox";
import TagsInput from "@/components/ui/tags-input";
import { H1, H3, Text } from "@/components/ui/typography";

const DEFAULT_BLOCK_URL =
  "https://github.com/LuChengChiu/OriginalUI/blob/main/src/data/defaultBlockRequests.json";

export default function BlockRequestsManager({
  checked,
  values,
  onToggleCheck,
  onChange,
}) {
  return (
    <div className="space-y-3">
      <H1 color="primary">Network Block Request</H1>

      <SettingsCheckbox
        checked={checked}
        onChange={onToggleCheck}
        label="Apply Default Network Block"
      >
        <div className="flex gap-1">
          <Text variant="caption" color="muted">
            Checkout the default block domains in:
          </Text>
          <a
            href={DEFAULT_BLOCK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-accent cursor-pointer underline italic"
          >
            Github OriginalUI Block Domains
          </a>
        </div>
      </SettingsCheckbox>

      <div className="flex flex-col space-y-1.5">
        <H3 color="primary" className="mb-0">
          Custom Request Block Domains
        </H3>
        <Text color="muted">
          URL patterns to block network requests (supports wildcards)
        </Text>

        <TagsInput.Root
          value={values}
          onChange={onChange}
          size="md"
          maxLines={3}
          variant="outline"
          placeholder="Add URL pattern..."
          className="w-full"
        >
          <TagsInput.Control>
            <TagsInput.Items />
            <TagsInput.Input placeholder="*://ads.example.com/*" />
          </TagsInput.Control>
        </TagsInput.Root>
      </div>
    </div>
  );
}
