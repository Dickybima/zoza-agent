import { cn } from "@/lib/utils";

/**
 * Zoza mark — an agent head with a scanning visor and signal antenna, inside
 * a three-arc token ring. Monochrome (currentColor) with the signal accent,
 * so it sits naturally on the ASCII theme in light and dark mode.
 */
export function Logo({ className, animated = true }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("size-8", className)}>
      <circle
        cx="32"
        cy="35"
        r="21"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="32.98 11"
        transform="rotate(-75 32 35)"
      />
      <path d="M32 24v-11" stroke="var(--signal)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="9.5" r="3.6" fill="var(--signal)" />
      <rect x="20" y="24" width="24" height="20" rx="8" fill="currentColor" />
      <rect x="24" y="31" width="16" height="6" rx="3" fill="var(--background)" />
      <circle cx="31" cy="34" r="1.9" fill="var(--signal)">
        {animated ? (
          <animate attributeName="cx" values="27;37;27" dur="3.2s" repeatCount="indefinite" />
        ) : null}
      </circle>
    </svg>
  );
}
