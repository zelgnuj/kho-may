import type { CamType } from '../db';

const ART: Record<string, string> = {
  SLR: 'M12 32 H108 V68 H12 Z M44 32 L50 16 H70 L76 32 M45 52 a15 15 0 1 0 30 0 a15 15 0 1 0 -30 0 M52 52 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0 M88 32 V27 H98 V32 M18 32 V28 H28 V32',
  MF: 'M10 28 H110 V70 H10 Z M42 28 L48 12 H72 L78 28 M42 50 a18 18 0 1 0 36 0 a18 18 0 1 0 -36 0 M50 50 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0',
  RF: 'M8 26 H112 V66 H8 Z M32 48 a14 14 0 1 0 28 0 a14 14 0 1 0 -28 0 M39 48 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 M78 33 H92 V41 H78 Z M98 33 H106 V41 H98 Z M14 26 V22 H34 V26',
  TLR: 'M38 6 H82 V76 H38 Z M50 26 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0 M48 56 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0 M82 40 H90 V48 H82',
  PNS: 'M14 24 H106 V62 H14 Z M43 43 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0 M49 43 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 M82 30 H98 V36 H82 Z M88 24 V20 H98 V24',
  HALF: 'M14 22 H106 V64 H14 Z M44 44 a16 16 0 1 0 32 0 a16 16 0 1 0 -32 0 M52 44 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0 M20 28 H32 V36 H20 Z M90 22 V18 H100 V22',
  INST: 'M16 18 H104 V66 H16 Z M32 40 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0 M80 26 H94 V36 H80 Z M28 58 H92',
  DIG: 'M14 22 H106 V62 H14 Z M46 42 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0 M52 42 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 M84 28 H98 V34 H84 Z M80 22 V18 H92 V22'
};

export function CameraArt({ type, width = 104, strokeWidth = 2 }: { type: CamType; width?: number; strokeWidth?: number }) {
  const d = ART[type] ?? ART.RF;
  return (
    <svg width={width} height={(width * 2) / 3} viewBox="0 0 120 80" fill="none" stroke="#77716A" strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
