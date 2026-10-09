import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 20): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true
});

export const IconCamera = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M3 8h4l2-3h6l2 3h4v11H3z" /><circle cx="12" cy="13" r="3.5" /></svg>);
export const IconTrend = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M3 17l5-5 4 3 8-8" /><path d="M15 7h5v5" /></svg>);
export const IconPlus = ({ size, ...p }: P) => (<svg {...base(size)} strokeWidth={2.4} {...p}><path d="M12 5v14" /><path d="M5 12h14" /></svg>);
export const IconData = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 19h14" /></svg>);
export const IconSettings = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M4 7h10" /><path d="M18 7h2" /><circle cx="16" cy="7" r="2" /><path d="M4 17h2" /><path d="M10 17h10" /><circle cx="8" cy="17" r="2" /></svg>);
export const IconSearch = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>);
export const IconSort = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M7 4v16" /><path d="M3 16l4 4 4-4" /><path d="M17 20V4" /><path d="M13 8l4-4 4 4" /></svg>);
export const IconGrid = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>);
export const IconList = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></svg>);
export const IconShelf = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><rect x="3.5" y="4" width="4.5" height="4.5" rx="1" /><rect x="9.75" y="4" width="4.5" height="4.5" rx="1" /><rect x="16" y="4" width="4.5" height="4.5" rx="1" /><rect x="3.5" y="10" width="4.5" height="4.5" rx="1" /><rect x="9.75" y="10" width="4.5" height="4.5" rx="1" /><rect x="16" y="10" width="4.5" height="4.5" rx="1" /><path d="M3 19h18" /></svg>);
export const IconBack = ({ size, ...p }: P) => (<svg {...base(size)} strokeWidth={2} {...p}><path d="M15 5l-7 7 7 7" /></svg>);
export const IconEdit = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>);
export const IconTrash = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></svg>);
export const IconFilm = ({ size, ...p }: P) => (<svg {...base(size)} strokeWidth={2.2} {...p}><rect x="6" y="5" width="12" height="16" rx="2" /><path d="M9 2h6v3H9z" /></svg>);
export const IconImage = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></svg>);
export const IconClock = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2" /><path d="M9 2h6" /></svg>);
export const IconExternal = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>);
export const IconClose = ({ size, ...p }: P) => (<svg {...base(size)} strokeWidth={2} {...p}><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>);
export const IconStar = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>);
export const IconHeart = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>);
export const IconShield = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>);
export const IconTable = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M9 4v16" /></svg>);
export const IconTag = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M3 12V4h8l9 9-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></svg>);
export const IconSwap = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M4 8h14" /><path d="M14 4l4 4-4 4" /><path d="M20 16H6" /><path d="M10 12l-4 4 4 4" /></svg>);
export const IconBook = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11" /></svg>);
export const IconPalette = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.7 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z" /><circle cx="7.5" cy="11" r="1.2" /><circle cx="10.5" cy="7" r="1.2" /><circle cx="15.5" cy="7.5" r="1.2" /></svg>);
export const IconChevron = ({ size, ...p }: P) => (<svg {...base(size)} strokeWidth={2} {...p}><path d="M9 6l6 6-6 6" /></svg>);
export const IconLink = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>);
