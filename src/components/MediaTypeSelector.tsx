// file: /src/components/MediaTypeSelector.tsx
import { Film, Tv, Clapperboard, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHaptics } from "@/hooks/useHaptics";

interface MediaTypeSelectorProps {
  value: "movies" | "shows" | "both" | undefined;
  onChange: (value: "movies" | "shows" | "both") => void;
  className?: string;
}

const options = [
  { value: "movies" as const, label: "Movies", icon: Film, description: "Feature films only" },
  { value: "shows" as const, label: "TV Shows", icon: Tv, description: "Series & episodes" },
  { value: "both" as const, label: "Either", icon: Clapperboard, description: "Movies & shows" },
];

export const MediaTypeSelector = ({ value, onChange, className }: MediaTypeSelectorProps) => {
  const haptics = useHaptics();
  return (
    <div className={cn("space-y-3", className)}>
      <label className="text-sm font-medium text-foreground">
        What are you in the mood for?
      </label>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              haptics.selection();
              onChange(option.value);
            }}
            className={cn(
              "relative flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all duration-200",
              value === option.value
                ? "glass-card border-2 border-primary glow-primary"
                : "glass-card hover:border-muted-foreground/30"
            )}
          >
            {value === option.value && (
              <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                <Check size={10} className="text-primary-foreground" />
              </div>
            )}
            <div
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center",
                value === option.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              )}
            >
              <option.icon size={18} />
            </div>
            <span className="font-medium text-foreground text-xs">{option.label}</span>
            <span className="text-[10px] text-muted-foreground text-center leading-tight">{option.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
};