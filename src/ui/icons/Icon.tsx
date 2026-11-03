import type { ReactNode, SVGProps } from 'react';

/**
 * Hand-drawn 24×24 stroke icons for navigation, actions and the trait filter chips.
 * All use currentColor, so they follow the theme and the chip state.
 */
const FISH = 'M2.5 12c2.6-4.2 8-5.6 12.8-2.6L20 6.5v11l-4.7-2.9C10.5 17.6 5.1 16.2 2.5 12z';
const fishAt = (x: number, y: number, s: number) => (
  <path d={FISH} transform={`translate(${x} ${y}) scale(${s})`} strokeWidth={2 / s} />
);

const icons: Record<string, ReactNode> = {
  // Navigation
  discover: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z" fill="currentColor" />
    </>
  ),
  identify: (
    <>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <path d="M7 12c1.6-2.5 4.8-3.3 7.6-1.5L17 9v6l-2.4-1.5C11.8 15.3 8.6 14.5 7 12z" />
    </>
  ),
  logbook: (
    <>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" />
      <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7h6M9 10.5h4" />
    </>
  ),
  collection: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <path d="m14.2 17.2 2 2 3.6-4" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20.5c1.2-4 4.3-6 8-6s6.8 2 8 6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  back: <path d="M15 5 8 12l7 7" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />,
  heartFilled: (
    <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" fill="currentColor" />
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  album: (
    <>
      <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="9.5" r="1.8" />
      <path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4" />
    </>
  ),
  edit: <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4" />,
  trash: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />,
  share: (
    <>
      <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" />
      <path d="M5 12v7.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V12" />
    </>
  ),
  download: <path d="M12 4v11.5M7.5 11 12 15.5 16.5 11M5 19.5h14" />,
  upload: <path d="M12 16V4.5M7.5 9 12 4.5 16.5 9M5 19.5h14" />,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill="currentColor" />,
  sync: <path d="M19.5 9A8 8 0 0 0 5.2 7.2L4 8.5M4.5 15a8 8 0 0 0 14.3 1.8L20 15.5M4 4v4.5h4.5M20 20v-4.5h-4.5" />,
  cloud: <path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 10a4.3 4.3 0 0 1-.5 8.5z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 3.6 5.7 3.6 9s-1.1 6.3-3.6 9c-2.5-2.7-3.6-5.7-3.6-9S9.5 5.7 12 3z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  compare: <path d="M4 5h6.5v14H4zM13.5 5H20v14h-6.5zM8 9.5h.01M16.5 13h.01" />,
  locate: (
    <>
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </>
  ),
  map: <path d="m3.5 6.5 5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2zM9 4.5v13M15 6.5v13" />,
  offline: (
    <>
      <path d="M12 4v10M8 10.5l4 4 4-4" />
      <path d="M4 15.5v3A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-3" />
    </>
  ),
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  fish: (
    <>
      <path d={FISH} />
      <circle cx="7.3" cy="11.2" r="0.6" fill="currentColor" />
    </>
  ),
  bubbles: (
    <>
      <circle cx="8" cy="15" r="4" />
      <circle cx="15.5" cy="8" r="3" />
      <circle cx="17" cy="16" r="1.8" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  logout: <path d="M14.5 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 16.5 14.5 12 10 7.5M14 12H4" />,
  ruler: <path d="m3.5 16.5 13-13 4 4-13 13zM7 13l2 2M10 10l2 2M13 7l2 2" />,
  sparkle: <path d="M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2z" />,
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.7" fill="currentColor" stroke="none" />
    </>
  ),

  // Patterns
  'pattern-plain': <circle cx="12" cy="12" r="8" fill="currentColor" />,
  'pattern-stripes': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M5 9h14M3.8 12h16.4M5 15h14" />
    </>
  ),
  'pattern-bars': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 4.5v15M12 3.5v17M15 4.5v15" />
    </>
  ),
  'pattern-spots': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      {[
        [9, 8.5],
        [14.5, 8],
        [8, 13.5],
        [12.5, 12.5],
        [16, 14],
        [11, 16.8],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="currentColor" stroke="none" />
      ))}
    </>
  ),
  'pattern-blotches': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M7.5 9.5c1-1.8 3.4-1.5 3.6.2.2 1.6-2.6 2.6-3.6-.2zM13 13.5c1.2-1.2 3.8-.6 3.6 1.2-.3 1.8-3.4 1.4-3.6-1.2zM8.6 15.6c.5-.9 1.9-.6 1.8.4-.1 1-1.6.9-1.8-.4z" fill="currentColor" />
    </>
  ),
  'pattern-eyespot': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.6" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </>
  ),
  'pattern-reticulated': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 8l12 8M6 16l12-8M12 3.5v17" />
    </>
  ),
  'pattern-bicolor': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
    </>
  ),

  // Body shapes: fish
  'shape-compressed': <path d="M3 12c2-5.5 6.5-8.5 10-8.5 1 2.2 1.6 4.4 2 6l5.5-3v11l-5.5-3c-.4 1.6-1 3.8-2 6C9.5 20.5 5 17.5 3 12z" />,
  'shape-fusiform': <path d="M2 12c3-3.3 8-4.6 13.5-2.4L21 5.5 19.4 12l1.6 6.5-5.5-4.1C10 16.6 5 15.3 2 12z" />,
  'shape-elongated': <path d="M1.5 12c3.5-2.2 9-3 15-1.3L22 8v8l-5.5-2.7c-6 1.7-11.5.9-15-1.3z" />,
  'shape-eel': <path d="M2 13c2-3 4-3 6 0s4 3 6 0 4-3 6 0l2-1M2 13c1-.4 1.6-1.2 2-2" strokeWidth="3" />,
  'shape-round': (
    <>
      <circle cx="10.5" cy="12" r="7" />
      <path d="M17.5 12 21.5 8.5v7z" />
    </>
  ),
  'shape-flat': <path d="M12 4c3 3 6.5 5.5 9 7-2.5 1.5-6 3.5-9 5.5-3-2-6.5-4-9-5.5 2.5-1.5 6-4 9-7zM12 16.5V22" />,
  'shape-box': (
    <>
      <rect x="3" y="7" width="13" height="10" rx="2.5" />
      <path d="M16 12 21 8.5v7z" />
    </>
  ),
  'shape-odd': <path d="M14 3.5c-2.8 0-4.5 1.6-4.5 3.8 0 1.2.8 2 .8 3.2-2.3 1.4-3.3 3.8-2.6 6.2.8 2.8 4.8 3.8 6.6 1.8 1.4-1.6.4-3.8-1.4-3.6M14 3.5l4.5-.5-3 3" />,
  // Body shapes: other creatures
  'shape-slug': (
    <>
      <path d="M2.5 16.5c1-3.5 4.5-6 9.5-6s8.2 2.2 9.5 6c-3 1-16 1-19 0z" />
      <path d="M15.5 10.8 17 6.5M18.2 11.8 20.5 8M5 11.5l-1.5-2.5M7 10.5 6 8" />
    </>
  ),
  'shape-shell': <path d="M4 18c0-7.5 4.5-13 10-13a6 6 0 0 1 6 6c0 3.5-2.6 5.5-5.2 5.5-2.2 0-3.8-1.6-3.8-3.6 0-1.7 1.3-2.9 2.7-2.9M4 18h16" />,
  'shape-crab': (
    <>
      <ellipse cx="12" cy="14" rx="5.5" ry="3.8" />
      <path d="M6.8 12.5 4 9.5l-1-3M17.2 12.5 20 9.5l1-3M3 6.5l2.5.5M21 6.5l-2.5.5M7.5 17l-2.5 3M16.5 17l2.5 3M9 18l-1 3M15 18l1 3" />
    </>
  ),
  'shape-cephalopod': <path d="M6 10a6 6 0 0 1 12 0c0 2-1 3-1 3l1 6M7 13s-1-1-1-3M7 13l-1.5 6M10 14l-.5 6M14 14l.5 6M17 13l-3 1h-4l-3-1" />,
  'shape-star': <path d="m12 2.5 2.7 6.3 6.8.6-5.2 4.5 1.6 6.6L12 17l-5.9 3.5 1.6-6.6-5.2-4.5 6.8-.6z" />,
  'shape-spiny': (
    <>
      <circle cx="12" cy="13" r="4.5" />
      <path d="M12 8.5V2M15.2 9.8 19.5 4M16.5 13H22M7.5 13H2M8.8 9.8 4.5 4M9 16.5 6 21M15 16.5l3 4.5" />
    </>
  ),
  'shape-worm': <path d="M4 15.5c0-3 2-4.5 4-4.5h8c2 0 4 1.5 4 4.5 0 1.5-1 2.5-2.5 2.5h-11C5 18 4 17 4 15.5zM8 11v7M12 11v7M16 11v7" />,
  'shape-turtle': (
    <>
      <ellipse cx="11" cy="12" rx="6" ry="4.5" />
      <path d="M17 12h2.5a1.8 1.8 0 0 0 0-3.4M7.5 8.5 5 5.5M7.5 15.5 5 18.5M14 8.2l2-3M14 15.8l2 3M5 12H3" />
    </>
  ),
  'shape-mammal': <path d="M2.5 14c3-5 9.5-7.5 15-4.5l2-3 .5 4c1 .8 1.5 1.6 1.5 2.5-3-.5-4.5.5-6 2l-1-2c-4 1.3-8.5 1-12 1z" />,
  'shape-jelly': <path d="M4.5 12a7.5 7.5 0 0 1 15 0zM7 12c0 3-1 5-1 8M10 12c0 3 1 5 0 8M14 12c0 3-1 5 0 8M17 12c0 3 1 5 1 8" />,
  // Body shapes: corals, sponges, plants
  'shape-branching': <path d="M12 21v-8M12 13 8 9V4.5M12 13l4-4V5M8 9 5 6.5M16 9l3-2.5M12 13V8.5" />,
  'shape-massive': (
    <>
      <path d="M3 19c0-6 4-10 9-10s9 4 9 10z" />
      <path d="M6 16c1.5-1 2.5-3 5-3M11 18c1.5-2 4-3 7-2.5M9 12c2-.5 3.5 0 5 1" />
    </>
  ),
  'shape-plate': <path d="M2.5 9.5c3-2 16-2 19 0-3 2-16 2-19 0zM12 11v9M9 20h6" />,
  'shape-fan': <path d="M12 21V14M12 14 4.5 7.5M12 14 7.5 4.5M12 14V3.5M12 14l4.5-9.5M12 14l7.5-6.5M4.5 7.5c2-4 13-4 15 0" />,
  'shape-soft': <path d="M12 21v-6M12 15c-4 0-6-2.5-6-5.5 0-2 1.5-3 3-3 0-2 1.5-3 3-3s3 1 3 3c1.5 0 3 1 3 3 0 3-2 5.5-6 5.5z" />,
  'shape-tube': <path d="M6 20V9.5M10 20V6M14 20V8M18 20v-9M4.5 9.5h3M8.5 6h3M12.5 8h3M16.5 11h3M4 20h16" />,
  'shape-anemone': <path d="M6 20h12l-1.5-6h-9zM7.5 14c-1-3-3-4-4-6M9.5 14C9 10.5 7.5 8 7 5M12 14V4.5M14.5 14c.5-3.5 2-6 2.5-9M16.5 14c1-3 3-4 4-6" />,
  'shape-encrusting': <path d="M3 18.5c1.5-2.5 3.5-2.5 5-1 1.5-2 4-2.5 5.5-.5 1.5-1.5 3.5-1.5 5.5 1.5M2.5 20.5h19" />,
  'shape-plant': <path d="M8 21c0-6-2-10-4-13M11 21c0-7 0-12 1-17M14 21c0-5 2-9 5-12M17 21c0-3 1-5 3-7" />,

  // Behaviour
  'behav-open-water': (
    <>
      <path d="M2.5 6c2-1.3 3.5-1.3 5 0s3 1.3 5 0 3-1.3 5 0 3 1.3 4 .5" />
      {fishAt(5, 10, 0.6)}
    </>
  ),
  'behav-reef': (
    <>
      <path d="M3 20.5c1-3 2-4 3-4s1 2 2 2 1-4 3-4 2 3 3 3 1-2 2-2 2 2 3 5" />
      {fishAt(5, 4, 0.55)}
    </>
  ),
  'behav-bottom': (
    <>
      <path d="M2.5 19.5h19" />
      {fishAt(3, 9.5, 0.75)}
    </>
  ),
  'behav-buried': (
    <>
      <path d="M2.5 14c3-1 6-1 9.5 0s6.5 1 9.5 0M2.5 18c3-1 6-1 9.5 0s6.5 1 9.5 0" />
      <circle cx="9.5" cy="11" r="1.2" fill="currentColor" />
      <circle cx="13" cy="11" r="1.2" fill="currentColor" />
    </>
  ),
  'behav-crevice': (
    <>
      <path d="M2.5 20.5v-9a9.5 9 0 0 1 19 0v9M7 20.5v-6a5 5 0 0 1 10 0v6" />
    </>
  ),
  'behav-nocturnal': <path d="M18.5 15A7.5 7.5 0 0 1 9 5.5a7.5 7.5 0 1 0 9.5 9.5zM17 4l.6 1.6 1.6.6-1.6.6L17 8.4l-.6-1.6-1.6-.6 1.6-.6z" />,
  'behav-cleaner': (
    <>
      {fishAt(1, 9, 0.75)}
      <path d="M19 5.5 20 3M20.5 8l2-1M17 4l-.5-2" />
    </>
  ),
  'behav-camouflage': <path d="M2.5 12c2.6-4.2 8-5.6 12.8-2.6L20 6.5v11l-4.7-2.9C10.5 17.6 5.1 16.2 2.5 12z" strokeDasharray="2.5 2.5" />,
  'behav-symbiosis': (
    <>
      <circle cx="9" cy="12" r="5.5" />
      <circle cx="15" cy="12" r="5.5" />
    </>
  ),
  'behav-sessile': <path d="M12 3.5v13M7.5 8h9M5 14c0 3.5 3 6 7 6s7-2.5 7-6M5 14l-1.5 1.5M19 14l1.5 1.5" />,

  // Social
  'social-school': (
    <>
      {fishAt(1, 1.5, 0.42)}
      {fishAt(11, 1.5, 0.42)}
      {fishAt(6, 7.5, 0.42)}
      {fishAt(1, 13.5, 0.42)}
      {fishAt(11, 13.5, 0.42)}
    </>
  ),
  'social-group': (
    <>
      {fishAt(1, 2.5, 0.5)}
      {fishAt(11, 7, 0.5)}
      {fishAt(2, 12.5, 0.5)}
    </>
  ),
  'social-pair': (
    <>
      {fishAt(1, 2.5, 0.6)}
      {fishAt(8, 10.5, 0.6)}
    </>
  ),
  'social-solitary': fishAt(1, 0.5, 0.95),
  'social-colony': (
    <>
      {[
        [6, 8],
        [12, 6],
        [18, 8],
        [8, 14],
        [16, 14],
        [12, 18],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" />
      ))}
    </>
  ),
};

export type IconName = keyof typeof icons | string;

export function Icon({ name, title, ...rest }: { name: IconName; title?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title && <title>{title}</title>}
      {icons[name] ?? icons.fish}
    </svg>
  );
}

export const COLOR_SWATCHES: Record<string, string> = {
  'color-red': '#d62828',
  'color-orange': '#f77f00',
  'color-yellow': '#fcbf49',
  'color-green': '#2a9d8f',
  'color-blue': '#1d6fd6',
  'color-violet': '#7b2cbf',
  'color-pink': '#f4a6c6',
  'color-brown': '#8d5b3a',
  'color-black': '#111111',
  'color-white': '#ffffff',
  'color-grey': '#8d99a6',
  'color-silver': 'linear-gradient(135deg, #f1f4f6, #9aa6b2 55%, #e6ebef)',
};
