import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** App icon — NB monogram with radar arc. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b1f33",
          borderRadius: 8,
        }}
      >
        <svg width="28" height="28" viewBox="0 0 32 32">
          <path
            d="M7.5 23.5c0-9.1 7.4-16.5 16.5-16.5"
            fill="none"
            stroke="#4aa3ff"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path
            d="M11.5 22.5V9.5L20.5 22.5V9.5"
            fill="none"
            stroke="#e7ecf4"
            strokeWidth="2.15"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="24" cy="7" r="1.6" fill="#4aa3ff" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
