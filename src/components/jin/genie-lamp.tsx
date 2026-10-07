// Jin's icon: a little genie lamp with a wisp of smoke. Draws with the current text color.
export function GenieLamp({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 8c-3 3 2 5 0 8" opacity="0.85" />
      <path d="M28 6c-2.5 2.5 1.5 4.5 0 7" opacity="0.55" />
      <path d="M8 24c0-2 2-3 4-3h22c4 0 7 2 9 5l3-2c1-.6 2 .6 1.2 1.5L44 28c-1 3-4 5-8 5l-2 4H16l-2-4c-4-1.5-6-5-6-9Z" fill="currentColor" fillOpacity="0.12" />
      <path d="M14 33c-2 1-4 3-4 5h26c0-2-2-4-4-5" />
      <path d="M16 24h18" opacity="0.6" />
      <circle cx="12" cy="22" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
