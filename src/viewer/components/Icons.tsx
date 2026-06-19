import type { ReactNode } from "react";

function Icon({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <svg className={`h-5 w-5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2] ${className}`.trim()} viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

export function ChevronLeftIcon() {
  return (
    <Icon>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  );
}

export function InfoIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </Icon>
  );
}

export function PanelLeftOpenIcon() {
  return (
    <Icon>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <path d="m14 9 3 3-3 3" />
      <path d="M11 12h6" />
    </Icon>
  );
}

export function PanelRightOpenIcon() {
  return (
    <Icon>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M15 3v18" />
      <path d="m10 15-3-3 3-3" />
      <path d="M7 12h6" />
    </Icon>
  );
}

export function PanelTopCloseIcon() {
  return (
    <Icon>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="m9 14 3-3 3 3" />
      <path d="M12 11v6" />
    </Icon>
  );
}

export function PanelTopOpenIcon() {
  return (
    <Icon>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="m15 14-3 3-3-3" />
      <path d="M12 11v6" />
    </Icon>
  );
}

export function MaximizeIcon() {
  return (
    <Icon>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </Icon>
  );
}

export function PanelLeftIcon() {
  return (
    <Icon>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </Icon>
  );
}

export function SearchIcon() {
  return (
    <Icon className="flex-none text-muted-foreground">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Icon>
  );
}

export function XIcon() {
  return (
    <Icon>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  );
}
