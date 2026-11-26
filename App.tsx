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
  Sparkles,
  FileSpreadsheet,
  BookOpen,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  X,
  Check,
  Compass,
  Eye,
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

type ModelType = 'additive' | 'multiplicative';
type ConverterTab = 'refuge' | 'predator' | 'vulnerability' | 'te';

interface Observation {
  id: string;
  x: number;
  y: number;
  rawX?: number;
  rawY?: number;
  te: number;
  refuge: number;
  predator: number;
}

interface SpeciesPreset {
  label: string;
  scientific: string;
  tPref: number;
  ctMin: number;
  ctMax: number;
  vulnerability: number;
}

interface RiskStatus {
  zone: 'safe' | 'moderate' | 'lethal';
  label: string;
  badgeClass: string;
  cellClass: string;
  textClass: string;
  topColor: string;
  leftColor: string;
  rightColor: string;
}

interface GridEntry {
  obs: Observation;
  score: number;
  status: RiskStatus;
}

// Final Locked-In Species Profiles (Temperate vs. Tropical India)
const SPECIES_PRESETS: SpeciesPreset[] = [
  {
    label: 'Southwestern Fence Lizard (Profile A)',
    scientific: 'Sceloporus cowlesi',
    tPref: 34.9,
    ctMin: 7.5,
    ctMax: 42.1,
    vulnerability: 0.7,
  },
  {
    label: 'Common Wall Lizard (Profile B)',
    scientific: 'Podarcis muralis',
    tPref: 34.2,
    ctMin: 5.9,
    ctMax: 44.2,
    vulnerability: 0.4,
  },
  {
    label: 'Peninsular Rock Agama (Profile C)',
    scientific: 'Psammophilus dorsalis',
    tPref: 25.4,
    ctMin: 17.2,
    ctMax: 42.0,
    vulnerability: 0.65,
  },
  {
    label: 'Oriental Garden Lizard (Profile D)',
    scientific: 'Calotes versicolor',
    tPref: 28.2,
    ctMin: 13.9,
    ctMax: 45.5,
    vulnerability: 0.45,
  },
];

const DEFAULT_OBSERVATIONS: Observation[] = [
  { id: '1', x: 2, y: 2, te: 34.0, refuge: 0.95, predator: 0.05 },
  { id: '2', x: 3, y: 3, te: 33.5, refuge: 0.85, predator: 0.1 },
  { id: '3', x: 2, y: 8, te: 34.5, refuge: 0.9, predator: 0.1 },
  { id: '4', x: 4, y: 7, te: 26.5, refuge: 0.45, predator: 0.7 },
  { id: '5', x: 5, y: 5, te: 41.0, refuge: 0.2, predator: 0.65 },
  { id: '6', x: 6, y: 4, te: 38.5, refuge: 0.35, predator: 0.55 },
  { id: '7', x: 7, y: 8, te: 28.0, refuge: 0.3, predator: 0.8 },
  { id: '8', x: 8, y: 2, te: 34.0, refuge: 0.9, predator: 0.1 },
  { id: '9', x: 9, y: 9, te: 35.0, refuge: 0.1, predator: 0.9 },
  { id: '10', x: 8, y: 6, te: 25.0, refuge: 0.25, predator: 0.85 },
];

/**
 * Asymmetric Thermal Performance Curve (0 to 1)
 */
function calculatePerformance(
  te: number,
  tPref: number,
  ctMin: number,
  ctMax: number
): number {
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
 * Exact Manuscript Section 2.3 Equations:
 * Additive: 0.40*P + 0.20*R + 0.20*T + 0.20*F
 * Multiplicative: min(1, (0.50*P + 0.25*R + 0.25*F) * exp(beta * T))
 */
function calculateLOF(
  te: number,
  refuge: number,
  predator: number,
  tPref: number,
  ctMin: number,
  ctMax: number,
  vulnerability: number,
  model: ModelType,
  beta = 3.0
): number {
  const scarcity = 1 - refuge;
  const deltaTMax =
    te <= tPref ? Math.max(0.1, tPref - ctMin) : Math.max(0.1, ctMax - tPref);
  const thermalMismatch = Math.min(1, Math.abs(te - tPref) / deltaTMax);

  if (model === 'additive') {
    const raw =
      0.4 * predator +
      0.2 * scarcity +
      0.2 * thermalMismatch +
      0.2 * vulnerability;
    return Math.max(0, Math.min(1, raw));
  } else {
    const baseRisk = 0.5 * predator + 0.25 * scarcity + 0.25 * vulnerability;
    const raw = baseRisk * Math.exp(beta * thermalMismatch);
    return Math.max(0, Math.min(1, raw));
  }
}

function getRiskStatus(score: number, isDark: boolean): RiskStatus {
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

function LOFLogo() {
  return (
    <div className="w-12 h-12 rounded-2xl bg-[#06281e] border border-emerald-500/40 shadow-md flex items-center justify-center shrink-0 overflow-hidden">
      <svg viewBox="0 0 64 64" className="w-11 h-11">
        <defs>
          <linearGradient id="lofWaveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="52%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>
        </defs>
        <path
          d="M 8 44 L 22 25 L 33 37 L 45 19 L 56 44 Z"
          fill="#0d3b2e"
          stroke="#34d399"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M 15 35 C 21 26, 30 22, 39 24 C 44 25, 48 22, 51 20"
          fill="none"
          stroke="#4ade80"
          strokeWidth="4.2"
          strokeLinecap="round"
        />
        <circle cx="52" cy="19.5" r="3" fill="#4ade80" />
        <path
          d="M 27 25 L 24 31 M 37 24 L 39 30 M 15 35 C 12 37, 10 35, 11 32"
          fill="none"
          stroke="#4ade80"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M 8 51 Q 20 44, 32 51 T 56 51"
          fill="none"
          stroke="url(#lofWaveGrad)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

/**
 * ALL-IN-ONE INTERACTIVE FIELD-TO-INDEX CONVERTER MODAL
 * Lets researchers derive Refuge, Predator, Vulnerability (F), and Operative Temp (Te)
 * from real field measurements with live SVG graphics and one-click Apply.
 */
function FieldConverterModal({
  isOpen,
  activeTab,
  onTabChange,
  onClose,
  isDark,
  onApplyRefuge,
  onApplyPredator,
  onApplyVulnerability,
  onApplyTe,
}: {
  isOpen: boolean;
  activeTab: ConverterTab;
  onTabChange: (tab: ConverterTab) => void;
  onClose: () => void;
  isDark: boolean;
  onApplyRefuge: (val: number) => void;
  onApplyPredator: (val: number) => void;
  onApplyVulnerability: (val: number) => void;
  onApplyTe: (val: number) => void;
}) {
  // 1. Refuge methods
  const [refugeMethod, setRefugeMethod] = useState<'quadrat' | 'distance' | 'preset'>('quadrat');
  const [coverPct, setCoverPct] = useState(65);
  const [distShelter, setDistShelter] = useState(1.2);
  const [maxEscapeDist, setMaxEscapeDist] = useState(5.0);
  const [refugePreset, setRefugePreset] = useState(0.75);

  const computedRefuge = useMemo(() => {
    if (refugeMethod === 'quadrat') return Math.max(0, Math.min(1, coverPct / 100));
    if (refugeMethod === 'distance') {
      const denom = Math.max(0.1, maxEscapeDist);
      return Math.max(0, Math.min(1, 1 - distShelter / denom));
    }
    return refugePreset;
  }, [refugeMethod, coverPct, distShelter, maxEscapeDist, refugePreset]);

  // 2. Predator methods
  const [predMethod, setPredMethod] = useState<'clay' | 'counts' | 'occupancy' | 'preset'>('clay');
  const [attackedModels, setAttackedModels] = useState(3);
  const [totalModels, setTotalModels] = useState(25);
  const [siteDetections, setSiteDetections] = useState(6);
  const [maxDetections, setMaxDetections] = useState(15);
  const [occupancyPsi, setOccupancyPsi] = useState(0.45);
  const [predPreset, setPredPreset] = useState(0.5);

  const computedPredator = useMemo(() => {
    if (predMethod === 'clay') {
      return Math.max(0, Math.min(1, attackedModels / Math.max(1, totalModels)));
    }
    if (predMethod === 'counts') {
      return Math.max(0, Math.min(1, siteDetections / Math.max(1, maxDetections)));
    }
    if (predMethod === 'occupancy') return Math.max(0, Math.min(1, occupancyPsi));
    return predPreset;
  }, [predMethod, attackedModels, totalModels, siteDetections, maxDetections, occupancyPsi, predPreset]);

  // 3. Vulnerability (F) methods
  const [vulnMethod, setVulnMethod] = useState<'traits' | 'guild'>('traits');
  const [microExposure, setMicroExposure] = useState(0.75); // Crevice 0.2, Arboreal 0.45, Open Rock 0.75
  const [conspicuity, setConspicuity] = useState(0.55);
  const [activityScore, setActivityScore] = useState(0.7);
  const [defenceScore, setDefenceScore] = useState(0.5);
  const [guildPreset, setGuildPreset] = useState(0.65);

  const computedVuln = useMemo(() => {
    if (vulnMethod === 'guild') return guildPreset;
    const avg = (microExposure + conspicuity + activityScore + defenceScore) / 4;
    return Math.max(0.1, Math.min(1, Number(avg.toFixed(2))));
  }, [vulnMethod, microExposure, conspicuity, activityScore, defenceScore, guildPreset]);

  // 4. Operative Temp (Te) methods
  const [teMethod, setTeMethod] = useState<'solar' | 'direct'>('solar');
  const [airTemp, setAirTemp] = useState(28.0);
  const [solarOffset, setSolarOffset] = useState(7.0); // 0 shade, 3 canopy, 7 partial, 12 full sun rock
  const [directTe, setDirectTe] = useState(34.5);

  const computedTe = useMemo(() => {
    if (teMethod === 'direct') return Math.max(5, Math.min(50, directTe));
    return Math.max(5, Math.min(50, Number((airTemp + solarOffset).toFixed(1))));
  }, [teMethod, airTemp, solarOffset, directTe]);

  if (!isOpen) return null;

  const panelBg = isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800';
  const subCard = isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200';
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const inputCls = isDark
    ? 'bg-slate-900 border-slate-700 text-white'
    : 'bg-white border-slate-300 text-slate-900';

  const pillBtn = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
      active
        ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
        : isDark
        ? 'bg-slate-900 border-slate-700 text-slate-300 hover:border-teal-500'
        : 'bg-white border-slate-200 text-slate-700 hover:border-teal-500'
    }`;

  // Visual helpers
  const filledCells = Math.round(computedRefuge * 25);
  const displayTotalModels = Math.min(25, Math.max(1, totalModels));
  const displayAttacked = Math.round(computedPredator * displayTotalModels);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-sm">
      <div className={`w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl ${panelBg}`}>
        {/* Modal Header */}
        <div
          className={`sticky top-0 z-10 px-5 py-4 border-b flex items-center justify-between gap-3 ${
            isDark ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-600/15 text-teal-500">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight">
                Field-to-Index Converter &amp; Parameterisation Guide
              </h2>
              <p className={`text-xs ${muted}`}>
                Convert raw ecological measurements into standardised LOF inputs—no external tools needed.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl border transition cursor-pointer ${
              isDark ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-100'
            }`}
            aria-label="Close converter"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Top Parameter Tabs */}
        <div
          className={`px-5 pt-4 pb-3 border-b grid grid-cols-2 sm:grid-cols-4 gap-2 ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          {[
            { id: 'refuge' as ConverterTab, label: 'Refuge (R)', icon: Leaf, color: 'text-emerald-500' },
            { id: 'predator' as ConverterTab, label: 'Predator (P)', icon: ShieldAlert, color: 'text-rose-500' },
            { id: 'vulnerability' as ConverterTab, label: 'Vulnerability (F)', icon: Eye, color: 'text-purple-500' },
            { id: 'te' as ConverterTab, label: 'Operative Temp (Te)', icon: Thermometer, color: 'text-orange-500' },
          ].map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange(t.id)}
                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  active
                    ? isDark
                      ? 'bg-slate-800 border-teal-500 text-white shadow-sm'
                      : 'bg-teal-50 border-teal-500 text-teal-900 shadow-sm'
                    : isDark
                    ? 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${t.color}`} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* ================= TAB 1: REFUGE ================= */}
          {activeTab === 'refuge' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setRefugeMethod('quadrat')} className={pillBtn(refugeMethod === 'quadrat')}>
                  1. Quadrat / Cover (%)
                </button>
                <button type="button" onClick={() => setRefugeMethod('distance')} className={pillBtn(refugeMethod === 'distance')}>
                  2. Distance to Shelter (m)
                </button>
                <button type="button" onClick={() => setRefugeMethod('preset')} className={pillBtn(refugeMethod === 'preset')}>
                  3. Microhabitat Presets
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                {/* Controls */}
                <div className={`md:col-span-7 p-4 rounded-xl border space-y-4 ${subCard}`}>
                  {refugeMethod === 'quadrat' && (
                    <>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span>Usable Shelter Cover in Plot (e.g. 1×1 m quadrat)</span>
                          <span className="text-emerald-500">{coverPct}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={coverPct}
                          onChange={(e) => setCoverPct(Number(e.target.value))}
                          className="w-full accent-emerald-500 cursor-pointer"
                        />
                      </div>
                      <p className={`text-xs leading-relaxed ${muted}`}>
                        <strong>Formula:</strong>{' '}
                        <code className="font-mono">R_avail = Cover% / 100</code>. Count the proportion of the sampling quadrat offering usable crevices, leaf litter, shrub canopy, or burrows for the focal species.
                      </p>
                    </>
                  )}

                  {refugeMethod === 'distance' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={`block text-[11px] font-bold uppercase mb-1 ${muted}`}>
                            Distance to Shelter d (m)
                          </label>
                          <input
                            type="number"
                            step={0.1}
                            min={0}
                            value={distShelter}
                            onChange={(e) => setDistShelter(Math.max(0, Number(e.target.value)))}
                            className={`w-full border rounded-lg px-3 py-2 text-sm font-mono ${inputCls}`}
                          />
                        </div>
                        <div>
                          <label className={`block text-[11px] font-bold uppercase mb-1 ${muted}`}>
                            Max Escape Dist d_max (m)
                          </label>
                          <input
                            type="number"
                            step={0.5}
                            min={0.5}
                            value={maxEscapeDist}
                            onChange={(e) => setMaxEscapeDist(Math.max(0.5, Number(e.target.value)))}
                            className={`w-full border rounded-lg px-3 py-2 text-sm font-mono ${inputCls}`}
                          />
                        </div>
                      </div>
                      <p className={`text-xs leading-relaxed ${muted}`}>
                        <strong>Formula:</strong>{' '}
                        <code className="font-mono">R_avail = max(0, 1 − d / d_max)</code>. Captures immediate escape accessibility from the focal microsite.
                      </p>
                    </>
                  )}

                  {refugeMethod === 'preset' && (
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { name: 'Open Rock / Bare Sand', val: 0.1, desc: 'No immediate cover' },
                        { name: 'Sparse Grass / Scrub', val: 0.4, desc: 'Scattered cover patches' },
                        { name: 'Fractured Boulders', val: 0.75, desc: 'Deep rock crevices' },
                        { name: 'Dense Understorey / Burrow', val: 0.92, desc: 'Near-total concealment' },
                      ].map((p) => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => setRefugePreset(p.val)}
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                            refugePreset === p.val
                              ? 'border-emerald-500 bg-emerald-500/15'
                              : isDark
                              ? 'border-slate-800 hover:border-slate-600'
                              : 'border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          <div className="text-xs font-bold">{p.name}</div>
                          <div className={`text-[11px] ${muted}`}>
                            {p.desc} • <strong className="text-emerald-500">{p.val.toFixed(2)}</strong>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Graphic + Result */}
                <div className={`md:col-span-5 p-4 rounded-xl border flex flex-col items-center justify-between gap-3 ${subCard}`}>
                  {refugeMethod === 'distance' ? (
                    <svg viewBox="0 0 220 95" className="w-full h-auto">
                      <line x1="20" y1="68" x2="200" y2="68" stroke="#64748b" strokeWidth="2" strokeDasharray="4 3" />
                      {/* Rock Shelter */}
                      <ellipse cx="32" cy="60" rx="18" ry="12" fill="#10b981" />
                      <text x="32" y="84" textAnchor="middle" fontSize="9" fontWeight="700" fill="#10b981">
                        Refuge (0m)
                      </text>
                      {/* Lizard Position */}
                      <circle
                        cx={32 + Math.min(1, distShelter / Math.max(0.1, maxEscapeDist)) * 155}
                        cy="60"
                        r="7"
                        fill="#f59e0b"
                      />
                      <text
                        x={32 + Math.min(1, distShelter / Math.max(0.1, maxEscapeDist)) * 155}
                        y="46"
                        textAnchor="middle"
                        fontSize="9"
                        fontWeight="700"
                        fill="#f59e0b"
                      >
                        {distShelter.toFixed(1)}m
                      </text>
                      <text x="188" y="84" textAnchor="middle" fontSize="9" fill="#94a3b8">
                        d_max ({maxEscapeDist}m)
                      </text>
                    </svg>
                  ) : (
                    <div className="space-y-1.5 text-center">
                      <div className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>
                        Visual 5×5 Quadrat Cover Map
                      </div>
                      <div className="grid grid-cols-5 gap-1 mx-auto w-28">
                        {Array.from({ length: 25 }, (_, idx) => (
                          <div
                            key={idx}
                            className={`w-4 h-4 rounded-sm transition-colors ${
                              idx < filledCells
                                ? 'bg-emerald-500'
                                : isDark
                                ? 'bg-slate-800'
                                : 'bg-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-center">
                    <div className={`text-[11px] font-bold uppercase ${muted}`}>Derived R_avail</div>
                    <div className="text-3xl font-black text-emerald-500 tabular-nums">
                      {computedRefuge.toFixed(2)}
                    </div>
                    <div className={`text-[11px] ${muted}`}>
                      Scarcity (1 − R) = {(1 - computedRefuge).toFixed(2)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onApplyRefuge(Number(computedRefuge.toFixed(2)));
                      onClose();
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer transition"
                  >
                    <Check className="w-4 h-4" />
                    Apply Refuge ({computedRefuge.toFixed(2)})
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 2: PREDATOR ================= */}
          {activeTab === 'predator' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setPredMethod('clay')} className={pillBtn(predMethod === 'clay')}>
                  1. Clay / 3D Model Assays
                </button>
                <button type="button" onClick={() => setPredMethod('counts')} className={pillBtn(predMethod === 'counts')}>
                  2. Point Counts / Cameras
                </button>
                <button type="button" onClick={() => setPredMethod('occupancy')} className={pillBtn(predMethod === 'occupancy')}>
                  3. Occupancy (ψ)
                </button>
                <button type="button" onClick={() => setPredMethod('preset')} className={pillBtn(predMethod === 'preset')}>
                  4. Field Presets
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div className={`md:col-span-7 p-4 rounded-xl border space-y-4 ${subCard}`}>
                  {predMethod === 'clay' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={`block text-[11px] font-bold uppercase mb-1 ${muted}`}>
                            Models Attacked
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={totalModels}
                            value={attackedModels}
                            onChange={(e) => setAttackedModels(Math.max(0, Number(e.target.value)))}
                            className={`w-full border rounded-lg px-3 py-2 text-sm font-mono ${inputCls}`}
                          />
                        </div>
                        <div>
                          <label className={`block text-[11px] font-bold uppercase mb-1 ${muted}`}>
                            Total Deployed
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={totalModels}
                            onChange={(e) => setTotalModels(Math.max(1, Number(e.target.value)))}
                            className={`w-full border rounded-lg px-3 py-2 text-sm font-mono ${inputCls}`}
                          />
                        </div>
                      </div>
                      <p className={`text-xs leading-relaxed ${muted}`}>
                        <strong>Formula:</strong>{' '}
                        <code className="font-mono">P_enc = Attacked / Total Deployed</code> (e.g., 2/25 attacked = 0.08). Standard method for quantifying avian &amp; mammalian predation pressure on reptiles.
                      </p>
                    </>
                  )}

                  {predMethod === 'counts' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={`block text-[11px] font-bold uppercase mb-1 ${muted}`}>
                            Site Detections (C_j)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={siteDetections}
                            onChange={(e) => setSiteDetections(Math.max(0, Number(e.target.value)))}
                            className={`w-full border rounded-lg px-3 py-2 text-sm font-mono ${inputCls}`}
                          />
                        </div>
                        <div>
                          <label className={`block text-[11px] font-bold uppercase mb-1 ${muted}`}>
                            Max Site Count (C_max)
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={maxDetections}
                            onChange={(e) => setMaxDetections(Math.max(1, Number(e.target.value)))}
                            className={`w-full border rounded-lg px-3 py-2 text-sm font-mono ${inputCls}`}
                          />
                        </div>
                      </div>
                      <p className={`text-xs leading-relaxed ${muted}`}>
                        <strong>Formula:</strong>{' '}
                        <code className="font-mono">P_enc = min(1, C_j / C_max)</code>. Scales point-count, transect, or camera-trap predator detections onto [0, 1].
                      </p>
                    </>
                  )}

                  {predMethod === 'occupancy' && (
                    <>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span>Modelled Predator Site Occupancy (ψ_j)</span>
                          <span className="text-rose-500">{occupancyPsi.toFixed(2)}</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={occupancyPsi}
                          onChange={(e) => setOccupancyPsi(Number(e.target.value))}
                          className="w-full accent-rose-500 cursor-pointer"
                        />
                      </div>
                      <p className={`text-xs leading-relaxed ${muted}`}>
                        Direct output from single-season or multi-species occupancy models (e.g., R <code className="font-mono">unmarked</code>).
                      </p>
                    </>
                  )}

                  {predMethod === 'preset' && (
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { name: 'Protected Core / Low', val: 0.1, desc: 'Rare raptor/mammal visits' },
                        { name: 'Natural Woodland Edge', val: 0.4, desc: 'Moderate diurnal predators' },
                        { name: 'Open Scrub / Agricultural', val: 0.7, desc: 'Frequent avian & snake hunts' },
                        { name: 'Urban / Feral Predator Hub', val: 0.9, desc: 'Cats, dogs, corvids abundant' },
                      ].map((p) => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => setPredPreset(p.val)}
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                            predPreset === p.val
                              ? 'border-rose-500 bg-rose-500/15'
                              : isDark
                              ? 'border-slate-800 hover:border-slate-600'
                              : 'border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          <div className="text-xs font-bold">{p.name}</div>
                          <div className={`text-[11px] ${muted}`}>
                            {p.desc} • <strong className="text-rose-500">{p.val.toFixed(2)}</strong>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Graphic + Result */}
                <div className={`md:col-span-5 p-4 rounded-xl border flex flex-col items-center justify-between gap-3 ${subCard}`}>
                  <div className="space-y-1.5 text-center">
                    <div className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>
                      {predMethod === 'clay'
                        ? `Replica Assay Hit Map (${displayAttacked}/${displayTotalModels})`
                        : 'Relative Predation Pressure'}
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 mx-auto">
                      {Array.from({ length: displayTotalModels }, (_, idx) => (
                        <div
                          key={idx}
                          className={`w-4 h-4 rounded-full transition-colors ${
                            idx < displayAttacked
                              ? 'bg-rose-500 ring-2 ring-rose-500/30'
                              : isDark
                              ? 'bg-slate-800'
                              : 'bg-slate-200'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className={`text-[11px] font-bold uppercase ${muted}`}>Derived P_enc</div>
                    <div className="text-3xl font-black text-rose-500 tabular-nums">
                      {computedPredator.toFixed(2)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onApplyPredator(Number(computedPredator.toFixed(2)));
                      onClose();
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer transition"
                  >
                    <Check className="w-4 h-4" />
                    Apply Predator ({computedPredator.toFixed(2)})
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 3: VULNERABILITY (F) ================= */}
          {activeTab === 'vulnerability' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setVulnMethod('traits')} className={pillBtn(vulnMethod === 'traits')}>
                  1. ReptTraits 4-Trait Rubric
                </button>
                <button type="button" onClick={() => setVulnMethod('guild')} className={pillBtn(vulnMethod === 'guild')}>
                  2. Ecological Guild Presets
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div className={`md:col-span-7 p-4 rounded-xl border space-y-3 ${subCard}`}>
                  {vulnMethod === 'traits' ? (
                    <>
                      {[
                        {
                          label: 'Microhabitat Exposure',
                          val: microExposure,
                          set: setMicroExposure,
                          opts: [
                            { t: 'Fossorial/Crevice', v: 0.2 },
                            { t: 'Arboreal/Generalist', v: 0.45 },
                            { t: 'Open/Saxicolous', v: 0.75 },
                          ],
                        },
                        {
                          label: 'Visual Conspicuity',
                          val: conspicuity,
                          set: setConspicuity,
                          opts: [
                            { t: 'Highly Cryptic', v: 0.2 },
                            { t: 'Moderate', v: 0.5 },
                            { t: 'Conspicuous/Bright', v: 0.85 },
                          ],
                        },
                        {
                          label: 'Activity Period',
                          val: activityScore,
                          set: setActivityScore,
                          opts: [
                            { t: 'Nocturnal', v: 0.25 },
                            { t: 'Cathemeral', v: 0.5 },
                            { t: 'Diurnal Basker', v: 0.75 },
                          ],
                        },
                        {
                          label: 'Antipredator Defence',
                          val: defenceScore,
                          set: setDefenceScore,
                          opts: [
                            { t: 'Venom/Armour', v: 0.15 },
                            { t: 'Fast Sprint/Autotomy', v: 0.45 },
                            { t: 'Minimal Defence', v: 0.8 },
                          ],
                        },
                      ].map((row) => (
                        <div key={row.label} className="space-y-1">
                          <div className="text-[11px] font-bold uppercase tracking-wider">{row.label}</div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {row.opts.map((o) => (
                              <button
                                key={o.t}
                                type="button"
                                onClick={() => row.set(o.v)}
                                className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                                  row.val === o.v
                                    ? 'bg-purple-600 text-white border-purple-600'
                                    : isDark
                                    ? 'bg-slate-900 border-slate-800 text-slate-300'
                                    : 'bg-white border-slate-200 text-slate-700'
                                }`}
                              >
                                {o.t}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { name: 'Venomous Viper / Cryptic', val: 0.25, desc: 'Ambush + venom defence' },
                        { name: 'Crevice / Wall Generalist', val: 0.4, desc: 'e.g., Podarcis muralis' },
                        { name: 'Arboreal Agamid', val: 0.45, desc: 'e.g., Calotes versicolor' },
                        { name: 'Open Rock / Basker Specialist', val: 0.7, desc: 'e.g., S. cowlesi / P. dorsalis' },
                      ].map((p) => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => setGuildPreset(p.val)}
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                            guildPreset === p.val
                              ? 'border-purple-500 bg-purple-500/15'
                              : isDark
                              ? 'border-slate-800 hover:border-slate-600'
                              : 'border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          <div className="text-xs font-bold">{p.name}</div>
                          <div className={`text-[11px] ${muted}`}>
                            {p.desc} • <strong className="text-purple-500">{p.val.toFixed(2)}</strong>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Graphic + Result */}
                <div className={`md:col-span-5 p-4 rounded-xl border flex flex-col items-center justify-between gap-3 ${subCard}`}>
                  <div className="w-full space-y-2">
                    <div className={`text-[10px] font-bold uppercase tracking-wider text-center ${muted}`}>
                      Trait Risk Profile
                    </div>
                    {[
                      { k: 'Exposure', v: vulnMethod === 'traits' ? microExposure : computedVuln },
                      { k: 'Conspicuity', v: vulnMethod === 'traits' ? conspicuity : computedVuln },
                      { k: 'Activity', v: vulnMethod === 'traits' ? activityScore : computedVuln },
                      { k: 'Defence Gap', v: vulnMethod === 'traits' ? defenceScore : computedVuln },
                    ].map((b) => (
                      <div key={b.k} className="space-y-0.5">
                        <div className="flex justify-between text-[10px] font-semibold">
                          <span>{b.k}</span>
                          <span>{Math.round(b.v * 100)}%</span>
                        </div>
                        <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                          <div
                            className="h-full bg-purple-500 rounded-full transition-all"
                            style={{ width: `${Math.round(b.v * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-center">
                    <div className={`text-[11px] font-bold uppercase ${muted}`}>Derived Vulnerability (F)</div>
                    <div className="text-3xl font-black text-purple-500 tabular-nums">
                      {computedVuln.toFixed(2)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onApplyVulnerability(computedVuln);
                      onClose();
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold cursor-pointer transition"
                  >
                    <Check className="w-4 h-4" />
                    Apply Vulnerability ({computedVuln.toFixed(2)})
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 4: OPERATIVE TEMP (Te) ================= */}
          {activeTab === 'te' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setTeMethod('solar')} className={pillBtn(teMethod === 'solar')}>
                  1. Air Temp + Solar Exposure Estimator
                </button>
                <button type="button" onClick={() => setTeMethod('direct')} className={pillBtn(teMethod === 'direct')}>
                  2. Direct Copper Model / iButton / NicheMapR
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div className={`md:col-span-7 p-4 rounded-xl border space-y-4 ${subCard}`}>
                  {teMethod === 'solar' ? (
                    <>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span>Shaded Ambient Air Temp (T_air)</span>
                          <span className="text-orange-500">{airTemp.toFixed(1)}°C</span>
                        </div>
                        <input
                          type="range"
                          min={5}
                          max={42}
                          step={0.5}
                          value={airTemp}
                          onChange={(e) => setAirTemp(Number(e.target.value))}
                          className="w-full accent-orange-500 cursor-pointer"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold uppercase tracking-wider">Solar Microsite Exposure</div>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { name: 'Deep Shade / Burrow', offset: 0 },
                            { name: 'Filtered Canopy', offset: 3 },
                            { name: 'Partial Sun / Edge', offset: 7 },
                            { name: 'Full Sun Rock / Open', offset: 12 },
                          ].map((s) => (
                            <button
                              key={s.name}
                              type="button"
                              onClick={() => setSolarOffset(s.offset)}
                              className={`p-2 rounded-xl border text-left text-xs font-semibold transition cursor-pointer ${
                                solarOffset === s.offset
                                  ? 'border-orange-500 bg-orange-500/15 text-orange-500'
                                  : isDark
                                  ? 'border-slate-800 text-slate-300'
                                  : 'border-slate-200 text-slate-700'
                              }`}
                            >
                              {s.name}{' '}
                              <span className="font-mono text-[11px]">(+{s.offset}°C)</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className={`block text-[11px] font-bold uppercase mb-1 ${muted}`}>
                          Measured Operative Temperature Te (°C)
                        </label>
                        <input
                          type="number"
                          step={0.1}
                          min={5}
                          max={50}
                          value={directTe}
                          onChange={(e) => setDirectTe(Number(e.target.value))}
                          className={`w-full border rounded-lg px-3 py-2 text-sm font-mono ${inputCls}`}
                        />
                      </div>
                      <p className={`text-xs leading-relaxed ${muted}`}>
                        Use direct readings from painted copper operative-temperature models, thermal data loggers (iButtons), or biophysical outputs from <strong>NicheMapR</strong>. For spatial grids, upload a CSV in the <em>Field Data &amp; Mapping</em> tab.
                      </p>
                    </>
                  )}
                </div>

                {/* Graphic + Result */}
                <div className={`md:col-span-5 p-4 rounded-xl border flex flex-col items-center justify-between gap-3 ${subCard}`}>
                  <svg viewBox="0 0 180 80" className="w-full h-auto">
                    <rect x="20" y="34" width="140" height="14" rx="7" fill={isDark ? '#1e293b' : '#e2e8f0'} />
                    <rect
                      x="20"
                      y="34"
                      width={Math.max(8, Math.min(140, ((computedTe - 5) / 45) * 140))}
                      height="14"
                      rx="7"
                      fill={computedTe > 38 ? '#e11d48' : computedTe < 18 ? '#0284c7' : '#f97316'}
                    />
                    <text x="20" y="65" fontSize="9" fill="#94a3b8">
                      5°C
                    </text>
                    <text x="90" y="22" textAnchor="middle" fontSize="11" fontWeight="800" fill="#f97316">
                      Estimated Te: {computedTe.toFixed(1)}°C
                    </text>
                    <text x="160" y="65" textAnchor="end" fontSize="9" fill="#94a3b8">
                      50°C
                    </text>
                  </svg>

                  <div className="text-center">
                    <div className={`text-[11px] font-bold uppercase ${muted}`}>Operative Temp (Te)</div>
                    <div className="text-3xl font-black text-orange-500 tabular-nums">
                      {computedTe.toFixed(1)}°C
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onApplyTe(computedTe);
                      onClose();
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold cursor-pointer transition"
                  >
                    <Check className="w-4 h-4" />
                    Apply Te ({computedTe.toFixed(1)}°C)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HabitatVisualizer({
  te,
  tPref,
  ctMin,
  ctMax,
  refuge,
  predator,
  lofScore,
  species,
  isDark,
}: {
  te: number;
  tPref: number;
  ctMin: number;
  ctMax: number;
  refuge: number;
  predator: number;
  lofScore: number;
  species: string;
  isDark: boolean;
}) {
  const isCold = te < tPref - 4.5;
  const isHot = te > tPref + 4.5;
  const isExtreme = te <= ctMin + 1 || te >= ctMax - 1;

  const skyTop = isCold ? '#0284c7' : isHot ? '#dc2626' : '#0ea5e9';
  const skyBottom = isCold ? '#bae6fd' : isHot ? '#fed7aa' : '#fef3c7';

  const lizardColor = isCold ? '#38bdf8' : isHot ? '#f43f5e' : '#10b981';
  const thermalMood = isExtreme
    ? 'Lethal Thermal Stress!'
    : isCold
    ? 'Cold & Sluggish (Slow Escape)'
    : isHot
    ? 'Overheating (Heat Stress)'
    : 'Optimal Thermal Zone (Fast Escape)';

  const thermalBadgeClass = isExtreme
    ? 'bg-rose-500/15 text-rose-500'
    : isCold || isHot
    ? 'bg-amber-500/15 text-amber-600'
    : 'bg-emerald-500/15 text-emerald-600';

  const hawkY = 54 - predator * 24;
  const hawkScale = 0.65 + predator * 0.65;
  const sunRadius = 11 + Math.max(0, Math.min(14, (te - 10) * 0.35));

  return (
    <div
      className={`border rounded-2xl p-4 space-y-3 overflow-hidden ${
        isDark ? 'bg-slate-900/75 border-slate-800' : 'bg-white border-slate-200/90 shadow-sm'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className={`flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-500" />
          Live Microhabitat Scene
        </div>
        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${thermalBadgeClass}`}>
          {thermalMood}
        </span>
      </div>

      <div className="rounded-xl overflow-hidden border border-slate-200/50 dark:border-slate-800">
        <svg viewBox="0 0 560 170" className="w-full h-auto block select-none">
          <defs>
            <linearGradient id="habSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={skyTop} stopOpacity={isDark ? 0.65 : 0.85} />
              <stop offset="100%" stopColor={skyBottom} stopOpacity={isDark ? 0.35 : 0.95} />
            </linearGradient>
            <linearGradient id="habGround" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isHot ? '#d97706' : isCold ? '#64748b' : '#65a30d'} />
              <stop offset="100%" stopColor={isHot ? '#92400e' : isCold ? '#334155' : '#3f6212'} />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width="560" height="170" fill="url(#habSky)" />

          <g style={{ transition: 'all 0.3s ease' }}>
            <circle
              cx="65"
              cy="40"
              r={sunRadius + 8}
              fill={isHot ? '#ef4444' : '#fde047'}
              opacity="0.28"
            />
            <circle
              cx="65"
              cy="40"
              r={sunRadius}
              fill={isHot ? '#f97316' : isCold ? '#e0f2fe' : '#facc15'}
            />
            <text
              x="65"
              y="44"
              textAnchor="middle"
              fontSize="9"
              fontWeight="800"
              fill={isCold ? '#0369a1' : '#7c2d12'}
            >
              {te.toFixed(0)}°C
            </text>
          </g>

          <path
            d="M 0 122 L 85 78 L 160 112 L 250 68 L 350 115 L 445 72 L 560 118 L 560 170 L 0 170 Z"
            fill={isDark ? '#1e293b' : '#475569'}
            opacity="0.32"
          />

          <path d="M 0 120 Q 140 108, 280 120 T 560 116 L 560 170 L 0 170 Z" fill="url(#habGround)" />

          {refuge > 0.08 && (
            <g opacity={Math.min(1, 0.3 + refuge * 0.8)}>
              <ellipse
                cx="145"
                cy="128"
                rx={20 + refuge * 24}
                ry={10 + refuge * 12}
                fill="#475569"
              />
              <ellipse
                cx="165"
                cy="132"
                rx={14 + refuge * 18}
                ry={8 + refuge * 9}
                fill="#64748b"
              />
              <circle cx="110" cy="122" r={10 + refuge * 16} fill="#15803d" />
              <circle cx="128" cy="118" r={8 + refuge * 14} fill="#16a34a" />
            </g>
          )}

          {refuge > 0.45 && (
            <g opacity={Math.min(1, (refuge - 0.3) * 1.4)}>
              <circle cx="435" cy="120" r={10 + refuge * 15} fill="#15803d" />
              <circle cx="458" cy="124" r={9 + refuge * 13} fill="#22c55e" />
              <ellipse cx="410" cy="133" rx={18 + refuge * 14} ry={9 + refuge * 7} fill="#475569" />
            </g>
          )}

          {predator > 0.05 && (
            <g
              transform={`translate(390, ${hawkY}) scale(${hawkScale})`}
              opacity={Math.min(1, 0.25 + predator * 0.85)}
              style={{ transition: 'all 0.35s ease' }}
            >
              <circle
                cx="0"
                cy="0"
                r={18 + predator * 14}
                fill="#f43f5e"
                opacity={predator * 0.22}
              />
              <path
                d="M -28 4 Q -14 -14, 0 -2 Q 14 -14, 28 4 Q 14 -4, 0 4 Q -14 -4, -28 4 Z"
                fill="#0f172a"
              />
              <circle cx="0" cy="-2" r="3" fill="#f43f5e" />
            </g>
          )}

          {lofScore >= 0.65 && (
            <ellipse
              cx="275"
              cy="132"
              rx="48"
              ry="14"
              fill="none"
              stroke="#f43f5e"
              strokeWidth="2.5"
              strokeDasharray="5 4"
            />
          )}

          <g transform="translate(275, 130)">
            <ellipse cx="0" cy="9" rx="34" ry="5" fill="#000000" opacity="0.25" />
            <path
              d="M -22 2 C -38 4, -48 -4, -56 -1"
              fill="none"
              stroke={lizardColor}
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            <ellipse cx="-2" cy="0" rx="22" ry="7.5" fill={lizardColor} />
            <ellipse cx="22" cy="-2" rx="9" ry="6" fill={lizardColor} />
            <circle cx="25" cy="-3.5" r="1.8" fill="#0f172a" />
            <circle cx="25.6" cy="-4" r="0.6" fill="#ffffff" />
            <path
              d="M -12 5 L -17 12 M 10 5 L 15 12 M -8 -4 L -12 -10 M 11 -4 L 15 -9"
              stroke={lizardColor}
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            {isCold && (
              <path
                d="M -18 -14 Q -15 -18, -12 -14 M 4 -15 Q 7 -19, 10 -15"
                fill="none"
                stroke="#e0f2fe"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
            {isHot && (
              <path
                d="M -10 -14 Q -13 -19, -10 -24 M 4 -14 Q 1 -19, 4 -24 M 18 -14 Q 15 -19, 18 -24"
                fill="none"
                stroke="#fef08a"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </g>

          <text
            x="14"
            y="160"
            fontSize="10"
            fontWeight="700"
            fill="#ffffff"
            opacity="0.92"
          >
            {species} • Habitat {te.toFixed(1)}°C vs. Pref {tPref.toFixed(1)}°C • Refuge:{' '}
            {Math.round(refuge * 100)}% • Predator: {Math.round(predator * 100)}%
          </text>
        </svg>
      </div>
    </div>
  );
}

function LOFGaugeMeter({
  score,
  status,
  isDark,
}: {
  score: number;
  status: RiskStatus;
  isDark: boolean;
}) {
  const cx = 160;
  const cy = 145;
  const r = 108;

  const polarPoint = (val: number, radius = r) => {
    const angle = Math.PI * (1 - val);
    return {
      x: cx + radius * Math.cos(angle),
      y: cy - radius * Math.sin(angle),
    };
  };

  const arcPath = (startVal: number, endVal: number, radius = r) => {
    const start = polarPoint(startVal, radius);
    const end = polarPoint(endVal, radius);
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  };

  const ticks = [0, 0.25, 0.5, 0.75, 1.0];
  const needleRotation = -90 + score * 180;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
      <div className="w-full max-w-[290px] shrink-0">
        <svg viewBox="0 0 320 175" className="w-full h-auto overflow-visible">
          <path
            d={arcPath(0, 1)}
            fill="none"
            stroke={isDark ? '#1e293b' : '#e2e8f0'}
            strokeWidth="22"
            strokeLinecap="round"
          />
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

function IsometricLandscape({
  gridMap,
  isDark,
}: {
  gridMap: Map<string, GridEntry>;
  isDark: boolean;
}) {
  const [hoveredCell, setHoveredCell] = useState<{
    x: number;
    y: number;
    entry?: GridEntry;
  } | null>(null);

  const tw = 22;
  const th = 11;
  const ox = 260;
  const oy = 115;
  const maxH = 88;

  const cells: Array<{
    gx: number;
    gy: number;
    x: number;
    y: number;
    entry?: GridEntry;
  }> = [];
  for (let gx = 0; gx < 10; gx++) {
    for (let gy = 0; gy < 10; gy++) {
      const x = gx + 1;
      const y = 10 - gy;
      const entry = gridMap.get(`${x},${y}`);
      cells.push({ gx, gy, x, y, entry });
    }
  }

  return (
    <div className="relative w-full">
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

      <div
        className={`rounded-xl border p-2 overflow-hidden ${
          isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50/80 border-slate-200'
        }`}
      >
        <svg viewBox="0 0 520 355" className="w-full h-auto select-none">
          <text
            x="85"
            y="285"
            fontSize="11"
            fontWeight="700"
            fill="#64748b"
            transform="rotate(26, 85, 285)"
          >
            Y-AXIS (10 → 1)
          </text>
          <text
            x="385"
            y="305"
            fontSize="11"
            fontWeight="700"
            fill="#64748b"
            transform="rotate(-26, 385, 305)"
          >
            X-AXIS (1 → 10)
          </text>

          {cells.map(({ gx, gy, x, y, entry }) => {
            const bx = ox + (gx - gy) * tw;
            const by = oy + (gx + gy) * th;
            const hasData = Boolean(entry);
            const score = entry ? entry.score : 0;
            const h = hasData ? Math.max(10, score * maxH) : 3;
            const isHovered = hoveredCell && hoveredCell.x === x && hoveredCell.y === y;

            const topColor = entry
              ? entry.status.topColor
              : isDark
              ? '#1e293b'
              : '#e2e8f0';
            const leftColor = entry
              ? entry.status.leftColor
              : isDark
              ? '#0f172a'
              : '#cbd5e1';
            const rightColor = entry
              ? entry.status.rightColor
              : isDark
              ? '#020617'
              : '#94a3b8';

            const tTop = `${bx},${by - th - h}`;
            const tRight = `${bx + tw},${by - h}`;
            const tBottom = `${bx},${by + th - h}`;
            const tLeft = `${bx - tw},${by - h}`;

            const bRight = `${bx + tw},${by}`;
            const bBottom = `${bx},${by + th}`;
            const bLeft = `${bx - tw},${by}`;

            return (
              <g
                key={`${x},${y}`}
                onMouseEnter={() => setHoveredCell({ x, y, entry })}
                onMouseLeave={() => setHoveredCell(null)}
                className="cursor-pointer"
                style={{ opacity: hoveredCell && !isHovered && hasData ? 0.85 : 1 }}
              >
                <polygon
                  points={`${tLeft} ${tBottom} ${bBottom} ${bLeft}`}
                  fill={leftColor}
                  stroke={isHovered ? '#ffffff' : isDark ? '#0f172a' : '#ffffff'}
                  strokeWidth={isHovered ? 1.5 : 0.6}
                />
                <polygon
                  points={`${tRight} ${tBottom} ${bBottom} ${bRight}`}
                  fill={rightColor}
                  stroke={isHovered ? '#ffffff' : isDark ? '#0f172a' : '#ffffff'}
                  strokeWidth={isHovered ? 1.5 : 0.6}
                />
                <polygon
                  points={`${tTop} ${tRight} ${tBottom} ${tLeft}`}
                  fill={topColor}
                  stroke={isHovered ? '#ffffff' : isDark ? '#0f172a' : '#ffffff'}
                  strokeWidth={isHovered ? 1.8 : 0.6}
                />
                {hasData && (
                  <text
                    x={bx}
                    y={by - h + 3}
                    textAnchor="middle"
                    fontSize="8.5"
                    fontWeight="800"
                    fill="#ffffff"
                    style={{ pointerEvents: 'none' }}
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
  const [isDark, setIsDark] = useState(false);

  // Default initialized to Profile A (Sceloporus cowlesi) & validated Multiplicative model
  const [species, setSpecies] = useState('Sceloporus cowlesi');
  const [tPref, setTPref] = useState(34.9);
  const [ctMin, setCtMin] = useState(7.5);
  const [ctMax, setCtMax] = useState(42.1);
  const [vulnerability, setVulnerability] = useState(0.7);
  const [model, setModel] = useState<ModelType>('multiplicative');
  const [beta, setBeta] = useState(3.0);
  const [activeTab, setActiveTab] = useState<'calculator' | 'mapping'>('calculator');
  const [showDocs, setShowDocs] = useState(false);

  // All-in-one Field Converter Modal state
  const [converterOpen, setConverterOpen] = useState(false);
  const [converterTab, setConverterTab] = useState<ConverterTab>('refuge');

  const openConverter = (tab: ConverterTab) => {
    setConverterTab(tab);
    setConverterOpen(true);
  };

  // Point Calculator state
  const [te, setTe] = useState(30.0);
  const [refuge, setRefuge] = useState(0.4);
  const [predator, setPredator] = useState(0.3);

  // Field Data & Mapping state
  const [observations, setObservations] = useState<Observation[]>(DEFAULT_OBSERVATIONS);
  const [spatialView, setSpatialView] = useState<'3d' | '2d'>('3d');
  const [newX, setNewX] = useState('1');
  const [newY, setNewY] = useState('1');
  const [newTe, setNewTe] = useState('34.5');
  const [newRefuge, setNewRefuge] = useState('0.5');
  const [newPredator, setNewPredator] = useState('0.5');
  const [importMessage, setImportMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyPreset = (preset: SpeciesPreset) => {
    setSpecies(preset.scientific);
    setTPref(preset.tPref);
    setCtMin(preset.ctMin);
    setCtMax(preset.ctMax);
    setVulnerability(preset.vulnerability);
  };

  const currentLOF = useMemo(
    () => calculateLOF(te, refuge, predator, tPref, ctMin, ctMax, vulnerability, model, beta),
    [te, refuge, predator, tPref, ctMin, ctMax, vulnerability, model, beta]
  );
  const currentStatus = getRiskStatus(currentLOF, isDark);
  const currentPerformancePct = Math.round(
    calculatePerformance(te, tPref, ctMin, ctMax) * 100
  );

  const mountainData = useMemo(() => {
    const start = Math.max(0, Math.floor(ctMin - 5));
    const end = Math.min(60, Math.ceil(ctMax + 5));
    const points = [];
    for (let temp = start; temp <= end; temp += 1) {
      points.push({
        temp,
        performance: Math.round(calculatePerformance(temp, tPref, ctMin, ctMax) * 100),
        additiveRisk: Math.round(
          calculateLOF(temp, refuge, predator, tPref, ctMin, ctMax, vulnerability, 'additive', beta) *
            100
        ),
        multiplicativeRisk: Math.round(
          calculateLOF(
            temp,
            refuge,
            predator,
            tPref,
            ctMin,
            ctMax,
            vulnerability,
            'multiplicative',
            beta
          ) * 100
        ),
      });
    }
    return points;
  }, [tPref, ctMin, ctMax, refuge, predator, vulnerability, beta]);

  const handleAddObservation = (e: React.FormEvent) => {
    e.preventDefault();
    const x = Math.max(1, Math.min(10, Math.round(Number(newX) || 1)));
    const y = Math.max(1, Math.min(10, Math.round(Number(newY) || 1)));
    const teVal = Number(newTe) || 25;
    const refVal = Math.max(0, Math.min(1, Number(newRefuge) || 0));
    const predVal = Math.max(0, Math.min(1, Number(newPredator) || 0));

    setObservations((prev) => [
      { id: Date.now().toString(), x, y, te: teVal, refuge: refVal, predator: predVal },
      ...prev.filter((o) => !(o.x === x && o.y === y)),
    ]);
    setImportMessage('');
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

        const rawRows: Array<{
          rawX: number;
          rawY: number;
          te: number;
          refuge: number;
          predator: number;
        }> = [];

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => Number(c.trim()));
          if (cols.length >= 3 && !cols.slice(0, 3).some(isNaN)) {
            rawRows.push({
              rawX: cols[0],
              rawY: cols[1],
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

        if (rawRows.length > 0) {
          const xs = rawRows.map((r) => r.rawX);
          const ys = rawRows.map((r) => r.rawY);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);

          const needsScaling = minX < 1 || maxX > 10 || minY < 1 || maxY > 10;
          const scaleToGrid = (val: number, min: number, max: number) =>
            max === min ? 5 : Math.round(1 + ((val - min) / (max - min)) * 9);

          const parsed: Observation[] = rawRows.map((r, i) => ({
            id: `${Date.now()}-${i}`,
            x: needsScaling ? scaleToGrid(r.rawX, minX, maxX) : Math.round(r.rawX),
            y: needsScaling ? scaleToGrid(r.rawY, minY, maxY) : Math.round(r.rawY),
            rawX: r.rawX,
            rawY: r.rawY,
            te: r.te,
            refuge: r.refuge,
            predator: r.predator,
          }));

          setObservations(parsed);
          setImportMessage(
            `Imported ${parsed.length} observations from ${file.name}${
              needsScaling
                ? ' (coordinates auto-scaled to 10×10 display grid; raw values preserved on export).'
                : '.'
            }`
          );
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

  const handleDownloadSampleCSV = () => {
    const sample =
      'x,y,te,refuge,predator\n' +
      '2,2,34.0,0.95,0.05\n' +
      '3,5,28.5,0.60,0.40\n' +
      '5,5,41.0,0.20,0.70\n' +
      '7,8,25.0,0.30,0.85\n' +
      '9,9,35.5,0.10,0.90\n';
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sample_nichemapr_lof_input.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const header =
      'X,Y,Te_C,Refuge,Predator,Species,Model,Beta,T_pref,CT_min,CT_max,Vulnerability,LOF_Score\n';
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
          model,
          beta
        ).toFixed(3);
        const outX = obs.rawX ?? obs.x;
        const outY = obs.rawY ?? obs.y;
        return `${outX},${outY},${obs.te},${obs.refuge},${obs.predator},"${species}",${model},${beta},${tPref},${ctMin},${ctMax},${vulnerability},${score}`;
      })
      .join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ectotherm_lof_${model}_beta${beta}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const gridMap = useMemo(() => {
    const map = new Map<string, GridEntry>();
    observations.forEach((obs) => {
      const score = calculateLOF(
        obs.te,
        obs.refuge,
        obs.predator,
        tPref,
        ctMin,
        ctMax,
        vulnerability,
        model,
        beta
      );
      map.set(`${obs.x},${obs.y}`, {
        obs,
        score,
        status: getRiskStatus(score, isDark),
      });
    });
    return map;
  }, [observations, tPref, ctMin, ctMax, vulnerability, model, beta, isDark]);

  const cardClass = isDark
    ? 'bg-slate-900/75 border-slate-800 shadow-xl'
    : 'bg-white border-slate-200/90 shadow-sm';
  const inputClass = isDark
    ? 'bg-slate-950 border-slate-700 text-white focus:border-cyan-400'
    : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-teal-600';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-500';
  const headingText = isDark ? 'text-white' : 'text-slate-900';

  const helperChip = `inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer ${
    isDark
      ? 'bg-slate-800/80 border-slate-700 text-cyan-300 hover:border-cyan-400'
      : 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100'
  }`;

  return (
    <div
      className={`min-h-screen transition-colors duration-300 p-4 md:p-8 font-sans ${
        isDark ? 'bg-[#020617] text-slate-100' : 'bg-slate-50 text-slate-800'
      }`}
    >
      {/* All-in-One Field Converter Modal */}
      <FieldConverterModal
        isOpen={converterOpen}
        activeTab={converterTab}
        onTabChange={setConverterTab}
        onClose={() => setConverterOpen(false)}
        isDark={isDark}
        onApplyRefuge={(val) => {
          setRefuge(val);
          setNewRefuge(String(val));
        }}
        onApplyPredator={(val) => {
          setPredator(val);
          setNewPredator(String(val));
        }}
        onApplyVulnerability={(val) => setVulnerability(val)}
        onApplyTe={(val) => {
          setTe(val);
          setNewTe(String(val));
        }}
      />

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header with Custom LOF Logo, Field Converters Button & Theme Toggle */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <LOFLogo />
            <div className="space-y-0.5">
              <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${headingText}`}>
                Ectotherm Risk Landscape (LOF)
              </h1>
              <p className={`text-xs md:text-sm font-medium ${mutedText}`}>
                A Trait-Integrated Spatial Framework for Mapping Multi-Dimensional Fear and Physiological Trade-Offs in Herpetofauna.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => openConverter('refuge')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-sm transition cursor-pointer"
            >
              <Compass className="w-4 h-4" />
              Field Converters
            </button>

            <button
              type="button"
              onClick={() => setIsDark((prev) => !prev)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-amber-300 hover:bg-slate-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-sm'
              }`}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {isDark ? 'Light' : 'Dark'}
            </button>
          </div>
        </header>

        {/* Global Top Control Bar */}
        <section className={`border rounded-2xl p-5 space-y-5 ${cardClass}`}>
          {/* Quick Species Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[11px] font-bold uppercase tracking-wider mr-1 ${mutedText}`}>
              Quick Species:
            </span>
            {SPECIES_PRESETS.map((preset) => {
              const active = species === preset.scientific;
              return (
                <button
                  key={preset.scientific}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition cursor-pointer ${
                    active
                      ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                      : isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-300 hover:border-teal-500'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:border-teal-500'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

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
                min={5}
                max={50}
                step={0.5}
                value={tPref}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setTPref(val);
                  if (val <= ctMin + 2) setCtMin(Math.max(0, val - 2));
                  if (val >= ctMax - 2) setCtMax(Math.min(55, val + 2));
                }}
                className="w-full accent-teal-500 cursor-pointer"
              />
            </div>

            <div className="md:col-span-3 space-y-1.5">
              <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider gap-1">
                <span className={mutedText}>Vulnerability (F)</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openConverter('vulnerability')}
                    className={helperChip}
                    title="Derive F from ReptTraits rubric"
                  >
                    <HelpCircle className="w-3 h-3" />
                    Derive
                  </button>
                  <span className={isDark ? 'text-purple-400' : 'text-purple-600'}>
                    {vulnerability.toFixed(2)}
                  </span>
                </div>
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
              <div
                className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${mutedText}`}
              >
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

          {/* Row 2: Fixed-Scale Critical Thermal Limits + Interactive Beta Sensitivity Slider */}
          <div
            className={`pt-4 border-t grid grid-cols-1 md:grid-cols-12 gap-6 ${
              isDark ? 'border-slate-800/80' : 'border-slate-200'
            }`}
          >
            <div className="md:col-span-4 space-y-1.5">
              <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                <span className={mutedText}>Critical Thermal Min (CT_min)</span>
                <span className={isDark ? 'text-sky-400' : 'text-sky-600'}>
                  {ctMin.toFixed(1)}°C
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={55}
                step={0.5}
                value={ctMin}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setCtMin(Math.min(val, tPref - 2));
                }}
                className="w-full accent-sky-500 cursor-pointer"
              />
            </div>

            <div className="md:col-span-4 space-y-1.5">
              <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                <span className={mutedText}>Critical Thermal Max (CT_max)</span>
                <span className={isDark ? 'text-rose-400' : 'text-rose-600'}>
                  {ctMax.toFixed(1)}°C
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={55}
                step={0.5}
                value={ctMax}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setCtMax(Math.max(val, tPref + 2));
                }}
                className="w-full accent-rose-500 cursor-pointer"
              />
            </div>

            <div className="md:col-span-4 space-y-1.5">
              <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                <span className={mutedText}>Thermal Sensitivity (β)</span>
                <span
                  className={
                    model === 'multiplicative'
                      ? 'text-rose-500'
                      : isDark
                      ? 'text-slate-400'
                      : 'text-slate-500'
                  }
                >
                  β = {beta.toFixed(1)} {beta === 3.0 ? '(Default)' : ''}
                </span>
              </div>
              <input
                type="range"
                min={1.0}
                max={5.0}
                step={0.5}
                value={beta}
                onChange={(e) => setBeta(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
                title="Adjust exponential thermal gating constant β (Section 3.3 sensitivity analysis)"
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
          <div className="space-y-6">
            <HabitatVisualizer
              te={te}
              tPref={tPref}
              ctMin={ctMin}
              ctMax={ctMax}
              refuge={refuge}
              predator={predator}
              lofScore={currentLOF}
              species={species}
              isDark={isDark}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Microhabitat Variables */}
              <div className={`lg:col-span-4 border rounded-2xl p-6 space-y-6 ${cardClass}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className={`flex items-center gap-2 text-base font-bold ${headingText}`}>
                    <Sliders className="w-4 h-4 text-teal-500" />
                    Microhabitat Variables
                  </div>
                </div>

                {/* Operative Temp */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm gap-1">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Thermometer className="w-4 h-4 text-orange-500" />
                      Operative Temp (Te)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openConverter('te')}
                        className={helperChip}
                        title="Estimate Te from air temp + sun exposure"
                      >
                        <HelpCircle className="w-3 h-3" />
                        Estimate
                      </button>
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold text-xs ${
                          isDark ? 'bg-orange-950/60 text-orange-400' : 'bg-orange-100 text-orange-700'
                        }`}
                      >
                        {te.toFixed(1)}°C
                      </span>
                    </div>
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
                  <div className="flex justify-between items-center text-sm gap-1">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Leaf className="w-4 h-4 text-emerald-500" />
                      Refuge Availability
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openConverter('refuge')}
                        className={helperChip}
                        title="Convert quadrat % cover or shelter distance"
                      >
                        <HelpCircle className="w-3 h-3" />
                        Convert
                      </button>
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold text-xs ${
                          isDark
                            ? 'bg-emerald-950/60 text-emerald-400'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {refuge.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
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
                  <div className="flex justify-between items-center text-sm gap-1">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <ShieldAlert className="w-4 h-4 text-rose-500" />
                      Predator Probability
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openConverter('predator')}
                        className={helperChip}
                        title="Convert clay model assays, point counts, or occupancy"
                      >
                        <HelpCircle className="w-3 h-3" />
                        Convert
                      </button>
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold text-xs ${
                          isDark ? 'bg-rose-950/60 text-rose-400' : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {predator.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={predator}
                    onChange={(e) => setPredator(Number(e.target.value))}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                </div>

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
                <div className={`border rounded-2xl p-6 ${cardClass}`}>
                  <LOFGaugeMeter score={currentLOF} status={currentStatus} isDark={isDark} />
                </div>

                <div className={`border rounded-2xl p-6 space-y-4 ${cardClass}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div
                      className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${headingText}`}
                    >
                      <Activity className="w-4 h-4 text-teal-500" />
                      Thermal Performance vs. Risk Landscape Curves
                    </div>
                    <span className={`text-xs font-semibold ${mutedText}`}>
                      β = {beta.toFixed(1)} Thermal Gating Comparison (%)
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
                          formatter={(value, name) => [`${value}%`, String(name)]}
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
          </div>
        )}

        {/* TAB 2: FIELD DATA & MAPPING */}
        {activeTab === 'mapping' && (
          <div className="space-y-6">
            <div className={`border rounded-2xl p-6 space-y-5 ${cardClass}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${headingText}`}
                >
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
                    onClick={() => openConverter('refuge')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      isDark
                        ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                    }`}
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    How to Measure Inputs?
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      isDark
                        ? 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border-slate-700'
                        : 'bg-teal-50 hover:bg-teal-100 text-teal-800 border-teal-200'
                    }`}
                    title="CSV columns: x, y, te, refuge, predator (arbitrary coordinates auto-scale to 10×10 grid)"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Import CSV (NicheMapR / Field)
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadSampleCSV}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      isDark
                        ? 'bg-slate-800 hover:bg-slate-700 text-sky-300 border-slate-700'
                        : 'bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-200'
                    }`}
                    title="Download a ready-to-use CSV template"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Sample CSV
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
                    step={0.01}
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
                    step={0.01}
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

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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

                  <div
                    className={`flex p-1 rounded-xl border ${
                      isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSpatialView('3d')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        spatialView === '3d' ? 'bg-teal-600 text-white shadow-sm' : mutedText
                      }`}
                    >
                      <Mountain className="w-3.5 h-3.5" />
                      3D Landscape
                    </button>
                    <button
                      type="button"
                      onClick={() => setSpatialView('2d')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        spatialView === '2d' ? 'bg-teal-600 text-white shadow-sm' : mutedText
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

              <div className={`lg:col-span-5 border rounded-2xl p-6 space-y-4 ${cardClass}`}>
                <h2
                  className={`text-sm font-bold uppercase tracking-wider text-center ${headingText}`}
                >
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
                          model,
                          beta
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

        {/* Collapsible Model Equations, Field Parameterisation & Citation Footer */}
        <footer className={`border rounded-2xl overflow-hidden ${cardClass}`}>
          <button
            type="button"
            onClick={() => setShowDocs((prev) => !prev)}
            className="w-full px-5 py-3.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            <span className={`flex items-center gap-2 ${headingText}`}>
              <BookOpen className="w-4 h-4 text-teal-500" />
              Model Equations, Field Parameterisation &amp; How to Cite
            </span>
            {showDocs ? (
              <ChevronUp className={`w-4 h-4 ${mutedText}`} />
            ) : (
              <ChevronDown className={`w-4 h-4 ${mutedText}`} />
            )}
          </button>

          {showDocs && (
            <div
              className={`px-5 pb-5 pt-3 border-t grid grid-cols-1 md:grid-cols-3 gap-5 text-xs leading-relaxed ${
                isDark ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-600'
              }`}
            >
              <div className="space-y-2">
                <div className={`font-bold uppercase tracking-wider ${headingText}`}>
                  Mathematical Formulations (Section 2.3)
                </div>
                <p>
                  <strong>Additive Heuristic:</strong>{' '}
                  <code className="font-mono">
                    LOF_add = 0.40·P + 0.20·R + 0.20·T + 0.20·F
                  </code>
                </p>
                <p>
                  <strong>Thermal-Gated Multiplicative:</strong>{' '}
                  <code className="font-mono">
                    LOF_mult = min(1, [0.50·P + 0.25·R + 0.25·F] × exp(β·T))
                  </code>
                </p>
                <p className={mutedText}>
                  Where <em>P</em> = predator probability, <em>R</em> = refuge scarcity (1 − refuge),{' '}
                  <em>T</em> = asymmetric normalized thermal mismatch (scaled to{' '}
                  <em>T_pref − CT_min</em> or <em>CT_max − T_pref</em>), <em>F</em> = functional
                  vulnerability, and <em>β</em> = thermal sensitivity constant (default 3.0).
                </p>
              </div>

              <div className="space-y-2">
                <div className={`font-bold uppercase tracking-wider ${headingText}`}>
                  Field Parameterisation ([0, 1] Inputs)
                </div>
                <p>
                  <strong>Refuge (R):</strong> Quadrat cover proportion (Cover% / 100) or inverse distance to shelter (1 − d/d_max).
                </p>
                <p>
                  <strong>Predator (P):</strong> Clay/3D model attack rate (Attacked / Deployed), scaled site counts (C_j / C_max), or occupancy probability (ψ).
                </p>
                <p className={mutedText}>
                  Use the built-in <strong>Field Converters</strong> button above to compute any input directly from raw ecological data.
                </p>
              </div>

              <div className="space-y-2">
                <div className={`font-bold uppercase tracking-wider ${headingText}`}>
                  Biophysical Integration &amp; Citation
                </div>
                <p>
                  Spatial operative temperature (<em>T_e</em>) layers from{' '}
                  <strong>NicheMapR</strong> (Kearney &amp; Porter 2017) or GPS field surveys can be imported via CSV in the <em>Field Data &amp; Mapping</em> tab.
                </p>
                <p className={`italic ${mutedText}`}>
                  Suggested Citation: Anbazhagan, A. (2026). Ectotherm Risk Landscape (LOF): A
                  Trait-Integrated Spatial Framework for Mapping Multi-Dimensional Fear and
                  Physiological Trade-Offs in Herpetofauna. Interactive Web Application.
                </p>
              </div>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
