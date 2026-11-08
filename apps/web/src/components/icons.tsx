import type { ReactNode } from "react";

// The icons of the app, drawn inline (docs/design.md §11.6: no images, no icon package; a dozen at most).

type IconProps = { className?: string };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function Icon({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...stroke}>
      {children}
    </svg>
  );
}

export function PlusIcon({ className = "size-5" }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function MinusIcon({ className = "size-5" }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M5 12h14" />
    </Icon>
  );
}

export function CloseIcon({ className = "size-5" }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

export function ArrowLeftIcon({ className = "size-6" }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Icon>
  );
}

export function ChevronRightIcon({ className = "size-5" }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  );
}

export function ClockIcon({ className = "size-5" }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

export function PersonIcon({ className = "size-5" }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </Icon>
  );
}

export function TagIcon({ className = "size-5" }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9z" />
      <circle cx="8" cy="8" r="1.5" />
    </Icon>
  );
}

export function CardIcon({ className = "size-5" }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </Icon>
  );
}

export function TrashIcon({ className = "size-5" }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </Icon>
  );
}

export function CheckIcon({ className = "size-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...stroke} strokeWidth={2.5}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function BagIcon({ className = "size-5" }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </Icon>
  );
}
