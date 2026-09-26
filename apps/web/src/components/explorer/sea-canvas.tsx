"use client";

import { useEffect, useRef } from "react";

/**
 * Slow dot-matrix swell drawn behind the map: a low-resolution canvas scaled up with
 * crisp pixels. Draws one still frame when the reader prefers reduced motion.
 */
export function SeaCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const CELL = 3; // screen pixels per canvas pixel; dots sit on every other pixel
    let color = "#1d5a63";
    let raf = 0;
    let last = 0;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const readColor = () => {
      color = getComputedStyle(document.documentElement).getPropertyValue("--sea-dot").trim() || color;
    };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.ceil(r.width / CELL));
      canvas.height = Math.max(1, Math.ceil(r.height / CELL));
    };
    const draw = (t: number) => {
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      const s = t / 1000;
      for (let y = 0; y < h; y += 2) {
        for (let x = (y / 2) % 2; x < w; x += 2) {
          // Long east-west swells, broken up so they read as sea rather than stripes.
          const v = Math.sin(x * 0.03 + s * 0.35 + Math.sin(y * 0.08 + s * 0.2) * 1.8) * Math.cos(y * 0.055 - s * 0.15);
          if (v > 0.45) {
            ctx.globalAlpha = Math.min(0.9, (v - 0.45) * 1.8);
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
      ctx.globalAlpha = 1;
    };
    const loop = (t: number) => {
      if (t - last > 70) {
        draw(t);
        last = t;
      }
      raf = requestAnimationFrame(loop);
    };

    readColor();
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(canvas);
    const mo = new MutationObserver(() => {
      readColor();
      draw(performance.now());
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    if (still) draw(0);
    else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full [image-rendering:pixelated]" />;
}
