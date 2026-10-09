"use client";

const FEATURES = [
  { t: "Material reasoning", d: "Photo or name to a probable material structure, with provenance on every value." },
  { t: "Pathway search", d: "Rule expansion plus model proposals, validated and de-duplicated." },
  { t: "Circularity optimization", d: "A transparent multi-objective score you can inspect line by line." },
  { t: "Counterfactual analysis", d: "Disposal compared with every alternative future for the object." },
];

/** Pre-analysis state: a centred circularity core in SVG (no WebGL cost) with the engine's four capabilities in an even grid. */
export function Landing() {
  const ticks = Array.from({ length: 72 }, (_, i) => i);
  const spokes = Array.from({ length: 10 }, (_, i) => i);
  return (
    <section className="x5-panel relative px-4 pb-8 pt-10 sm:px-8" aria-label="Circularity engine, idle">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <svg viewBox="0 0 600 600" className="h-[22rem] w-[22rem] max-w-full sm:h-[26rem] sm:w-[26rem]" role="img" aria-label="Abstract object at the centre of a branching possibility space">
          <defs>
            <radialGradient id="x5-core" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#f4ffe0" stopOpacity="0.9" />
              <stop offset="0.35" stopColor="#b6f26b" stopOpacity="0.32" />
              <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="300" cy="300" r="170" fill="url(#x5-core)" className="x5-breathe" />
          {[250, 205, 160].map((r, i) => (
            <circle key={r} cx="300" cy="300" r={r} fill="none" stroke="#b6f26b" strokeOpacity={0.14 + i * 0.05} strokeDasharray={i === 1 ? "2 7" : undefined} />
          ))}
          <g className="x5-spin">
            {ticks.map((i) => (
              <line key={i} x1="300" y1="42" x2="300" y2={i % 6 === 0 ? 56 : 49} stroke="#b6f26b" strokeOpacity={i % 6 === 0 ? 0.6 : 0.25} transform={`rotate(${i * 5} 300 300)`} />
            ))}
          </g>
          <g className="x5-spin-rev">
            {spokes.map((i) => {
              const a = (i / spokes.length) * Math.PI * 2;
              const x = 300 + Math.cos(a) * 205;
              const y = 300 + Math.sin(a) * 205;
              return (
                <g key={i}>
                  <line x1="300" y1="300" x2={x} y2={y} stroke="#b6f26b" strokeOpacity="0.12" />
                  <circle cx={x} cy={y} r={i % 3 === 0 ? 4.5 : 3} fill="#7ee787" fillOpacity={0.35 + (i % 4) * 0.12} />
                </g>
              );
            })}
          </g>
          <g fill="none" stroke="#f4ffe0" strokeWidth="1.4" strokeOpacity="0.9">
            <path d="M270 262 h60 l8 22 v70 a8 8 0 0 1 -8 8 h-60 a8 8 0 0 1 -8 -8 v-70 z" />
            <path d="M282 262 v-12 h36 v12" />
            <line x1="262" y1="296" x2="338" y2="296" strokeOpacity="0.4" />
            <line x1="262" y1="326" x2="338" y2="326" strokeOpacity="0.4" />
          </g>
        </svg>
        <h2 className="-mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">One object.</h2>
        <p className="x5-gradient mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">100 possible futures.</p>
      </div>
      <ul className="mx-auto mt-10 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <li key={f.t} className="rounded-2xl border p-5" style={{ borderColor: "var(--x5-line)", background: "rgb(255 255 255 / 0.025)" }}>
            <span className="x5-mono text-sm font-semibold text-[var(--x5-cyan)]">0{i + 1}</span>
            <h3 className="mt-2 text-lg font-semibold text-[var(--x5-text)]">{f.t}</h3>
            <p className="mt-1.5 text-base leading-relaxed text-[var(--x5-dim)]">{f.d}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
