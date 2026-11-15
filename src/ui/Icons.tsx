// Minimal inline icon set (1.6px stroke, 20px grid). No icon font, no CDN.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 18): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
});

const make = (d: React.ReactNode) =>
  function Icon({ size, ...p }: P) {
    return <svg {...base(size)} {...p}>{d}</svg>;
  };

export const IconSettings = make(<><circle cx="10" cy="10" r="2.6" /><path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" /></>);
export const IconHistory = make(<><path d="M3.5 10a6.5 6.5 0 1 0 2-4.7" /><path d="M3 3.5v3h3" /><path d="M10 6.5V10l2.5 1.5" /></>);
export const IconSun = make(<><circle cx="10" cy="10" r="3.2" /><path d="M10 2v1.5M10 16.5V18M18 10h-1.5M3.5 10H2M15.6 4.4l-1 1M5.4 14.6l-1 1M15.6 15.6l-1-1M5.4 5.4l-1-1" /></>);
export const IconMoon = make(<path d="M16.5 12.2A6.8 6.8 0 0 1 7.8 3.5a6.8 6.8 0 1 0 8.7 8.7Z" />);
export const IconCommand = make(<path d="M7 5.5A1.5 1.5 0 1 0 5.5 7H7V5.5Zm0 0v9m0-7.5h6m-6 6h6m0-7.5A1.5 1.5 0 1 1 14.5 7H13V5.5Zm0 0v9m0 0a1.5 1.5 0 1 0 1.5-1.5H13M7 14.5A1.5 1.5 0 1 1 5.5 13H7" />);
export const IconUpload = make(<><path d="M10 13V3.5M6.5 7 10 3.5 13.5 7" /><path d="M3.5 13v2.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V13" /></>);
export const IconTrash = make(<><path d="M4 6h12M8 6V4.5h4V6M5.5 6l.7 10h7.6l.7-10" /></>);
export const IconCopy = make(<><rect x="7" y="7" width="9" height="9" rx="1.5" /><path d="M13 7V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" /></>);
export const IconDownload = make(<><path d="M10 3.5V13M6.5 9.5 10 13l3.5-3.5" /><path d="M3.5 14v1.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V14" /></>);
export const IconUndo = make(<><path d="M7.5 5 4 8.5 7.5 12" /><path d="M4 8.5h7.5a4.5 4.5 0 0 1 0 9H9" /></>);
export const IconRedo = make(<><path d="M12.5 5 16 8.5 12.5 12" /><path d="M16 8.5H8.5a4.5 4.5 0 0 0 0 9H11" /></>);
export const IconDiff = make(<><path d="M6 3.5v9M3.5 6h5" /><path d="M11.5 14h5" /><rect x="2.5" y="2.5" width="15" height="15" rx="2" /></>);
export const IconSliders = make(<><path d="M4 5h7M15 5h1M4 10h2M10 10h6M4 15h9M17 15h-1" /><circle cx="13" cy="5" r="1.8" /><circle cx="8" cy="10" r="1.8" /><circle cx="15" cy="15" r="1.8" /></>);
export const IconX = make(<path d="m5 5 10 10M15 5 5 15" />);
export const IconCheck = make(<path d="m4 10.5 4 4 8-9" />);
export const IconRevert = make(<><path d="M4 10a6 6 0 1 0 1.8-4.3" /><path d="M4 3.5V7h3.5" /></>);
export const IconSpark = make(<path d="M10 2.5c.6 3.6 1.9 4.9 5.5 5.5-3.6.6-4.9 1.9-5.5 5.5-.6-3.6-1.9-4.9-5.5-5.5 3.6-.6 4.9-1.9 5.5-5.5ZM15.5 13.5c.3 1.4.8 1.9 2 2-1.2.3-1.7.8-2 2-.3-1.2-.8-1.7-2-2 1.2-.1 1.7-.6 2-2Z" />);
export const IconEdit = make(<><path d="M12.5 4.5 15.5 7.5 7 16H4v-3l8.5-8.5Z" /></>);
export const IconLock = make(<><rect x="4.5" y="9" width="11" height="8" rx="1.5" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></>);
export const IconStop = make(<rect x="5.5" y="5.5" width="9" height="9" rx="1.5" />);
export const IconLayers = make(<><path d="m10 3 7 4-7 4-7-4 7-4Z" /><path d="m3 11 7 4 7-4" /></>);
export const IconAlert = make(<><path d="M10 3 2.5 16.5h15L10 3Z" /><path d="M10 8.5v3.5M10 14.2v.1" /></>);
export const IconScan = make(<><path d="M3.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2M13 3.5h2A1.5 1.5 0 0 1 16.5 5v2M16.5 13v2a1.5 1.5 0 0 1-1.5 1.5h-2M7 16.5H5A1.5 1.5 0 0 1 3.5 15v-2" /><path d="M6.5 10h7" /></>);
export const IconReport = make(<><path d="M5 3.5h7l3 3v10H5z" /><path d="M8 13v-2M10.5 13V9M13 13v-3" /></>);
export const IconShare = make(<><path d="M10 12.5V3.5M6.5 7 10 3.5 13.5 7" /><path d="M6 9.5H5a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1h-1" /></>);
export const IconFlame = make(<path d="M10 17c3 0 5-2 5-5 0-3.5-3-5-3.5-8.5C9 5.5 7.5 7.5 8 10c-1-.5-1.5-1.5-1.5-2.5C5.5 8.5 5 10 5 12c0 3 2 5 5 5Z" />);
export const IconInstall = make(<><rect x="5.5" y="2.5" width="9" height="15" rx="2" /><path d="M10 6.5v6M7.5 10 10 12.5 12.5 10" /></>);
export const IconOffline = make(<><path d="M3 3l14 14" /><path d="M5.5 8.6A7 7 0 0 1 9 7.1M14.5 8.6A7 7 0 0 0 12.6 7.5M7.5 11.5a3.5 3.5 0 0 1 3.4-1M10 15h.01" /></>);
export const IconGlobe = make(<><circle cx="10" cy="10" r="7" /><path d="M3 10h14M10 3c2 2.2 2.8 4.5 2.8 7s-.8 4.8-2.8 7c-2-2.2-2.8-4.5-2.8-7S8 5.2 10 3Z" /></>);

/** Brand mark: a rhythm of uneven bars — what human sentences look like. */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      {[
        [7, 14],
        [11.5, 6],
        [16, 18],
        [20.5, 10],
        [25, 15],
      ].map(([x, h], i) => (
        <rect key={i} x={x - 1.5} y={25 - h} width="3" height={h} rx="1.5" fill="var(--brand-ink)" />
      ))}
    </svg>
  );
}
