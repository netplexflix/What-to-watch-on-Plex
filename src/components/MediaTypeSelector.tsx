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
      <div className="grid grid-cols-3 gap-3">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              haptics.selection();
              onChange(option.value);
            }}
            className={cn(
              "relative flex flex-col items-center gap-2 p-4 rounded-xl transition-all duration-200",
              value === option.value
                ? "glass-card border-2 border-primary glow-primary"
                : "glass-card hover:border-muted-foreground/30"
            )}
          >
            {value === option.value && (
              <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <Check size={12} className="text-primary-foreground" />
              </div>
            )}
            <div
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center",
                value === option.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              )}
            >
              <option.icon size={20} />
            </div>
            <span className="font-medium text-foreground text-sm">{option.label}</span>
            <span className="text-xs text-muted-foreground text-center">{option.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
