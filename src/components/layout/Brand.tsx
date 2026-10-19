export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="#12574F" />
      <path d="M10 22V10h6.6a4 4 0 0 1 0 8H13" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23" cy="22" r="2.2" fill="#00918B" />
    </svg>
  );
}

export function Brand({ orgName }: { orgName?: string }) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      <div className="leading-tight">
        <div className="font-serif text-[17px] font-semibold">PSP Sandbox</div>
        {orgName && <div className="max-w-[150px] truncate text-[12px] text-ink-muted">{orgName}</div>}
      </div>
    </div>
  );
}
