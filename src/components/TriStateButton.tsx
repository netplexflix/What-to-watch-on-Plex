//file: /src/components/TriStateButton.tsx
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SelectionState } from "@/types/session";

interface TriStateButtonProps {
  label: string;
  state: SelectionState;
  onToggle: () => void;
  icon?: React.ReactNode;
  description?: string;
  variant?: "chip" | "card";
  size?: "default" | "sm";
  className?: string;
}

export const TriStateButton = ({
  label,
  state,
  onToggle,
  icon,
  description,
  variant = "chip",
  size = "default",
  className,
}: TriStateButtonProps) => {
  const isSmall = size === "sm";

  const getStateClasses = () => {
    if (state === true) {
      return "bg-green-600 text-white border-green-600";
    }
    if (state === false) {
      return "bg-destructive text-destructive-foreground border-destructive";
    }
    return "glass-card text-foreground hover:bg-secondary border-transparent";
  };

  const getIndicator = () => {
    const iconSize = isSmall ? 12 : 14;
    if (state === true) {
      return <Check size={iconSize} className="shrink-0" />;
    }
    if (state === false) {
      return <X size={iconSize} className="shrink-0" />;
    }
    return null;
  };

  if (variant === "card") {
    return (
      <button
        onClick={onToggle}
        className={cn(
          "flex flex-col items-start rounded-xl transition-all duration-200 border-2",
          isSmall ? "p-2.5" : "p-4",
          getStateClasses(),
          state === true && "glow-primary",
          className
        )}
      >
        <div className={cn("flex items-center gap-2", isSmall ? "mb-1" : "mb-2")}>
          {icon}
          {getIndicator()}
        </div>
        <span className={cn("font-medium", isSmall ? "text-xs" : "text-sm")}>{label}</span>
        {description && (
          <span className={cn("opacity-80", isSmall ? "text-[10px]" : "text-xs")}>{description}</span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium transition-all duration-200 border-2",
        isSmall ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        getStateClasses(),
        className
      )}
    >
      {getIndicator()}
      {label}
    </button>
  );
};