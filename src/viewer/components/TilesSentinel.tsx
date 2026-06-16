import { useCallback, useSyncExternalStore } from "react";
import {
  getTilesSentinelState,
  setTilesSentinelElement,
  subscribeTilesSentinelState,
} from "../tilesSentinelState";

interface TilesSentinelProps {
  hidden?: boolean;
  text?: string;
}

export function TilesSentinel({ hidden, text }: TilesSentinelProps) {
  const state = useSyncExternalStore(subscribeTilesSentinelState, getTilesSentinelState, getTilesSentinelState);
  const setElement = useCallback((node: HTMLDivElement | null) => {
    setTilesSentinelElement(node);
  }, []);
  const displayHidden = hidden ?? state.hidden;
  const displayText = text ?? state.text;

  return (
    <div
      ref={setElement}
      id="tilesSentinel"
      className="tiles-sentinel mt-3 grid min-h-[52px] place-items-center text-[13px] font-[680] text-muted-foreground"
      hidden={displayHidden}
    >
      {displayText}
    </div>
  );
}
