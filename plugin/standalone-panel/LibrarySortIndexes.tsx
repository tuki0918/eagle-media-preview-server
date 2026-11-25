import { ChevronIcon } from "../components/Icons";
import { SortIndexProgress } from "../components/ServerStatusPanel";
import type { PanelLibrarySortIndex } from "../service/standalonePanel.cjs";

const title = "Advanced Sort Index";
const titleStyle = "text-[10.5px] font-semibold uppercase leading-tight tracking-[0.06em] text-[#7a7f88]";
const frameStyle = "mt-4 min-w-0 rounded-xl border border-[#e6e6e9]";

function LibraryIndexRow({ library }: { library: PanelLibrarySortIndex }) {
  if (library.status === "building" || library.status === "ready") {
    return <SortIndexProgress sortIndex={library} libraryName={library.name} />;
  }

  const waiting = library.status === "waiting";
  const label = waiting ? "Waiting to scan" : library.status === "failed" ? "Scan failed" : "Unavailable";
  return (
    <div className="grid min-w-0 gap-1">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[12px]">
        <span className="min-w-0 break-words font-semibold text-[#171717]">{library.name}</span>
        <span className={waiting ? "text-[#5f6670]" : "text-[#b42318]"}>{label}</span>
      </div>
      {"reason" in library && <p className="m-0 break-words text-[11.5px] text-[#5f6670]">{library.reason}</p>}
    </div>
  );
}

export function LibrarySortIndexes({ libraries }: { libraries: PanelLibrarySortIndex[] }) {
  if (!libraries.length) return null;

  if (libraries.length === 1) {
    return (
      <div className={`${frameStyle} grid gap-2 px-3 py-2.5`}>
        <span className={titleStyle}>{title}</span>
        <LibraryIndexRow library={libraries[0]} />
      </div>
    );
  }

  const counts = { ready: 0, building: 0, waiting: 0, failed: 0, unavailable: 0 };
  for (const library of libraries) counts[library.status] += 1;
  const progress = [
    `${counts.ready} / ${libraries.length} libraries ready`,
    counts.building && `${counts.building} scanning`,
    counts.waiting && `${counts.waiting} waiting`,
    counts.failed && `${counts.failed} failed`,
    counts.unavailable && `${counts.unavailable} unavailable`,
  ].filter(Boolean).join(" · ");

  return (
    <details className={`${frameStyle} group`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-[#f7f7f8] [&::-webkit-details-marker]:hidden">
        <span className="grid min-w-0 flex-1 gap-1">
          <span className={titleStyle}>{title}</span>
          <span className={`text-[11.5px] ${counts.failed || counts.unavailable ? "text-[#b42318]" : "text-[#5f6670]"}`}>{progress}</span>
        </span>
        <ChevronIcon className="h-3.5 w-3.5 shrink-0 text-[#5f6670] transition-transform group-open:rotate-180" />
      </summary>
      <ul className="m-0 list-none divide-y divide-[#efeff1] border-t border-[#e6e6e9] px-3">
        {libraries.map((library) => (
          <li key={library.id} className="py-2.5">
            <LibraryIndexRow library={library} />
          </li>
        ))}
      </ul>
    </details>
  );
}
