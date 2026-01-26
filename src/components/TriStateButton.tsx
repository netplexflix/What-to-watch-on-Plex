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
}

export const TriStateButton = ({
  label,
  state,
  onToggle,
  icon,
  description,
  variant = "chip",
}: TriStateButtonProps) => {
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
    if (state === true) {
      return <Check size={14} className="shrink-0" />;
    }
    if (state === false) {
      return <X size={14} className="shrink-0" />;
    }
    return null;
  };

  if (variant === "card") {
    return (
      <button
        onClick={onToggle}
        className={cn(
          "flex flex-col items-start p-4 rounded-xl transition-all duration-200 border-2",
          getStateClasses(),
          state === true && "glow-primary"
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          {icon}
          {getIndicator()}
        </div>
        <span className="font-medium">{label}</span>
        {description && (
          <span className="text-xs opacity-80">{description}</span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border-2",
        getStateClasses()
      )}
    >
      {getIndicator()}
      {label}
    </button>
  );
};
