import { useMemo, useSyncExternalStore } from "react";
import { CheckIcon, Columns3, RotateCcw } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  COMPACT_LIST_MAX_WIDTH,
  getListAreaWidth,
  getListColumns,
  hasCustomListColumns,
  LIST_COLUMNS,
  listColumnLayout,
  resetListColumns,
  subscribeListAreaWidth,
  subscribeListColumns,
  toggleListColumn,
} from "../listColumns";
import { filterIndicatorClassName, filterOptionClassName } from "./SearchControls";
import { dockSurfaceClassName } from "./viewerDockStyles";

/**
 * Picks which list-view columns show; sits in the dock where the zoom slider is in other views.
 * Narrow results areas always use the compact list, which has no columns to pick, so it hides there.
 */
export function ListColumnsMenu() {
  const columns = useSyncExternalStore(subscribeListColumns, getListColumns, getListColumns);
  const areaWidth = useSyncExternalStore(subscribeListAreaWidth, getListAreaWidth, getListAreaWidth);
  const minWidth = useMemo(() => listColumnLayout(columns).minWidth, [columns]);
  // Subscribed on its own: a reset can leave the columns unchanged (they already match the defaults).
  const custom = useSyncExternalStore(subscribeListColumns, hasCustomListColumns, hasCustomListColumns);
  if (areaWidth < COMPACT_LIST_MAX_WIDTH) return null;
  return (
    <DropdownMenu modal={false}>
      <div className={dockSurfaceClassName}>
        <DropdownMenuTrigger asChild>
          <button
            id="listColumnsButton"
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-full border-0 bg-transparent px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted data-[state=open]:bg-muted"
            aria-label="Columns"
            title="Columns"
          >
            <Columns3 className="size-[18px]" aria-hidden="true" />
            <span className="max-[540px]:hidden">Columns</span>
          </button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent
        id="listColumnsMenu"
        side="top"
        align="end"
        sideOffset={8}
        className="max-h-[min(420px,var(--radix-dropdown-menu-content-available-height))] w-52 rounded-xl p-1.5"
      >
        <DropdownMenuLabel className="px-2 text-xs font-medium text-muted-foreground">Columns</DropdownMenuLabel>
        {areaWidth < minWidth ? (
          <p id="listColumnsTooWide" className="m-0 px-2 pb-2 text-xs leading-snug text-muted-foreground" role="status">
            Not enough room for a table, so these columns show as a compact list. Turn some off or widen the window for the table.
          </p>
        ) : null}
        {LIST_COLUMNS.map((column) => (
          <DropdownMenuPrimitive.CheckboxItem
            key={column.id}
            data-slot="dropdown-menu-checkbox-item"
            data-list-column={column.id}
            className={filterOptionClassName}
            checked={columns.includes(column.id)}
            // Keep the menu open so several columns can be switched in one go.
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => toggleListColumn(column.id, checked === true)}
          >
            <span className={cn(filterIndicatorClassName, "rounded-[5px]")} aria-hidden="true">
              <DropdownMenuPrimitive.ItemIndicator>
                <CheckIcon className="size-3" strokeWidth={3} />
              </DropdownMenuPrimitive.ItemIndicator>
            </span>
            <span className="truncate">{column.label}</span>
          </DropdownMenuPrimitive.CheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          id="listColumnsReset"
          className="rounded-lg px-2 py-2 text-muted-foreground"
          disabled={!custom}
          onSelect={(event) => {
            event.preventDefault();
            resetListColumns();
          }}
        >
          <RotateCcw aria-hidden="true" />
          Reset to default
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

