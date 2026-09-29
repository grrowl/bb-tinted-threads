import { useAtom, useAtomValue } from "jotai";
import { Icon } from "@/components/ui/icon";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { sidebarOrganizationModeAtom } from "../preferences/atoms.js";
import { hideEmptySectionsAtom } from "./atoms.js";

/** Only project sections can be empty, so the toggle only shows By project. */
export function HideEmptySectionsMenuItem() {
  const organization = useAtomValue(sidebarOrganizationModeAtom);
  const [hideEmpty, setHideEmpty] = useAtom(hideEmptySectionsAtom);
  if (organization !== "project") return null;
  return (
    <DropdownMenuItem
      role="menuitemcheckbox"
      aria-checked={hideEmpty}
      onSelect={(event) => {
        event.preventDefault();
        setHideEmpty(!hideEmpty);
      }}
    >
      Hide empty
      <span className="ml-auto inline-flex size-4 shrink-0 items-center justify-center">
        {hideEmpty && <Icon name="Check" className="size-4" />}
      </span>
    </DropdownMenuItem>
  );
}

/**
 * Whether a project section should be left out: the preference is on, its
 * threads have loaded, and nothing is left to show after filtering. The
 * active project always stays so a new thread there has somewhere to land.
 */
export function isHiddenEmptyProject({
  hideEmpty,
  isActive,
  isLoaded,
  rootItemCount,
}: {
  hideEmpty: boolean;
  isActive: boolean;
  isLoaded: boolean;
  rootItemCount: number;
}): boolean {
  return hideEmpty && isLoaded && !isActive && rootItemCount === 0;
}
