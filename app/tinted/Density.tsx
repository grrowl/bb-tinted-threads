import { useEffect } from "react";
import { useAtom, useAtomValue } from "jotai";
import { Icon } from "@/components/ui/icon";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { Density } from "../../shared/tinted-preferences.js";
import { densityAtom } from "./atoms.js";

const DENSITY_OPTIONS: readonly { label: string; density: Density }[] = [
  { label: "Default", density: "default" },
  { label: "Comfortable", density: "comfortable" },
  { label: "Compact", density: "compact" },
];

/**
 * Mirrors the density preference onto <html> so the injected stylesheet can
 * raise `--bb-sidebar-row-height`; every row height (and the sticky stack's
 * stride, and the subtitle row) derives from it.
 */
export function DensitySync() {
  const density = useAtomValue(densityAtom);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.tintedDensity = density;
    return () => {
      delete root.dataset.tintedDensity;
    };
  }, [density]);
  return null;
}

export function DensityMenuItems() {
  const [density, setDensity] = useAtom(densityAtom);
  return (
    <>
      {DENSITY_OPTIONS.map((option) => (
        <DropdownMenuItem
          key={option.density}
          role="menuitemradio"
          aria-checked={density === option.density}
          onSelect={(event) => {
            event.preventDefault();
            setDensity(option.density);
          }}
        >
          {option.label}
          <span className="ml-auto inline-flex size-4 shrink-0 items-center justify-center">
            {density === option.density && (
              <Icon name="Check" className="size-4" />
            )}
          </span>
        </DropdownMenuItem>
      ))}
    </>
  );
}
