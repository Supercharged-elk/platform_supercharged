"use client";
import Link from "next/link";
import { Film, Palette } from "lucide-react";
import { usePathname } from "next/navigation";

export function StudioNavLinks() {
  const pathname = usePathname();
  // Hide pipeline links on the landing page to avoid duplicate accessible links
  if (pathname === "/studio") return null;

  return (
    <div className="flex items-center gap-3 ml-4">
      <Link
        href="/studio/real-footage"
        className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition"
      >
        <Film size={12} />
        Real Footage
      </Link>
      <Link
        href="/studio/illustrations"
        className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition"
      >
        <Palette size={12} />
        Illustrations
      </Link>
    </div>
  );
}
