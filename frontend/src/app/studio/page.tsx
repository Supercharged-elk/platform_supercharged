import Link from "next/link";
import { Film, Palette, ArrowRight } from "lucide-react";

export default function StudioPage() {
  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center px-6 py-20">
      <div className="max-w-2xl w-full space-y-8 text-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Studio</h1>
          <p className="text-neutral-400 mt-2">
            AI-powered production pipelines for real footage and illustrations.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Real Footage */}
          <Link
            href="/studio/real-footage"
            className="group relative flex flex-col items-start p-6 rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-indigo-600/60 hover:bg-neutral-900/80 transition text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-indigo-600/20 flex items-center justify-center mb-4 group-hover:bg-indigo-600/30 transition">
              <Film size={22} className="text-indigo-400" />
            </div>
            <h2 className="text-base font-semibold text-white">Real Footage</h2>
            <p className="text-sm text-neutral-400 mt-1 leading-relaxed">
              Upload video → Analyze with AI → Generate keyframes → Animate with Kling
            </p>
            <div className="mt-4 flex items-center gap-1 text-xs text-indigo-400 font-medium">
              Start pipeline <ArrowRight size={13} className="group-hover:translate-x-0.5 transition" />
            </div>
            <div className="absolute top-4 right-4 flex gap-1">
              {["Vision", "Imagen", "Kling"].map((tag) => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950/60 text-indigo-400 border border-indigo-900/50">
                  {tag}
                </span>
              ))}
            </div>
          </Link>

          {/* Illustrations */}
          <Link
            href="/studio/illustrations"
            className="group relative flex flex-col items-start p-6 rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-violet-600/60 hover:bg-neutral-900/80 transition text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-violet-600/20 flex items-center justify-center mb-4 group-hover:bg-violet-600/30 transition">
              <Palette size={22} className="text-violet-400" />
            </div>
            <h2 className="text-base font-semibold text-white">Illustrations</h2>
            <p className="text-sm text-neutral-400 mt-1 leading-relaxed">
              Upload B&W sketches → AI colorization → Generate prompts → Animate
            </p>
            <div className="mt-4 flex items-center gap-1 text-xs text-violet-400 font-medium">
              Start pipeline <ArrowRight size={13} className="group-hover:translate-x-0.5 transition" />
            </div>
            <div className="absolute top-4 right-4 flex gap-1">
              {["Gemini", "Kling"].map((tag) => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-950/60 text-violet-400 border border-violet-900/50">
                  {tag}
                </span>
              ))}
            </div>
          </Link>
        </div>

        <p className="text-xs text-neutral-600">
          State is saved locally — you can leave and return to continue where you left off.
        </p>
      </div>
    </div>
  );
}
