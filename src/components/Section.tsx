import type { ReactNode } from "react";

type BackgroundType = "white" | "soft" | "warm";

interface SectionProps {
  children: ReactNode;
  className?: string;
  background?: BackgroundType;
}

export default function Section({
  children,
  className = "",
  background = "white",
}: SectionProps) {
  const bgMap: Record<BackgroundType, string> = {
    white: "bg-white",
    soft: "bg-[#F6F4F1]",
    warm: "bg-[#ECE7E1]",
  };

  return (
    <section
      className={`${bgMap[background]} py-20 px-6 md:px-16 ${className}`}
    >
      <div className="max-w-7xl mx-auto">{children}</div>
    </section>
  );
}