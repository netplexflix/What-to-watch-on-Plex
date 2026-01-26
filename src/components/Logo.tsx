import { Film } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const Logo = ({ size = "md", className }: LogoProps) => {
  const sizes = {
    sm: { icon: 20, text: "text-lg" },
    md: { icon: 28, text: "text-2xl" },
    lg: { icon: 40, text: "text-4xl" },
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative">
        <Film size={sizes[size].icon} className="text-primary" />
        <div className="absolute inset-0 blur-md bg-primary/30 -z-10" />
      </div>
      <span className={cn("font-bold tracking-tight", sizes[size].text)}>
        <span className="text-foreground">What to</span>{" "}
        <span className="text-gradient">Watch?</span>
      </span>
    </div>
  );
};