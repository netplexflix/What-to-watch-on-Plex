import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "swipe-yes" | "swipe-no";
  size?: "sm" | "md" | "lg";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = "default", size = "md", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-secondary hover:bg-secondary/80 text-secondary-foreground": variant === "default",
            "hover:bg-secondary/50 text-muted-foreground hover:text-foreground": variant === "ghost",
            "bg-primary/20 hover:bg-primary/40 text-primary border-2 border-primary/50 hover:border-primary glow-primary": variant === "swipe-yes",
            "bg-destructive/20 hover:bg-destructive/40 text-destructive border-2 border-destructive/50 hover:border-destructive": variant === "swipe-no",
          },
          {
            "h-8 w-8": size === "sm",
            "h-12 w-12": size === "md",
            "h-16 w-16": size === "lg",
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";
