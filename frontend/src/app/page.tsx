import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="grain relative min-h-screen overflow-hidden bg-black text-white">
      {/* Background layers */}
      <div className="pointer-events-none absolute inset-0">
        {/* Radial gradient core - mosaic chromatic */}
        <div className="absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-blue-600/8 via-teal-500/6 to-transparent blur-3xl" />
        {/* Top-right accent - green/yellow */}
        <div className="absolute -right-32 -top-32 h-[500px] w-[500px] rounded-full bg-gradient-to-bl from-green-500/5 via-yellow-500/3 to-transparent blur-3xl" />
        {/* Bottom-left accent - blue/teal */}
        <div className="absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full bg-gradient-to-tr from-blue-500/5 via-teal-500/3 to-transparent blur-3xl" />
        {/* Center-right accent - orange warmth */}
        <div className="absolute right-1/4 top-1/3 h-[300px] w-[300px] rounded-full bg-gradient-to-bl from-orange-500/4 to-transparent blur-3xl" />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      </div>

      {/* Anatomical line art SVG - abstract body wireframe */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.04]">
        <svg
          viewBox="0 0 400 700"
          className="h-[80vh] w-auto"
          fill="none"
          stroke="white"
          strokeWidth="0.5"
        >
          {/* Head */}
          <ellipse cx="200" cy="60" rx="35" ry="42" />
          {/* Neck */}
          <line x1="200" y1="102" x2="200" y2="130" />
          {/* Shoulders */}
          <path d="M200 130 Q200 140 140 150" />
          <path d="M200 130 Q200 140 260 150" />
          {/* Torso */}
          <path d="M140 150 L135 280 Q135 310 170 320 L200 330" />
          <path d="M260 150 L265 280 Q265 310 230 320 L200 330" />
          {/* Spine */}
          <line x1="200" y1="130" x2="200" y2="330" strokeDasharray="4 8" />
          {/* Arms */}
          <path d="M140 150 L110 220 L95 300 L85 340" />
          <path d="M260 150 L290 220 L305 300 L315 340" />
          {/* Pelvis */}
          <path d="M170 320 Q200 345 230 320" />
          {/* Legs */}
          <path d="M175 330 L165 440 L160 550 L158 650" />
          <path d="M225 330 L235 440 L240 550 L242 650" />
          {/* Knee markers */}
          <circle cx="165" cy="440" r="6" />
          <circle cx="235" cy="440" r="6" />
          {/* Rib hints */}
          <path d="M160 170 Q200 180 240 170" opacity="0.5" />
          <path d="M155 195 Q200 210 245 195" opacity="0.5" />
          <path d="M150 220 Q200 238 250 220" opacity="0.4" />
          <path d="M148 245 Q200 265 252 245" opacity="0.3" />
        </svg>
      </div>

      {/* Nav */}
      <nav
        className="animate-fade-in relative z-10 flex items-center justify-between px-8 py-6"
        style={{ animationDelay: "0.1s" }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 backdrop-blur-sm">
            <span className="font-mono text-xs font-bold tracking-tight text-white/80">
              PT
            </span>
          </div>
          <span className="font-mono text-sm tracking-tight text-white/40">
            ChatPT
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="rounded-lg px-4 py-2 text-sm text-white/50 transition-colors hover:text-white"
          >
            Sign In
          </Link>
          <Link
            href="/sign-up"
            className="mosaic-btn px-4 py-2 text-sm text-white transition-all"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex min-h-[calc(100vh-80px)] flex-col items-center justify-center px-6">
        <div className="mx-auto max-w-3xl text-center">
          {/* Tag */}
          <div
            className="animate-fade-up mosaic-tag mb-8 inline-flex items-center gap-2 px-4 py-1.5 backdrop-blur-sm"
            style={{ animationDelay: "0.2s" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-glow" />
            <span className="font-mono text-xs tracking-wide text-white/40">
              3D PHYSIOTHERAPY INTELLIGENCE
            </span>
          </div>

          {/* Title */}
          <h1
            className="animate-fade-up mb-6 text-5xl font-bold leading-[1.1] tracking-tight text-white sm:text-7xl"
            style={{ animationDelay: "0.35s" }}
          >
            Your body,{" "}
            <span className="bg-gradient-to-r from-blue-300 via-teal-200 to-green-300 bg-clip-text text-transparent">
              mapped.
            </span>
          </h1>

          {/* Subtitle */}
          <p
            className="animate-fade-up mx-auto mb-12 max-w-lg text-base leading-relaxed text-white/35 sm:text-lg"
            style={{ animationDelay: "0.5s" }}
          >
            Interactive 3D muscle visualization with pain tracking, workout
            planning, and real-time body state monitoring.
          </p>

          {/* CTA buttons */}
          <div
            className="animate-fade-up flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
            style={{ animationDelay: "0.65s" }}
          >
            <Link
              href="/sign-up"
              className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-500 via-teal-400 to-green-400 px-8 py-3.5 text-sm font-medium text-black transition-all hover:shadow-[0_0_40px_rgba(59,130,246,0.2)]"
            >
              <span className="relative z-10">Start Mapping</span>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 via-teal-300 to-green-300 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
            <Link
              href="/sign-in"
              className="mosaic-btn rounded-xl px-8 py-3.5 text-sm text-white/60 transition-all hover:text-white/80"
            >
              Sign In
            </Link>
          </div>
        </div>

        {/* Feature cards - floating below */}
        <div
          className="animate-fade-up mx-auto mt-24 grid max-w-4xl grid-cols-1 gap-4 px-4 sm:grid-cols-3"
          style={{ animationDelay: "0.85s" }}
        >
          <FeatureCard
            label="VISUALIZE"
            title="3D Muscle Mapping"
            description="Interactive anatomical model with real-time condition rendering. Click any muscle to inspect and edit."
          />
          <FeatureCard
            label="TRACK"
            title="Pain & Recovery"
            description="Log pain levels, strength metrics, and range of motion. Watch your body heal over time."
          />
          <FeatureCard
            label="PLAN"
            title="Workout Builder"
            description="Create exercise plans linked to specific muscles. See target muscles light up on the 3D model."
          />
        </div>

        {/* Bottom fade spacer */}
        <div className="h-24" />
      </main>

      {/* Bottom edge line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/15 via-50% to-transparent" />
    </div>
  );
}

function FeatureCard({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mosaic-panel group p-5 transition-all hover:scale-[1.02]">
      <span className="mb-3 block font-mono text-[10px] tracking-[0.2em] text-white/20">
        {label}
      </span>
      <h3 className="mb-2 text-sm font-medium text-white/80">{title}</h3>
      <p className="text-xs leading-relaxed text-white/30">{description}</p>
    </div>
  );
}
