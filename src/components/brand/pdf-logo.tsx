import { Path, Svg, Circle, Rect, Text, View, StyleSheet } from "@react-pdf/renderer";
import { APP_NAME } from "@/domain/constants/app";

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  wordmark: {
    marginLeft: 8,
  },
  brand: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    letterSpacing: 0.8,
  },
  brandSub: {
    fontSize: 6.5,
    color: "#94a3b8",
    marginTop: 2,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  brandDark: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#0b1f33",
    letterSpacing: 0.8,
  },
  brandSubDark: {
    fontSize: 6.5,
    color: "#64748b",
    marginTop: 2,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
});

/** PDF-safe NB-WxBrief mark (same geometry as the web SVG). */
export function PdfLogoMark({ size = 16 }: { readonly size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Rect width={32} height={32} rx={8} fill="#0a4d7c" />
      <Path
        d="M7.5 23.5c0-9.1 7.4-16.5 16.5-16.5"
        stroke="#7dd3fc"
        strokeWidth={1.75}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M11.5 22.5V9.5L20.5 22.5V9.5"
        stroke="#ffffff"
        strokeWidth={2.15}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={24} cy={7} r={1.6} fill="#7dd3fc" />
    </Svg>
  );
}

export function PdfBrandLockup({
  subtitle = "Operational weather briefing",
  variant = "light",
}: {
  readonly subtitle?: string;
  readonly variant?: "light" | "dark";
}) {
  const brandStyle = variant === "light" ? styles.brand : styles.brandDark;
  const subStyle = variant === "light" ? styles.brandSub : styles.brandSubDark;
  return (
    <View style={styles.row}>
      <PdfLogoMark size={18} />
      <View style={styles.wordmark}>
        <Text style={brandStyle}>{APP_NAME}</Text>
        <Text style={subStyle}>{subtitle}</Text>
      </View>
    </View>
  );
}
