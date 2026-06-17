import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

const Toaster = ({ ...props }: ToasterProps) => {
  const isMobile = useIsMobile();
  const { position = isMobile ? "bottom-center" : "bottom-right", style, ...toasterProps } = props;

  return (
    <Sonner
      className="toaster group"
      closeButton={false}
      duration={2200}
      position={position}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          zIndex: 100,
          ...style,
        } as CSSProperties
      }
      mobileOffset={{
        top: "calc(12px + env(safe-area-inset-top))",
        right: "12px",
        bottom: "calc(12px + env(safe-area-inset-bottom))",
        left: "12px",
      }}
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...toasterProps}
    />
  );
};

export { Toaster };
