import type { SVGProps } from "react";

const PATHS = {
  dashboard: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z",
  transactions: "M7 7h13 M16 3l4 4-4 4 M17 17H4 M8 13l-4 4 4 4",
  collect: "M3 6h18v12H3z M3 10h18 M7 15h4",
  customers:
    "M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20 M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7 M21 20v-1.5a4 4 0 0 0-3-3.87 M16 4.13a3.5 3.5 0 0 1 0 6.75",
  merchants: "M4 9l1.5-5h13L20 9 M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 M5 12v8h14v-8 M10 20v-5h4v5",
  settlements: "M3 10l9-6 9 6 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 21h18",
  developers: "M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16",
  settings: "M4 7h10 M18 7h2 M4 17h2 M10 17h10 M16 5v4 M8 15v4",
  bell: "M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7 M10 20a2 2 0 0 0 4 0",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14 M20 20l-4-4",
  filter: "M3 5h18l-7 8v6l-4-2v-4z",
  download: "M12 4v11 M7 11l5 5 5-5 M4 20h16",
  plus: "M12 5v14 M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12 M18 6L6 18",
  alert: "M12 4l9.5 16h-19z M12 10v4 M12 17.5v.5",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 11v5 M12 7.5v.5",
  "chevron-left": "M15 6l-6 6 6 6",
  "chevron-right": "M9 6l6 6-6 6",
  "chevron-down": "M6 9l6 6 6-6",
  "sort-both": "M8 9l4-4 4 4 M16 15l-4 4-4-4",
  "sort-up": "M7 14l5-5 5 5",
  "sort-down": "M7 10l5 5 5-5",
  copy: "M9 9h10v11H9z M5 15V4h10",
  refresh: "M20 11a8 8 0 0 0-14.5-4.5L4 8 M4 4v4h4 M4 13a8 8 0 0 0 14.5 4.5L20 16 M20 20v-4h-4",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
  menu: "M4 7h16 M4 12h16 M4 17h16",
  external: "M14 4h6v6 M20 4l-9 9 M18 14v5H5V6h5",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21c1-4 4-6 8-6s7 2 8 6",
  refund: "M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 7v5l3 2",
  lock: "M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3",
  flask: "M9 3h6 M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3",
  play: "M7 4l13 8-13 8z",
  ban: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M5.6 5.6l12.8 12.8",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  home: "M4 11.5 12 4l8 7.5 M6 10v9h12v-9",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13",
} as const;

export type IconName = keyof typeof PATHS;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

/** Icônes à trait (24×24), décoratives par défaut (`aria-hidden`). */
export function Icon({ name, size = 18, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
