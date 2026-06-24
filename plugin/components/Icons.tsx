import type { ReactNode } from "react";

function Svg({ children, className = "h-6 w-6" }: { children: ReactNode; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9">
      {children}
    </svg>
  );
}

export function CloseIcon({ className }: { className?: string }) {
  return <Svg className={className}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
}

export function ChevronIcon({ className }: { className?: string }) {
  return <Svg className={className}><path d="m6 9 6 6 6-6" /></Svg>;
}

export function CopyIcon({ className }: { className?: string }) {
  return <Svg className={className}><rect x="9" y="9" width="10" height="10" rx="2" /><rect x="5" y="5" width="10" height="10" rx="2" /></Svg>;
}

export function EmptyQrIcon({ className }: { className?: string }) {
  return <Svg className={className}><path d="m15 18-.722-3.25" /><path d="M2 8a10.645 10.645 0 0 0 20 0" /><path d="m20 15-1.726-2.05" /><path d="m4 15 1.726-2.05" /><path d="m9 18 .722-3.25" /></Svg>;
}

export function EyeIcon({ className }: { className?: string }) {
  return <Svg className={className}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>;
}

export function EyeOffIcon({ className }: { className?: string }) {
  return <Svg className={className}><path d="M3 3l18 18" /><path d="M10.6 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18.3 18.3 0 0 1-3.2 4.1" /><path d="M6.7 6.7C4.1 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.5-.4 4.9-1" /><path d="M9.9 9.9A3 3 0 0 0 14.1 14.1" /></Svg>;
}

export function GlobeIcon() {
  return <Svg><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9S14.6 18.3 12 21M12 3c-2.6 2.7-3.9 5.7-3.9 9s1.3 6.3 3.9 9" /></Svg>;
}

export function PowerIcon() {
  return <Svg><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /></Svg>;
}

export function PlusIcon({ className }: { className?: string }) {
  return <Svg className={className}><path d="M12 5v14M5 12h14" /></Svg>;
}

export function ServerIcon() {
  return <Svg><rect width="20" height="8" x="2" y="2" rx="2" ry="2" /><rect width="20" height="8" x="2" y="14" rx="2" ry="2" /><line x1="6" x2="6.01" y1="6" y2="6" /><line x1="6" x2="6.01" y1="18" y2="18" /></Svg>;
}

export function SettingsIcon() {
  return <Svg><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" /></Svg>;
}

export function ShieldIcon() {
  return <Svg><path d="M12 3l7 3v5c0 4.4-2.8 8.3-7 10-4.2-1.7-7-5.6-7-10V6l7-3z" /><path d="m9.5 12 1.8 1.8 3.5-4" /></Svg>;
}
