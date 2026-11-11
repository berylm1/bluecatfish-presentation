// The lesson's icons (a matching line set, in place of the emoji: they looked different on every computer).
// Drawn in the text's colour, so they work on the dark lesson and on light cards.
const ICONS = {
  'back': '<path d="M4 5v14M19 5 8 12l11 7z"/>',
  'bell': '<path d="M6 10a6 6 0 1 1 12 0v2.5c0 2.1.85 3.65 2 4.5H4c1.15-.85 2-2.4 2-4.5zM10 20a2.25 2.25 0 0 0 4 0"/>',
  'book': '<path d="M12 7.5C9.5 5.5 6.25 5 3 6.25v12.5C6.25 17.5 9.5 18 12 20c2.5-2 5.75-2.5 9-1.25V6.25C17.75 5 14.5 5.5 12 7.5V20"/>',
  'camera': '<path d="M5 7h3l1.5-2h5L16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="3.25"/>',
  'celebration': '<path d="m7 11-3 9 9-3m-7-3 4 4m3.1-1.1c-.8.8-2.7.2-4.4-1.5S6.4 11.8 7.2 11s2.7-.2 4.4 1.5 2.3 3.6 1.5 4.4ZM13 9c0-2 2-2 2-4m1 7c2 0 2-2 4-2m-1-6h.01m1.99 2h.01m-3.01 10h.01M9 5h.01"/>',
  'chat-bubble': '<path d="M7 4.5h10a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-6l-5.5 3v-3.3A4 4 0 0 1 3 13.5v-5a4 4 0 0 1 4-4z"/>',
  'check-mark': '<path d="m4.5 12 5 5L19.5 7"/>',
  'classmates': '<circle cx="12" cy="7" r="2.5"/><circle cx="4.75" cy="9.5" r="1.75"/><circle cx="19.25" cy="9.5" r="1.75"/><path d="M7.5 19v-1.5a4.5 4.5 0 0 1 9 0V19m-14-2v-.75A3.25 3.25 0 0 1 5.75 13m15.75 4v-.75A3.25 3.25 0 0 0 18.25 13"/>',
  'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3.5 2"/>',
  'close': '<path d="m6 6 12 12M18 6 6 18"/>',
  'confused': '<circle cx="9.75" cy="13.75" r="6.75"/><path d="M6.75 12.5h.01m5.98 0h.01m-5 4c.9-.75 2.2-.75 3.5 0M16.75 6a2.5 2.5 0 1 1 4.1 1.9c-.8.6-1.6.95-1.6 2.1m0 2.75h.01"/>',
  'cross': '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
  'hands-on-activity': '<path d="M10 15V8a1.5 1.5 0 0 1 3 0v4l1.75-.65 3.8 1.3a2 2 0 0 1 1.35 2.15l-.5 3.1A3.75 3.75 0 0 1 15.7 21h-2.6a3.75 3.75 0 0 1-3-1.5l-3-4a1.5 1.5 0 0 1 2.25-1.95l.65.7M11.5 2.5v1m-5 .5.8.8m9.2-.8-.8.8"/>',
  'help': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.1 1.9c-.8.6-1.6 1-1.6 2.35M12 16.5h.01"/>',
  'microphone': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11v1a6 6 0 0 0 12 0v-1m-6 7v3m-3 0h6"/>',
  'next': '<path d="M20 5v14M5 5l11 7-11 7z"/>',
  'pause': '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  'play': '<path d="M7 5v14l12-7z"/>',
  'raised-hand': '<path d="M8 13V7a1.25 1.25 0 0 1 2.5 0v4-6.5a1.25 1.25 0 0 1 2.5 0V11 4.5a1.25 1.25 0 0 1 2.5 0V11 7a1.25 1.25 0 0 1 2.5 0v7.5a6.5 6.5 0 0 1-11.5 4.15L4 15.5a1.4 1.4 0 0 1 2.1-1.85L8 15.5z"/>',
  'repeat': '<path d="m16 3 4 4-4 4M4 11V9a2 2 0 0 1 2-2h14M8 13l-4 4 4 4m12-8v2a2 2 0 0 1-2 2H4"/>',
  'settings': '<path d="M9.7 3.4h4.6l.55 2.25 1.05.6 2.25-.64 2.3 3.98-1.68 1.61v1.2l1.68 1.61-2.3 3.98-2.25-.64-1.05.6-.55 2.25H9.7l-.55-2.25-1.05-.6-2.25.64-2.3-3.98 1.68-1.61v-1.2L3.55 9.59l2.3-3.98 2.25.64 1.05-.6z"/><circle cx="12" cy="12" r="2.75"/>',
  'simpler': '<path d="M12 20v-8m0 3C7 15 4 12 4 7c5 0 8 3 8 8Zm0-2c0-5 3-8 8-8 0 5-3 8-8 8ZM8 20h8"/>',
  'speaker': '<path d="M4 9h4l4-4v14l-4-4H4zM15.5 9a4.25 4.25 0 0 1 0 6m2.75-8.75a8.15 8.15 0 0 1 0 11.5"/>',
  'start-over': '<path d="M4 4.5V10h5.5M4.15 9.8A8.5 8.5 0 1 1 5.6 17.6"/>',
} as const;

export type IconName = keyof typeof ICONS;

export default function Icon({ name, size = '1.15em', className = '' }: { name: IconName; size?: string | number; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className={`inline-block shrink-0 align-[-0.2em] ${className}`} dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
  );
}
