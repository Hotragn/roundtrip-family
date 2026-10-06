"use client";

import { Landmark, LibraryBig, MapPin, ShoppingBasket, Store, TreePine, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { placePhoto } from "@/lib/week";

const GLYPH: Record<string, typeof MapPin> = {
  temple: Landmark,
  indian_grocery: ShoppingBasket,
  asian_grocery: ShoppingBasket,
  farmers_market: Store,
  park: TreePine,
  library: LibraryBig,
  senior_center: Users,
  community_event: Users,
};

/**
 * A place's listing photo, sized by Google's image service, over a quiet tile with a sign for
 * the kind of place. The photo shows only once it has loaded; if the sized copy fails it tries
 * the original, and if that fails too the tile stays. Never a broken image.
 */
export function PlacePhoto({
  url,
  width,
  height,
  category,
  className,
}: {
  url: string | null | undefined;
  width: number;
  height: number;
  category: string;
  className?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  const src = url && attempt < 2 ? (attempt === 0 ? placePhoto(url, width, height) : url) : null;
  const Glyph = GLYPH[category] ?? MapPin;

  // A photo that loaded or failed before React attached its handlers never reports it.
  useEffect(() => {
    const img = ref.current;
    if (!img?.complete) return;
    if (img.naturalWidth > 0) setLoaded(true);
    else setAttempt((a) => a + 1);
  }, []);

  return (
    <div className={cn("relative overflow-hidden bg-surface-sunken", className)}>
      <Glyph aria-hidden="true" className="absolute inset-0 m-auto size-7 stroke-[1.5] text-text-muted/50" />
      {src ? (
        // biome-ignore lint/performance/noImgElement: a remote place photo at the size shown
        <img
          ref={ref}
          key={src}
          src={src}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setAttempt((a) => a + 1);
          }}
          className={cn(
            "absolute inset-0 size-full object-cover motion-safe:transition-opacity motion-safe:duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      ) : null}
    </div>
  );
}
