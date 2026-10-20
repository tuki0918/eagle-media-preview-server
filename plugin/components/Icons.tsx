import {
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  Plus,
  Power,
  QrCode,
  Server,
  Settings,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";

// Wraps lucide icons so the plugin panel shares the viewer's icon set.
function iconComponent(Icon: LucideIcon, defaultClassName = "h-6 w-6") {
  return function PluginIcon({ className = defaultClassName }: { className?: string }) {
    return <Icon className={className} aria-hidden="true" strokeWidth={2} />;
  };
}

export const CloseIcon = iconComponent(X);
export const CheckIcon = iconComponent(Check);
export const CopyIcon = iconComponent(Copy);
export const EmptyQrIcon = iconComponent(QrCode);
export const EyeIcon = iconComponent(Eye);
export const EyeOffIcon = iconComponent(EyeOff);
export const GlobeIcon = iconComponent(Globe);
export const KeyIcon = iconComponent(KeyRound);
export const LockIcon = iconComponent(Lock);
export const PlusIcon = iconComponent(Plus);
export const PowerIcon = iconComponent(Power);
export const ServerIcon = iconComponent(Server);
export const SettingsIcon = iconComponent(Settings);
export const ShieldIcon = iconComponent(ShieldCheck);

export function ChevronIcon({ className }: { className?: string }) {
  return <ChevronDown className={className} aria-hidden="true" strokeWidth={2} />;
}
