import { MoonIcon, SunIcon } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { settings, setTheme } = useSettings();
  const isDark = settings.theme
    ? settings.theme === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <MoonIcon /> : <SunIcon />}
      <span className="sr-only">Toggle dark mode</span>
    </Button>
  );
}
