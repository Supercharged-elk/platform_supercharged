"use client";
import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { api } from "@/lib/api";
import Link from "next/link";
import { ArrowLeft, Clock, Download, Film, Zap, Wand2, Images } from "lucide-react";

interface Generation {
  id: string;
  mode: string;
  model_used: string;
  image_url?: string;
  video_url?: string;
  user_prompt: string;
  created_at: string;
  workflow_id?: string;
}

const MODE_ICON: Record<string, React.ReactNode> = {
  generate: <Zap size={11} className="text-blue-400" />,
  edit: <Wand2 size={11} className="text-purple-400" />,
  video: <Film size={11} className="text-orange-400" />,
  multi_ref: <Images size={11} className="text-green-400" />,
};

export default function GenerationsPage() {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  useEffect(() => {
    setLoading(true);
    api.get<{ generations: Generation[]; total: number }>(`/generations?limit=${LIMIT}&offset=${offset}`)
      .then((r) => {
        setGenerations(r.generations);
        setTotal(r.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [offset]);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-neutral-950 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <Link href="/canvas" className="text-neutral-500 hover:text-neutral-300 transition">
              <ArrowLeft size={18} />
            </Link>
            <h1 className="text-xl font-semibold text-white">Generation History</h1>
            {total > 0 && <span className="text-xs text-neutral-600">{total} total</span>}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square bg-neutral-900 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : generations.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-neutral-600 mb-4">No generations yet</p>
              <Link href="/canvas" className="text-sm text-blue-400 hover:text-blue-300 transition">
                Start generating →
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {generations.map((gen) => {
                  const mediaUrl = gen.image_url || gen.video_url;
                  const isVideo = !!gen.video_url && !gen.image_url;
                  return (
                    <div
                      key={gen.id}
                      className="group relative bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden hover:border-neutral-600 transition"
                    >
                      {isVideo ? (
                        <video
                          src={gen.video_url}
                          muted
                          loop
                          playsInline
                          className="w-full aspect-square object-cover"
                          onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play()}
                          onMouseLeave={(e) => (e.currentTarget as HTMLVideoElement).pause()}
                        />
                      ) : mediaUrl ? (
                        <img
                          src={mediaUrl}
                          alt={gen.user_prompt}
                          className="w-full aspect-square object-cover"
                        />
                      ) : (
                        <div className="w-full aspect-square bg-neutral-800 flex items-center justify-center">
                          <span className="text-xs text-neutral-600">No output</span>
                        </div>
                      )}

                      {/* Overlay on hover */}
                      <div className="absolute inset-0 bg-neutral-950/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                        <p className="text-xs text-neutral-300 line-clamp-2 mb-2">{gen.user_prompt}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-neutral-500">
                            {MODE_ICON[gen.mode] ?? null}
                            <span className="text-[10px]">{gen.mode}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {gen.workflow_id && (
                              <Link
                                href={`/canvas?workflow=${gen.workflow_id}`}
                                className="text-[10px] text-blue-400 hover:text-blue-300"
                                title="Open workflow"
                              >
                                Open
                              </Link>
                            )}
                            {mediaUrl && (
                              <a
                                href={mediaUrl}
                                download
                                target="_blank"
                                rel="noreferrer"
                                className="text-neutral-500 hover:text-neutral-300 transition"
                              >
                                <Download size={12} />
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-neutral-600 mt-1">
                          <Clock size={9} />
                          <span className="text-[9px]">{new Date(gen.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {total > LIMIT && (
                <div className="flex items-center justify-center gap-4 mt-8">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                    disabled={offset === 0}
                    className="px-4 py-2 text-sm bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-300 rounded-lg transition"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-neutral-600">
                    {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
                  </span>
                  <button
                    onClick={() => setOffset(offset + LIMIT)}
                    disabled={offset + LIMIT >= total}
                    className="px-4 py-2 text-sm bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-300 rounded-lg transition"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
