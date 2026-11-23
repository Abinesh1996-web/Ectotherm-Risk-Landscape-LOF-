import React, { useState, useMemo, useRef } from 'react';
import {
  Activity,
  Calculator,
  Map as MapIcon,
  Sliders,
  Thermometer,
  Leaf,
  ShieldAlert,
  Upload,
  Download,
  Trash2,
  Plus,
  Sun,
  Moon,
  Mountain,
  Grid,
  RotateCcw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';

// Pre-loaded spatial observations across the 10x10 habitat grid for an immediate rich landscape
const DEFAULT_OBSERVATIONS = [
  { id: '1', x: 2, y: 2, te: 34.0, refuge: 0.95, predator: 0.05 },
  { id: '2', x: 3, y: 3, te: 33.5, refuge: 0.85, predator: 0.10 },
  { id: '3', x: 2, y: 8, te: 34.5, refuge: 0.90, predator: 0.10 },
  { id: '4', x: 4, y: 7, te: 26.5, refuge: 0.45, predator: 0.70 },
  { id: '5', x: 5, y: 5, te: 41.0, refuge: 0.20, predator: 0.65 },
  { id: '6', x: 6, y: 4, te: 38.5, refuge: 0.35, predator: 0.55 },
  { id: '7', x: 7, y: 8, te: 28.0, refuge: 0.30, predator: 0.80 },
  { id: '8', x: 8, y: 2, te: 34.0, refuge: 0.90, predator: 0.10 },
  { id: '9', x: 9, y: 9, te: 35.0, refuge: 0.10, predator: 0.90 },
  { id: '10', x: 8, y: 6, te: 25.0, refuge: 0.25, predator: 0.85 },
];

/**
 * Asymmetric Thermal Performance Curve (0 to 1)
 * Bounded by species-specific CT_min, T_pref, and CT_max
 */
function calculatePerformance(te, tPref, ctMin, ctMax) {
  if (te <= ctMin || te >= ctMax) return 0;
  if (te <= tPref) {
    const ratio = (te - ctMin) / Math.max(0.1, tPref - ctMin);
    return Math.max(0, Math.min(1, Math.pow(ratio, 1.3)));
  } else {
    const ratio = (ctMax - te) / Math.max(0.1, ctMax - tPref);
    return Math.max(0, Math.min(1, Math.pow(ratio, 1.3)));
  }
}

/**
 * Composite Landscape of Fear (LOF) Score (0 to 1)
 * Compares Additive (Linear) vs. Thermal-Gated Multiplicative models
 */
function calculateLOF(te, refuge, predator, tPref, ctMin, ctMax, vulnerability, model) {
  const perf = calculatePerformance(te, tPref, ctMin, ctMax);
  const thermalStress = 1 - perf;
  const scarcity = 1 - refuge;

  if (model === 'additive') {
    const raw =
      ((thermalStress + scarcity + predator) / 3) * (0.5 + 0.5 * vulnerability) +
      0.1 * vulnerability;
    return Math.max(0, Math.min(1, raw));
  } else {
    const thermalGate = 1 / Math.max(0.15, perf);
    const baseRisk = (0.5 * scarcity + 0.5 * predator) * vulnerability;
    const raw = baseRisk * thermalGate + 0.25 * thermalStress;
    return Math.max(0, Math.min(1, raw));
  }
}

/**
 * Returns theme-aware styling & labels for Low / Moderate / High LOF risk
 */
function getRiskStatus(score, isDark) {
  if (score < 0.35) {
    return {
      zone: 'safe',
      label: 'LOW RISK (SAFE CORRIDOR)',
      badgeClass: isDark
        ? 'text-emerald-300 border-emerald-500/40 bg-emerald-950/50'
        : 'text-emerald-800 border-emerald-300 bg-emerald-50',
      cellClass: 'bg-emerald-500 text-white',
      textClass: isDark ? 'text-emerald-400' : 'text-emerald-600',
      topColor: '#34d399',
      leftColor: '#10b981',
      rightColor: '#059669',
    };
  }
  if (score < 0.65) {
    return {
      zone: 'moderate',
      label: 'MODERATE RISK (VIGILANCE REQUIRED)',
      badgeClass: isDark
        ? 'text-amber-300 border-amber-500/40 bg-amber-950/50'
        : 'text-amber-800 border-amber-300 bg-amber-50',
      cellClass: 'bg-amber-500 text-white',
      textClass: isDark ? 'text-amber-400' : 'text-amber-600',
      topColor: '#fbbf24',
      leftColor: '#f59e0b',
      rightColor: '#d97706',
    };
  }
  return {
    zone: 'lethal',
    label: 'HIGH RISK (LETHAL EXPOSURE)',
    badgeClass: isDark
      ? 'text-rose-300 border-rose-500/40 bg-rose-950/50'
      : 'text-rose-800 border-rose-300 bg-rose-50',
    cellClass: 'bg-rose-600 text-white',
    textClass: isDark ? 'text-rose-400' : 'text-rose-600',
    topColor: '#fb7185',
    leftColor: '#f43f5e',
    rightColor: '#be123c',
  };
}

/**
 * Custom SVG Speedometer Gauge for the Composite LOF Score
 */
function LOFGaugeMeter({ score, status, isDark }) {
  const cx = 160;
  const cy = 145;
  const r = 108;

  // Helper to convert a 0..1 score to an (x, y) point on the upper semi-circle
  const polarPoint = (val, radius = r) => {
    const angle = Math.PI * (1 - val);
    return {
      x: cx + radius * Math.cos(angle),
      y: cy - radius * Math.sin(angle),
    };
  };

  // Helper to build an SVG arc path between two 0..1 values
  const arcPath = (startVal, endVal, radius = r) => {
    const start = polarPoint(startVal, radius);
    const end = polarPoint(endVal, radius);
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  };

  const ticks = [0, 0.25, 0.5, 0.75, 1.0];
  const needleRotation = -90 + score * 180;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
      {/* SVG Semi-Circular Gauge */}
      <div className="w-full max-w-[300px] shrink-0">
        <svg viewBox="0 0 320 175" className="w-full h-auto overflow-visible">
          {/* Subtle background track */}
          <path
            d={arcPath(0, 1)}
            fill="none"
            stroke={isDark ? '#1e293b' : '#e2e8f0'}
            strokeWidth="22"
            strokeLinecap="round"
          />

          {/* Three Colored Risk Arcs */}
          <path
            d={arcPath(0, 0.345)}
            fill="none"
            stroke="#10b981"
            strokeWidth="20"
            strokeLinecap="butt"
          />
          <path
            d={arcPath(0.355, 0.645)}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="20"
            strokeLinecap="butt"
          />
          <path
            d={arcPath(0.655, 1.0)}
            fill="none"
            stroke="#e11d48"
            strokeWidth="20"
            strokeLinecap="butt"
          />

          {/* Tick Marks & Labels */}
          {ticks.map((t) => {
            const inner = polarPoint(t, r - 15);
            const outer = polarPoint(t, r + 15);
            const labelPos = polarPoint(t, r + 28);
            return (
              <g key={t}>
                <line
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke={isDark ? '#94a3b8' : '#64748b'}
                  strokeWidth="2"
                />
                <text
                  x={labelPos.x}
                  y={labelPos.y + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill={isDark ? '#cbd5e1' : '#475569'}
                >
                  {t.toFixed(2).replace(/\.00$/, '.0')}
                </text>
              </g>
            );
          })}

          {/* Animated Needle */}
          <g
            style={{
              transform: `rotate(${needleRotation}deg)`,
              transformOrigin: `${cx}px ${cy}px`,
              transition: 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <polygon
              points={`${cx - 5},${cy} ${cx + 5},${cy} ${cx},${cy - r + 14}`}
              fill={isDark ? '#f8fafc' : '#0f172a'}
            />
          </g>

          {/* Center Pivot Hub */}
          <circle
            cx={cx}
            cy={cy}
            r="10"
            fill={isDark ? '#38bdf8' : '#0284c7'}
            stroke={isDark ? '#0f172a' : '#ffffff'}
            strokeWidth="3"
          />
        </svg>
      </div>

      {/* Numeric Score & Status Badge */}
      <div className="flex-1 flex flex-col items-center sm:items-end text-center sm:text-right space-y-3">
        <div>
          <div
            className={`text-xs font-bold uppercase tracking-widest ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            Composite LOF Score
          </div>
          <div
            className={`text-5xl md:text-6xl font-black tracking-tight tabular-nums mt-1 ${
              isDark ? 'text-white' : 'text-slate-900'
            }`}
          >
            {score.toFixed(3)}
          </div>
        </div>
        <div
          className={`px-4 py-2.5 rounded-xl border font-extrabold tracking-wide text-xs md:text-sm ${status.badgeClass}`}
        >
          {status.label}
        </div>
      </div>
    </div>
  );
}

/**
 * Interactive 3D Isometric Terrain Plot for the 10x10 Landscape of Fear
 */
function IsometricLandscape({ gridMap, isDark }) {
  const [hoveredCell, setHoveredCell] = useState(null);

  // Isometric projection constants
  const tw = 22; // tile half-width
  const th = 11; // tile half-height
  const ox = 260; // horizontal origin
  const oy = 115; // vertical origin (leaves headroom for tall peaks)
  const maxH = 88; // maximum peak height in px

  // Build cells in painter's algorithm order (back to front: increasing gx + gy)
  const cells = [];
  for (let gx = 0; gx < 10; gx++) {
    for (let gy = 0; gy < 10; gy++) {
      const x = gx + 1;
      const y = 10 - gy; // Y=10 at back, Y=1 at front
      const entry = gridMap.get(`${x},${y}`);
      cells.push({ gx, gy, x, y, entry });
    }
  }

  return (
    <div className="relative w-full">
      {/* Floating Hover Tooltip */}
      {hoveredCell ? (
        <div
          className={`mb-3 px-4 py-2.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 transition ${
            isDark
              ? 'bg-slate-950/90 border-slate-700 text-slate-200'
              : 'bg-slate-50 border-slate-200 text-slate-800'
          }`}
        >
          <span className="font-bold">
            Grid ({hoveredCell.x}, {hoveredCell.y})
          </span>
          {hoveredCell.entry ? (
            <div className="flex flex-wrap items-center gap-3 font-mono">
              <span>Te: {hoveredCell.entry.obs.te}°C</span>
              <span>Refuge: {hoveredCell.entry.obs.refuge}</span>
              <span>Pred: {hoveredCell.entry.obs.predator}</span>
              <span className={`font-bold ${hoveredCell.entry.status.textClass}`}>
                LOF: {hoveredCell.entry.score.toFixed(3)}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 italic">No observation recorded at this coordinate</span>
          )}
        </div>
      ) : (
        <div
          className={`mb-3 px-4 py-2.5 rounded-xl border text-xs ${
            isDark
              ? 'bg-slate-950/50 border-slate-800 text-slate-400'
              : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}
        >
          Hover over any peak or valley in the 3D terrain to inspect coordinates, microhabitat data, and LOF score.
        </div>
      )}

      {/* Isometric SVG Canvas */}
      <div
        className={`rounded-xl border p-2 overflow-hidden ${
          isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50/80 border-slate-200'
        }`}
      >
        <svg viewBox="0 0 520 355" className="w-full h-auto select-none">
          {/* Axis Labels */}
          <text
            x="85"
            y="285"
            fontSize="11"
            fontWeight="700"
            fill={isDark ? '#64748b' : '#64748b'}
            transform="rotate(26, 85, 285)"
          >
            Y-AXIS (10 → 1)
          </text>
          <text
            x="385"
            y="305"
            fontSize="11"
            fontWeight="700"
            fill={isDark ? '#64748b' : '#64748b'}
            transform="rotate(-26, 385, 305)"
          >
            X-AXIS (1 → 10)
          </text>

          {cells.map(({ gx, gy, x, y, entry }) => {
            const bx = ox + (gx - gy) * tw;
            const by = oy + (gx + gy) * th;
            const hasData = Boolean(entry);
            const score = hasData ? entry.score : 0;
            const h = hasData ? Math.max(10, score * maxH) : 3;
            const isHovered = hoveredCell && hoveredCell.x === x && hoveredCell.y === y;

            // Colors for 3D shaded faces
            const topColor = hasData
              ? entry.status.topColor
              : isDark
              ? '#1e293b'
              : '#e2e8f0';
            const leftColor = hasData
              ? entry.status.leftColor
              : isDark
              ? '#0f172a'
              : '#cbd5e1';
            const rightColor = hasData
              ? entry.status.rightColor
              : isDark
              ? '#020617'
              : '#94a3b8';

            // Top diamond vertices (shifted up by h)
            const tTop = `${bx},${by - th - h}`;
            const tRight = `${bx + tw},${by - h}`;
            const tBottom = `${bx},${by + th - h}`;
            const tLeft = `${bx - tw},${by - h}`;

            // Base vertices
            const bRight = `${bx + tw},${by}`;
            const bBottom = `${bx},${by + th}`;
            const bLeft = `${bx - tw},${by}`;

            return (
              <g
                key={`${x},${y}`}
                onMouseEnter={() => setHoveredCell({ x, y, entry })}
                onMouseLeave={() => setHoveredCell(null)}
                className="cursor-pointer"
                style={{
                  opacity: hoveredCell && !isHovered && hasData ? 0.85 : 1,
                }}
              >
                {/* Left Shaded Face */}
                <polygon
                  points={`${tLeft} ${tBottom} ${bBottom} ${bLeft}`}
                  fill={leftColor}
                  stroke={isHovered ? '#ffffff' : isDark ? '#0f172a' : '#ffffff'}
                  strokeWidth={isHovered ? 1.5 : 0.6}
                />
                {/* Right Shaded Face */}
                <polygon
                  points={`${tRight} ${tBottom} ${bBottom} ${bRight}`}
                  fill={rightColor}
                  stroke={isHovered ? '#ffffff' : isDark ? '#0f172a' : '#ffffff'}
                  strokeWidth={isHovered ? 1.5 : 0.6}
                />
                {/* Top Diamond Face */}
                <polygon
                  points={`${tTop} ${tRight} ${tBottom} ${tLeft}`}
                  fill={topColor}
                  stroke={isHovered ? '#ffffff' : isDark ? '#0f172a' : '#ffffff'}
                  strokeWidth={isHovered ? 1.8 : 0.6}
                />
                {/* Score Label on top of active peaks */}
                {hasData && (
                  <text
                    x={bx}
                    y={by - h + 3}
                    textAnchor="middle"
                    fontSize="8.5"
                    fontWeight="800"
                    fill="#ffffff"
                    style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
                  >
                    {score.toFixed(1)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function App() {
  // Theme state (defaulting to clean, vibrant Light Dashboard mode)
  const [isDark, setIsDark] = useState(false);

  // Global species & model settings
  const [species, setSpecies] = useState('Sceloporus occidentalis');
  const [tPref, setTPref] = useState(34.5);
  const [ctMin, setCtMin] = useState(24.0);
  const [ctMax, setCtMax] = useState(45.0);
  const [vulnerability, setVulnerability] = useState(0.7);
  const [model, setModel] = useState('additive');
  const [activeTab, setActiveTab] = useState('calculator');

  // Tab 1: Point Calculator state
  const [te, setTe] = useState(30.0);
  const [refuge, setRefuge] = useState(0.4);
  const [predator, setPredator] = useState(0.3);

  // Tab 2: Field Data & Mapping state
  const [observations, setObservations] = useState(DEFAULT_OBSERVATIONS);
  const [spatialView, setSpatialView] = useState('3d'); // '3d' | '2d'
  const [newX, setNewX] = useState('1');
  const [newY, setNewY] = useState('1');
  const [newTe, setNewTe] = useState('34.5');
  const [newRefuge, setNewRefuge] = useState('0.5');
  const [newPredator, setNewPredator] = useState('0.5');
  const [importMessage, setImportMessage] = useState('');
  const fileInputRef = useRef(null);

  // Computed LOF score and status for Point Calculator
  const currentLOF = useMemo(
    () => calculateLOF(te, refuge, predator, tPref, ctMin, ctMax, vulnerability, model),
    [te, refuge, predator, tPref, ctMin, ctMax, vulnerability, model]
  );
  const currentStatus = getRiskStatus(currentLOF, isDark);
  const currentPerformancePct = Math.round(
    calculatePerformance(te, tPref, ctMin, ctMax) * 100
  );

  // Overlapping "Mountain-Like" Area Chart dataset across temperature
  const mountainData = useMemo(() => {
    const start = Math.max(0, Math.floor(ctMin - 5));
    const end = Math.min(60, Math.ceil(ctMax + 5));
    const points = [];
    for (let temp = start; temp <= end; temp += 1) {
      const perf = Math.round(calculatePerformance(temp, tPref, ctMin, ctMax) * 100);
      const addRisk = Math.round(
        calculateLOF(temp, refuge, predator, tPref, ctMin, ctMax, vulnerability, 'additive') *
          100
      );
      const multRisk = Math.round(
        calculateLOF(
          temp,
          refuge,
          predator,
          tPref,
          ctMin,
          ctMax,
          vulnerability,
          'multiplicative'
        ) * 100
      );
      points.push({
        temp,
        performance: perf,
        additiveRisk: addRisk,
        multiplicativeRisk: multRisk,
      });
    }
    return points;
  }, [tPref, ctMin, ctMax, refuge, predator, vulnerability]);

  // Add manual observation
  const handleAddObservation = (e) => {
    e.preventDefault();
    const x = Math.max(1, Math.min(10, Math.round(Number(newX) || 1)));
    const y = Math.max(1, Math.min(10, Math.round(Number(newY) || 1)));
    const teVal = Number(newTe) || 25;
    const refVal = Math.max(0, Math.min(1, Number(newRefuge) || 0));
    const predVal = Math.max(0, Math.min(1, Number(newPredator) || 0));

    setObservations((prev) => [
      {
        id: Date.now().toString(),
        x,
        y,
        te: teVal,
        refuge: refVal,
        predator: predVal,
      },
      ...prev.filter((o) => !(o.x === x && o.y === y)),
    ]);
    setImportMessage('');
  };

  // Import CSV (NicheMapR / Field)
  const handleCSVUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result || '');
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          setImportMessage('CSV file appears empty or missing data rows.');
          return;
        }
        const parsed = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => Number(c.trim()));
          if (cols.length >= 3 && !cols.slice(0, 3).some(isNaN)) {
            parsed.push({
              id: `${Date.now()}-${i}`,
              x: Math.max(1, Math.min(10, Math.round(cols[0]))),
              y: Math.max(1, Math.min(10, Math.round(cols[1]))),
              te: cols[2],
              refuge:
                cols[3] !== undefined && !isNaN(cols[3])
                  ? Math.max(0, Math.min(1, cols[3]))
                  : 0.5,
              predator:
                cols[4] !== undefined && !isNaN(cols[4])
                  ? Math.max(0, Math.min(1, cols[4]))
                  : 0.5,
            });
          }
        }
        if (parsed.length > 0) {
          setObservations(parsed);
          setImportMessage(`Imported ${parsed.length} observations from ${file.name}.`);
        } else {
          setImportMessage('No valid rows found. Expected columns: x, y, te, refuge, predator.');
        }
      } catch {
        setImportMessage('Error reading CSV file. Please check the format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Export CSV
  const handleExportCSV = () => {
    const header =
      'X,Y,Te_C,Refuge,Predator,Species,Model,T_pref,CT_min,CT_max,Vulnerability,LOF_Score\n';
    const rows = observations
      .map((obs) => {
        const score = calculateLOF(
          obs.te,
          obs.refuge,
          obs.predator,
          tPref,
          ctMin,
          ctMax,
          vulnerability,
          model
        ).toFixed(3);
        return `${obs.x},${obs.y},${obs.te},${obs.refuge},${obs.predator},"${species}",${model},${tPref},${ctMin},${ctMax},${vulnerability},${score}`;
      })
      .join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ectotherm_lof_${model}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Spatial lookup map for both 3D Landscape and 2D Heatmap
  const gridMap = useMemo(() => {
    const map = new Map();
    observations.forEach((obs) => {
      const score = calculateLOF(
        obs.te,
        obs.refuge,
        obs.predator,
        tPref,
        ctMin,
        ctMax,
        vulnerability,
        model
      );
      map.set(`${obs.x},${obs.y}`, {
        obs,
        score,
        status: getRiskStatus(score, isDark),
      });
    });
    return map;
  }, [observations, tPref, ctMin, ctMax, vulnerability, model, isDark]);

  // Shared theme classes
  const cardClass = isDark
    ? 'bg-slate-900/75 border-slate-800 shadow-xl'
    : 'bg-white border-slate-200/90 shadow-sm';
  const inputClass = isDark
    ? 'bg-slate-950 border-slate-700 text-white focus:border-cyan-400'
    : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-teal-600';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-500';
  const headingText = isDark ? 'text-white' : 'text-slate-900';

  return (
    <div
      className={`min-h-screen transition-colors duration-300 p-4 md:p-8 font-sans ${
        isDark ? 'bg-[#020617] text-slate-100' : 'bg-slate-50 text-slate-800'
      }`}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header with Light / Dark Theme Toggle */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-xl ${
                  isDark ? 'bg-cyan-500/15 text-cyan-400' : 'bg-teal-600 text-white shadow-sm'
                }`}
              >
                <Activity className="w-6 h-6" />
              </div>
              <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${headingText}`}>
                Ectotherm Risk Landscape (LOF)
              </h1>
            </div>
            <p className={`text-xs md:text-sm font-medium ${mutedText}`}>
              A Trait-Integrated Spatial Framework for Mapping Multi-Dimensional Fear and Physiological Trade-Offs in Herpetofauna.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsDark((prev) => !prev)}
            className={`self-start sm:self-auto flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
              isDark
                ? 'bg-slate-900 border-slate-700 text-amber-300 hover:bg-slate-800'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-sm'
            }`}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </button>
        </header>

        {/* Global Top Control Bar */}
        <section className={`border rounded-2xl p-5 space-y-5 ${cardClass}`}>
          {/* Row 1: Species, T_pref, Vulnerability, Model Framework */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
            <div className="md:col-span-3 space-y-1.5">
              <label className={`text-xs font-bold uppercase tracking-wider ${mutedText}`}>
                Study Species
              </label>
              <input
                type="text"
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
                className={`w-full border rounded-xl px-3.5 py-2.5 text-sm font-medium italic focus:outline-none transition ${inputClass}`}
              />
            </div>

            <div className="md:col-span-3 space-y-1.5">
              <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                <span className={mutedText}>Preferred Temp (T_pref)</span>
                <span className={isDark ? 'text-cyan-400' : 'text-teal-600'}>
                  {tPref.toFixed(1)}°C
                </span>
              </div>
              <input
                type="range"
                min={ctMin + 1}
                max={ctMax - 1}
                step={0.5}
                value={tPref}
                onChange={(e) => setTPref(Number(e.target.value))}
                className="w-full accent-teal-500 cursor-pointer"
              />
            </div>

            <div className="md:col-span-3 space-y-1.5">
              <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                <span className={mutedText}>Functional Vulnerability (F)</span>
                <span className={isDark ? 'text-purple-400' : 'text-purple-600'}>
                  {vulnerability.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={vulnerability}
                onChange={(e) => setVulnerability(Number(e.target.value))}
                className="w-full accent-purple-600 cursor-pointer"
              />
            </div>

            {/* Model Framework Toggle */}
            <div
              className={`md:col-span-3 rounded-xl p-2.5 space-y-2 border ${
                isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100/80 border-slate-200'
              }`}
            >
              <div className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${mutedText}`}>
                <Sliders className="w-3.5 h-3.5" />
                Model Framework
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setModel('additive')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                    model === 'additive'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : isDark
                      ? 'text-slate-400 hover:text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Additive (Linear)
                </button>
                <button
                  type="button"
                  onClick={() => setModel('multiplicative')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                    model === 'multiplicative'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : isDark
                      ? 'text-slate-400 hover:text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Multiplicative
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Critical Thermal Limits */}
          <div
            className={`pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-6 ${
              isDark ? 'border-slate-800/80' : 'border-slate-200'
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                <span className={mutedText}>Critical Thermal Minimum (CT_min)</span>
                <span className={isDark ? 'text-sky-400' : 'text-sky-600'}>
                  {ctMin.toFixed(1)}°C
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(5, tPref - 2)}
                step={0.5}
                value={ctMin}
                onChange={(e) => setCtMin(Number(e.target.value))}
                className="w-full accent-sky-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                <span className={mutedText}>Critical Thermal Maximum (CT_max)</span>
                <span className={isDark ? 'text-rose-400' : 'text-rose-600'}>
                  {ctMax.toFixed(1)}°C
                </span>
              </div>
              <input
                type="range"
                min={Math.min(55, tPref + 2)}
                max={55}
                step={0.5}
                value={ctMax}
                onChange={(e) => setCtMax(Number(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer"
              />
            </div>
          </div>
        </section>

        {/* Navigation Tabs */}
        <div
          className={`flex gap-2 border-b pb-1 ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveTab('calculator')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-bold transition cursor-pointer ${
              activeTab === 'calculator'
                ? isDark
                  ? 'bg-slate-900 text-cyan-400 border-t border-x border-slate-800'
                  : 'bg-white text-teal-700 border-t border-x border-slate-200 shadow-sm'
                : mutedText
            }`}
          >
            <Calculator className="w-4 h-4" />
            Point Calculator
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mapping')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-bold transition cursor-pointer ${
              activeTab === 'mapping'
                ? isDark
                  ? 'bg-slate-900 text-cyan-400 border-t border-x border-slate-800'
                  : 'bg-white text-teal-700 border-t border-x border-slate-200 shadow-sm'
                : mutedText
            }`}
          >
            <MapIcon className="w-4 h-4" />
            Field Data &amp; Mapping
          </button>
        </div>

        {/* TAB 1: POINT CALCULATOR */}
        {activeTab === 'calculator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Microhabitat Variables */}
            <div className={`lg:col-span-4 border rounded-2xl p-6 space-y-6 ${cardClass}`}>
              <div className={`flex items-center gap-2 text-base font-bold ${headingText}`}>
                <Sliders className="w-4 h-4 text-teal-500" />
                Microhabitat Variables
              </div>

              {/* Operative Temp */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Thermometer className="w-4 h-4 text-orange-500" />
                    Operative Temp (Te)
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-md font-bold text-xs ${
                      isDark ? 'bg-orange-950/60 text-orange-400' : 'bg-orange-100 text-orange-700'
                    }`}
                  >
                    {te.toFixed(1)}°C
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={0.5}
                  value={te}
                  onChange={(e) => setTe(Number(e.target.value))}
                  className="w-full accent-orange-500 cursor-pointer"
                />
              </div>

              {/* Refuge Availability */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Leaf className="w-4 h-4 text-emerald-500" />
                    Refuge Availability
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-md font-bold text-xs ${
                      isDark
                        ? 'bg-emerald-950/60 text-emerald-400'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {refuge.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={refuge}
                  onChange={(e) => setRefuge(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <p className={`text-xs text-center font-medium ${mutedText}`}>
                  Scarcity (1 - R) = {(1 - refuge).toFixed(2)}
                </p>
              </div>

              {/* Predator Probability */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <ShieldAlert className="w-4 h-4 text-rose-500" />
                    Predator Probability
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-md font-bold text-xs ${
                      isDark ? 'bg-rose-950/60 text-rose-400' : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {predator.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={predator}
                  onChange={(e) => setPredator(Number(e.target.value))}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>

              {/* Quick Summary Note */}
              <div
                className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                  isDark
                    ? 'bg-slate-950/60 border-slate-800 text-slate-400'
                    : 'bg-teal-50/60 border-teal-200/70 text-teal-900'
                }`}
              >
                <strong>Active Performance:</strong> At <strong>{te.toFixed(1)}°C</strong>,{' '}
                <em>{species}</em> operates at <strong>{currentPerformancePct}%</strong> of peak
                physiological capacity.
              </div>
            </div>

            {/* Right Column: Speedometer Gauge + Overlapping Mountain Area Chart */}
            <div className="lg:col-span-8 space-y-6">
              {/* LOF Risk Meter (Speedometer Gauge) */}
              <div className={`border rounded-2xl p-6 ${cardClass}`}>
                <LOFGaugeMeter score={currentLOF} status={currentStatus} isDark={isDark} />
              </div>

              {/* Overlapping Mountain-Like Area Graph */}
              <div className={`border rounded-2xl p-6 space-y-4 ${cardClass}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${headingText}`}>
                    <Activity className="w-4 h-4 text-teal-500" />
                    Thermal Performance vs. Risk Landscape Curves
                  </div>
                  <span className={`text-xs font-semibold ${mutedText}`}>
                    Translucent Area Comparison (%)
                  </span>
                </div>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={mountainData}
                      margin={{ top: 26, right: 20, left: 0, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.55} />
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="addGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.45} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="multGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.5} />
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={isDark ? '#1e293b' : '#e2e8f0'}
                      />
                      <XAxis
                        dataKey="temp"
                        stroke={isDark ? '#94a3b8' : '#64748b'}
                        tick={{ fontSize: 11 }}
                        unit="°C"
                      />
                      <YAxis
                        domain={[0, 100]}
                        stroke={isDark ? '#94a3b8' : '#64748b'}
                        tick={{ fontSize: 11 }}
                        unit="%"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? '#0f172a' : '#ffffff',
                          borderColor: isDark ? '#334155' : '#cbd5e1',
                          borderRadius: '0.75rem',
                          fontSize: '12px',
                          color: isDark ? '#f8fafc' : '#0f172a',
                        }}
                        formatter={(value, name) => [`${value}%`, name]}
                        labelFormatter={(label) => `Operative Temp: ${label}°C`}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />

                      <Area
                        type="monotone"
                        dataKey="performance"
                        name="Thermal Performance (%)"
                        stroke="#06b6d4"
                        strokeWidth={2.5}
                        fill="url(#perfGrad)"
                      />
                      <Area
                        type="monotone"
                        dataKey="additiveRisk"
                        name="Additive LOF Risk (%)"
                        stroke="#f59e0b"
                        strokeWidth={2.5}
                        fill="url(#addGrad)"
                      />
                      <Area
                        type="monotone"
                        dataKey="multiplicativeRisk"
                        name="Multiplicative LOF Risk (%)"
                        stroke="#f43f5e"
                        strokeWidth={2.5}
                        fill="url(#multGrad)"
                      />

                      <ReferenceLine
                        x={Math.round(te)}
                        stroke={isDark ? '#f97316' : '#ea580c'}
                        strokeDasharray="4 4"
                        strokeWidth={2}
                        label={{
                          value: `Current Te (${te.toFixed(1)}°C)`,
                          position: 'top',
                          fill: isDark ? '#fb923c' : '#ea580c',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: FIELD DATA & MAPPING */}
        {activeTab === 'mapping' && (
          <div className="space-y-6">
            {/* Add Observation + CSV Controls */}
            <div className={`border rounded-2xl p-6 space-y-5 ${cardClass}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${headingText}`}>
                  <MapIcon className="w-4 h-4 text-teal-500" />
                  Add Field Observation
                </div>

                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCSVUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      isDark
                        ? 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border-slate-700'
                        : 'bg-teal-50 hover:bg-teal-100 text-teal-800 border-teal-200'
                    }`}
                    title="CSV columns: x, y, te, refuge, predator"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Import CSV (NicheMapR / Field)
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      isDark
                        ? 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-slate-700'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setObservations(DEFAULT_OBSERVATIONS);
                      setImportMessage('Restored default 10-point habitat dataset.');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      isDark
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setObservations([]);
                      setImportMessage('');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      isDark
                        ? 'bg-slate-800 hover:bg-rose-950/60 text-rose-400 border-slate-700'
                        : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear
                  </button>
                </div>
              </div>

              {importMessage && (
                <div
                  className={`text-xs rounded-lg px-3 py-2 border font-medium ${
                    isDark
                      ? 'text-cyan-300 bg-cyan-950/40 border-cyan-800/60'
                      : 'text-teal-800 bg-teal-50 border-teal-200'
                  }`}
                >
                  {importMessage}
                </div>
              )}

              <form
                onSubmit={handleAddObservation}
                className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end"
              >
                <div>
                  <label className={`block text-[11px] font-bold uppercase mb-1 ${mutedText}`}>
                    X (1-10)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={newX}
                    onChange={(e) => setNewX(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                  />
                </div>
                <div>
                  <label className={`block text-[11px] font-bold uppercase mb-1 ${mutedText}`}>
                    Y (1-10)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={newY}
                    onChange={(e) => setNewY(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                  />
                </div>
                <div>
                  <label className={`block text-[11px] font-bold uppercase mb-1 ${mutedText}`}>
                    TE (°C)
                  </label>
                  <input
                    type="number"
                    step={0.5}
                    value={newTe}
                    onChange={(e) => setNewTe(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                  />
                </div>
                <div>
                  <label className={`block text-[11px] font-bold uppercase mb-1 ${mutedText}`}>
                    Refuge (0-1)
                  </label>
                  <input
                    type="number"
                    step={0.05}
                    min={0}
                    max={1}
                    value={newRefuge}
                    onChange={(e) => setNewRefuge(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                  />
                </div>
                <div>
                  <label className={`block text-[11px] font-bold uppercase mb-1 ${mutedText}`}>
                    Predator (0-1)
                  </label>
                  <input
                    type="number"
                    step={0.05}
                    min={0}
                    max={1}
                    value={newPredator}
                    onChange={(e) => setNewPredator(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                  />
                </div>
                <button
                  type="submit"
                  className="flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs uppercase tracking-wider py-2.5 px-4 rounded-xl shadow-sm transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Data
                </button>
              </form>
            </div>

            {/* Bottom Row: Spatial Visualization (3D Landscape / 2D Heatmap) + Dataset Table */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Spatial Visualization Card */}
              <div className={`lg:col-span-7 border rounded-2xl p-6 space-y-4 ${cardClass}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className={`text-sm font-bold uppercase tracking-wider ${headingText}`}>
                      {spatialView === '3d'
                        ? '3D Landscape of Fear Terrain (10×10)'
                        : '2D Spatial Risk Heatmap (10×10)'}
                    </h2>
                    <div className="flex items-center gap-3 text-[11px] font-bold mt-1">
                      <span className="flex items-center gap-1 text-emerald-500">
                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> SAFE VALLEY
                      </span>
                      <span className="flex items-center gap-1 text-amber-500">
                        <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> MODERATE
                      </span>
                      <span className="flex items-center gap-1 text-rose-500">
                        <span className="w-2.5 h-2.5 rounded-sm bg-rose-600" /> LETHAL PEAK
                      </span>
                    </div>
                  </div>

                  {/* 3D Landscape / 2D Heatmap Toggle */}
                  <div
                    className={`flex p-1 rounded-xl border ${
                      isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSpatialView('3d')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        spatialView === '3d'
                          ? 'bg-teal-600 text-white shadow-sm'
                          : mutedText
                      }`}
                    >
                      <Mountain className="w-3.5 h-3.5" />
                      3D Landscape
                    </button>
                    <button
                      type="button"
                      onClick={() => setSpatialView('2d')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        spatialView === '2d'
                          ? 'bg-teal-600 text-white shadow-sm'
                          : mutedText
                      }`}
                    >
                      <Grid className="w-3.5 h-3.5" />
                      2D Heatmap
                    </button>
                  </div>
                </div>

                {spatialView === '3d' ? (
                  <IsometricLandscape gridMap={gridMap} isDark={isDark} />
                ) : (
                  <div
                    className={`grid grid-cols-10 gap-1.5 p-3 rounded-xl border ${
                      isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                    }`}
                  >
                    {Array.from({ length: 10 }, (_, rowIdx) => {
                      const y = 10 - rowIdx;
                      return Array.from({ length: 10 }, (_, colIdx) => {
                        const x = colIdx + 1;
                        const entry = gridMap.get(`${x},${y}`);
                        return (
                          <div
                            key={`${x},${y}`}
                            title={
                              entry
                                ? `(${x},${y}) — LOF: ${entry.score.toFixed(3)}`
                                : `(${x},${y}) — No data`
                            }
                            className={`aspect-square rounded-md flex items-center justify-center text-[10px] font-bold transition ${
                              entry
                                ? entry.status.cellClass
                                : isDark
                                ? 'bg-slate-900/80 border border-slate-800/70 text-slate-700'
                                : 'bg-white border border-slate-200 text-slate-300'
                            }`}
                          >
                            {entry ? entry.score.toFixed(1) : ''}
                          </div>
                        );
                      });
                    })}
                  </div>
                )}
              </div>

              {/* Observation Dataset Table */}
              <div className={`lg:col-span-5 border rounded-2xl p-6 space-y-4 ${cardClass}`}>
                <h2 className={`text-sm font-bold uppercase tracking-wider text-center ${headingText}`}>
                  Observation Dataset ({observations.length})
                </h2>

                <div className="overflow-x-auto max-h-[410px]">
                  <table className="w-full text-left text-xs">
                    <thead
                      className={`uppercase border-b ${
                        isDark
                          ? 'text-slate-400 border-slate-800'
                          : 'text-slate-500 border-slate-200'
                      }`}
                    >
                      <tr>
                        <th className="py-2 px-2">X,Y</th>
                        <th className="py-2 px-2">TE (°C)</th>
                        <th className="py-2 px-2">Ref</th>
                        <th className="py-2 px-2">Pred</th>
                        <th className="py-2 px-2 text-teal-500">LOF</th>
                        <th className="py-2 px-2 text-right"></th>
                      </tr>
                    </thead>
                    <tbody
                      className={`divide-y font-mono ${
                        isDark ? 'divide-slate-800/60' : 'divide-slate-100'
                      }`}
                    >
                      {observations.map((obs) => {
                        const score = calculateLOF(
                          obs.te,
                          obs.refuge,
                          obs.predator,
                          tPref,
                          ctMin,
                          ctMax,
                          vulnerability,
                          model
                        );
                        const status = getRiskStatus(score, isDark);
                        return (
                          <tr
                            key={obs.id}
                            className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}
                          >
                            <td className="py-2.5 px-2 font-semibold">
                              {obs.x},{obs.y}
                            </td>
                            <td className="py-2.5 px-2 text-orange-500 font-semibold">{obs.te}</td>
                            <td className="py-2.5 px-2 text-emerald-500 font-semibold">
                              {obs.refuge}
                            </td>
                            <td className="py-2.5 px-2 text-rose-500 font-semibold">
                              {obs.predator}
                            </td>
                            <td className={`py-2.5 px-2 font-bold ${status.textClass}`}>
                              {score.toFixed(3)}
                            </td>
                            <td className="py-2.5 px-2 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setObservations((prev) => prev.filter((o) => o.id !== obs.id))
                                }
                                className="text-slate-400 hover:text-rose-500 cursor-pointer"
                                title="Remove row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {observations.length === 0 && (
                        <tr>
                          <td colSpan={6} className={`py-8 text-center font-sans ${mutedText}`}>
                            No observations yet. Add a point above, import a CSV, or click Reset.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
