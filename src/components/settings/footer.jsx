import { Text } from "@/components/ui/typography";
import { getVersion } from "@utils/manifest";

export default function Footer() {
  const currentVersion = getVersion();
  const currentYear = new Date().getFullYear();

  return (
    <div className="text-center mt-4">
      <Text color="muted" align="center">
        © {currentYear} OriginalUI v{currentVersion} Beta
      </Text>
    </div>
  );
}
