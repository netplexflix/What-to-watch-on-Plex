import { cn } from "@/lib/utils";

interface SessionCodeDisplayProps {
  code: string;
  className?: string;
}

export const SessionCodeDisplay = ({ code, className }: SessionCodeDisplayProps) => {
  return (
    <div className={cn("flex gap-2", className)}>
      {code.split("").map((char, i) => (
        <div
          key={i}
          className="w-12 h-14 flex items-center justify-center glass-card rounded-lg text-2xl font-bold text-foreground"
        >
          {char}
        </div>
      ))}
    </div>
  );
};
