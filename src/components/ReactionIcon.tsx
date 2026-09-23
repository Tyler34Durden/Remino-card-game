import type { ReactNode } from "react";

export type ReactionKind = "tea" | "coffee" | "hookah" | "bravo";
export const REACTION_DURATION_MS = 2200;

export function ReactionMenuIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M8 9a6 6 0 0 1 6-6h20a6 6 0 0 1 6 6v19a6 6 0 0 1-6 6H23L13 43v-9a6 6 0 0 1-5-6z" />
      <path d="M16 22c4 5 12 5 16 0" /><circle cx="17" cy="15" r="1.5" fill="currentColor" stroke="none" /><circle cx="31" cy="15" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Artwork({ children }: { children: ReactNode }) {
  return <svg className="reaction-art" viewBox="0 0 64 64" fill="none" stroke="#244e4b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}

/** Layers stay still in the picker; only a portrait's .seat-reaction runs the motion. */
export function ReactionIcon({ kind }: { kind: ReactionKind }) {
  if (kind === "tea") return (
    <Artwork>
      <ellipse cx="32" cy="57" rx="22" ry="3" fill="#244e4b" opacity=".12" stroke="none" />
      <ellipse className="tea-ring reaction-effect" cx="32" cy="54" rx="21" ry="5" stroke="#d99531" />
      <g className="tea-saucer">
        <path d="M9 51q23-10 46 0v3q-23 11-46 0z" fill="#dfae59" />
        <ellipse cx="32" cy="51" rx="23" ry="6" fill="#fff9e9" />
        <ellipse cx="32" cy="51" rx="17" ry="3.4" stroke="#c99643" />
        <path d="m13 51 4-1m30 1 4-1" stroke="#197f79" strokeWidth="2.6" />
      </g>
      <g className="tea-glass">
        <path d="M20 17q5 15 2 27c-1 8 21 8 20 0q-3-12 2-27z" fill="#fce8b7" />
        <path d="M23 27q3 11 1 17c-1 5 17 5 16 0q-2-6 1-17z" fill="#af421e" stroke="none" />
        <path d="M24 34q1 6 0 10c0 3 7 4 10 3V33z" fill="#df6e23" stroke="none" />
        <ellipse cx="32" cy="27" rx="9" ry="2.7" fill="#efaa3f" stroke="#9d471d" strokeWidth="1" />
        <ellipse cx="32" cy="17" rx="12" ry="3.3" fill="#fff7df" stroke="#b47d30" />
        <path d="m24 21 2 17m0 4v2" stroke="#fff9e9" strokeWidth="2" opacity=".85" />
        <path d="M24 46q8 3 16 0" stroke="#ffd381" />
      </g>
      <g className="tea-steam" stroke="#bf9758" strokeWidth="2" opacity=".65">
        <path className="tea-steam-one" d="M29 12c-7-5 6-6 1-11" />
        <path className="tea-steam-two" d="M37 12c-3-3 3-4 2-7" />
      </g>
    </Artwork>
  );
  if (kind === "coffee") return (
    <Artwork>
      <ellipse cx="32" cy="57" rx="19" ry="3" fill="#244e4b" opacity=".12" stroke="none" />
      <g className="coffee-cup">
        <path d="m14 27 5 20q3 8 13 8t13-8l5-20" fill="#fff8e6" />
        <path d="M18 39q2 14 14 14v-5q-9 0-11-14" fill="#ecdbb7" stroke="none" />
        <path d="M18 42q14 6 28 0M21 50q11 4 22 0" stroke="#c49547" strokeWidth="2" />
        <path d="m23 32 3 5-3 5-3-5zm9 2 3 6-3 6-3-6zm9-2 3 5-3 5-3-5z" fill="#258d85" stroke="#b68435" strokeWidth=".8" />
        <ellipse cx="32" cy="27" rx="18" ry="6.4" fill="#e5b864" />
        <ellipse cx="32" cy="26.5" rx="15" ry="4.1" fill="#583422" stroke="#fff5dc" strokeWidth="1.5" />
        <path d="M21 26q6-4 14-2" stroke="#b9894c" strokeWidth="1.3" />
        <ellipse className="coffee-ripple reaction-effect" cx="32" cy="26.5" rx="7" ry="2.2" stroke="#e8b969" strokeWidth="1.2" />
        <ellipse className="coffee-ripple-two reaction-effect" cx="32" cy="26.5" rx="10" ry="2.8" stroke="#e8b969" strokeWidth=".9" />
      </g>
      <path className="coffee-drop reaction-effect" d="M32 8c-1 4-4 6-4 9a4 4 0 0 0 8 0c0-3-3-5-4-9z" fill="#75432a" stroke="#472b21" />
      <path className="coffee-steam" d="M33 17c-7-5 5-6 0-11" stroke="#bd985f" strokeWidth="2" opacity=".6" />
    </Artwork>
  );
  if (kind === "hookah") return (
    <Artwork>
      <ellipse cx="29" cy="58" rx="20" ry="3" fill="#244e4b" opacity=".12" stroke="none" />
      <g className="hookah-hose">
        <path d="M32 38c5-16 24-16 24-2 0 11-8 13-12 17" stroke="#244e4b" strokeWidth="4.7" />
        <path d="M34 34c7-10 20-10 20 2" stroke="#d6a453" strokeWidth="1.5" strokeDasharray="2 4" />
        <path d="m45 51-7 5" stroke="#be8538" strokeWidth="5" />
        <path d="m38 56-3 2" stroke="#244e4b" strokeWidth="3" />
      </g>
      <path d="M22 39c0 4-8 8-8 13 0 8 23 8 23 0 0-5-8-9-8-13" fill="#23968b" />
      <path d="M21 45c-6 9-1 10 4 10" stroke="#78c8ac" strokeWidth="2.5" />
      <path d="m29 47 3 4-3 4-3-4z" fill="#e6b65e" stroke="none" />
      <path d="M20 39h11v4H20zM17 56h17v3H17z" fill="#d8a34d" />
      <path d="M24 22h4v17h-4z" fill="#c9994c" />
      <path d="M19 24q7 4 14 0l2-3H17z" fill="#e9bf71" />
      <path d="m21 12 2 7h6l2-7z" fill="#b98035" />
      <ellipse cx="26" cy="12" rx="6" ry="2" fill="#453a2a" />
      <path className="hookah-wisp" d="M29 8c-4-4 5-4 3-7" stroke="#8ba79a" strokeWidth="2.2" opacity=".8" />
      <g className="hookah-puff reaction-effect" fill="#a2bcb0" stroke="none">
        <path d="M32 14c-8-4-3-11 2-9 0-7 11-6 12-1 7-2 12 5 6 9-6 4-13-2-20 1z" />
        <path d="M34 13c6 2 9 5 5 8" fill="none" stroke="#a2bcb0" strokeWidth="3" />
      </g>
    </Artwork>
  );
  return (
    <Artwork>
      <g className="clap-back">
        <path d="m20 52-9-12q-4-5-3-12l2-13q1-4 4-2l1 12L25 9q2-3 5-1l-9 17 12-14q3-3 5 0L27 28l11-10q3-2 5 1L32 33l5-3q4-2 5 2L31 46l-2 8z" fill="#d99a62" />
        <path d="m12 47 14 10-6 6-14-10z" fill="#247f78" /><path d="m11 52 10 7" stroke="#eab967" strokeWidth="2" />
      </g>
      <g className="clap-front">
        <path d="m44 53 10-12q4-5 2-10l-3-10q-1-4-4-2l1 12L37 14q-2-3-5 0l12 17L29 17q-3-2-5 1l16 17-15-10q-3-2-5 1l16 13-8-3q-4-1-5 2l14 10 2 6z" fill="#f0ba80" />
        <path d="m47 36-8-9m4 14-11-9" stroke="#c48856" strokeWidth="1.1" />
        <path d="m38 51 14-8 6 8-15 10z" fill="#247f78" /><path d="m43 55 10-7" stroke="#eab967" strokeWidth="2" />
      </g>
      <g className="clap-marks reaction-effect" stroke="#dba144" strokeWidth="2.8">
        <path d="m21 8-3-4m14 3V2m11 8 4-4" />
      </g>
    </Artwork>
  );
}
