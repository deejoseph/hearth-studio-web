import { useState, useRef, useCallback, useEffect } from "react";

const AXES = [
  { key: "east", label: "东", sub: "社会性" },
  { key: "art", label: "艺", sub: "创造性" },
  { key: "body", label: "身", sub: "外向体验" },
  { key: "west", label: "西", sub: "个体性" },
  { key: "tech", label: "技", sub: "规则性" },
  { key: "mind", label: "心", sub: "内向体验" },
];

const RINGS = 5;
const SIZE = 300;
const CENTER = SIZE / 2;
const RADIUS = 110;

function getPoint(index, value, total) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const r = (value / 100) * RADIUS;
  return {
    x: CENTER + r * Math.cos(angle),
    y: CENTER + r * Math.sin(angle),
  };
}

function getLabelPoint(index, total) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const r = RADIUS + 28;
  return {
    x: CENTER + r * Math.cos(angle),
    y: CENTER + r * Math.sin(angle),
  };
}

export default function RadarChart() {
  const [values, setValues] = useState({
    east: 70,
    west: 50,
    art: 60,
    tech: 55,
    body: 65,
    mind: 50,
  });
  const [dragging, setDragging] = useState(null);
  const svgRef = useRef(null);

  const handlePointerDown = useCallback((key) => (e) => {
    e.preventDefault();
    setDragging(key);
  }, []);

  const handlePointerMove = useCallback(
    (e) => {
      if (!dragging || !svgRef.current) return;
      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      const scaleX = SIZE / rect.width;
      const scaleY = SIZE / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;

      const idx = AXES.findIndex((a) => a.key === dragging);
      const angle = (Math.PI * 2 * idx) / AXES.length - Math.PI / 2;
      const dx = mx - CENTER;
      const dy = my - CENTER;
      const projected = dx * Math.cos(angle) + dy * Math.sin(angle);
      const val = Math.round(Math.max(0, Math.min(100, (projected / RADIUS) * 100)));

      setValues((prev) => ({ ...prev, [dragging]: val }));
    },
    [dragging]
  );

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      return () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };
    }
  }, [dragging, handlePointerMove, handlePointerUp]);

  const polygonPoints = AXES.map((axis, i) => {
    const p = getPoint(i, values[axis.key], AXES.length);
    return `${p.x},${p.y}`;
  }).join(" ");

  return (
    <div className="edu-radar-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="edu-radar-svg"
        style={{ touchAction: "none" }}
      >
        {/* Grid rings */}
        {Array.from({ length: RINGS }, (_, ring) => {
          const r = ((ring + 1) / RINGS) * RADIUS;
          const pts = AXES.map((_, i) => {
            const angle = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
            return `${CENTER + r * Math.cos(angle)},${CENTER + r * Math.sin(angle)}`;
          }).join(" ");
          return (
            <polygon
              key={ring}
              points={pts}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          );
        })}

        {/* Axis lines */}
        {AXES.map((_, i) => {
          const p = getPoint(i, 100, AXES.length);
          return (
            <line
              key={i}
              x1={CENTER}
              y1={CENTER}
              x2={p.x}
              y2={p.y}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="1"
            />
          );
        })}

        {/* Data polygon */}
        <polygon
          points={polygonPoints}
          fill="rgba(79, 209, 197, 0.15)"
          stroke="var(--accent, #4fd1c5)"
          strokeWidth="2"
        />

        {/* Data points */}
        {AXES.map((axis, i) => {
          const p = getPoint(i, values[axis.key], AXES.length);
          return (
            <circle
              key={axis.key}
              cx={p.x}
              cy={p.y}
              r="6"
              fill="var(--accent, #4fd1c5)"
              stroke="var(--bg, #0a0b0f)"
              strokeWidth="2"
              style={{ cursor: "grab" }}
              onPointerDown={handlePointerDown(axis.key)}
            />
          );
        })}

        {/* Labels */}
        {AXES.map((axis, i) => {
          const lp = getLabelPoint(i, AXES.length);
          return (
            <g key={axis.key}>
              <text
                x={lp.x}
                y={lp.y - 6}
                textAnchor="middle"
                dominantBaseline="central"
                className="edu-radar-label"
              >
                {axis.label}
              </text>
              <text
                x={lp.x}
                y={lp.y + 10}
                textAnchor="middle"
                dominantBaseline="central"
                className="edu-radar-sublabel"
              >
                {axis.sub}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Value sliders */}
      <div className="edu-radar-sliders">
        {AXES.map((axis) => (
          <div key={axis.key} className="edu-radar-slider-row">
            <span className="edu-radar-slider-label">
              <span className="edu-radar-slider-char">{axis.label}</span>
              {axis.sub}
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={values[axis.key]}
              onChange={(e) =>
                setValues((prev) => ({
                  ...prev,
                  [axis.key]: Number(e.target.value),
                }))
              }
              className="edu-radar-range"
            />
            <span className="edu-radar-slider-val">{values[axis.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
