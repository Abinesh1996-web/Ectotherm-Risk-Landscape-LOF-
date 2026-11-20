// @ts-nocheck
import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  Settings2,
  Map,
  Calculator,
  Activity,
  Thermometer,
  ShieldAlert,
  Leaf,
} from 'lucide-react';

export default function LOFCalculator() {
  // Global State
  const [activeTab, setActiveTab] = useState('calculator');
  const [modelType, setModelType] = useState('additive');

  // Species Parameters
  const [speciesName, setSpeciesName] = useState('Sceloporus occidentalis');
  const [tPref, setTPref] = useState(34.5);
  const [vulnScore, setVulnScore] = useState(0.7);

  // Tab 1: Point Calculator State
  const [te, setTe] = useState(30);
  const [refuge, setRefuge] = useState(0.4);
  const [predator, setPredator] = useState(0.3);

  // Tab 2: Field Data State
  const [fieldData, setFieldData] = useState([
    { id: 1, x: 2, y: 3, Te: 29, Refuge: 0.8, Predator: 0.2 },
    { id: 2, x: 5, y: 5, Te: 41, Refuge: 0.2, Predator: 0.6 },
    { id: 3, x: 8, y: 2, Te: 34, Refuge: 0.9, Predator: 0.1 },
    { id: 4, x: 4, y: 8, Te: 22, Refuge: 0.5, Predator: 0.8 },
    { id: 5, x: 9, y: 9, Te: 35, Refuge: 0.1, Predator: 0.9 },
    { id: 6, x: 2, y: 8, Te: 34.5, Refuge: 1.0, Predator: 0.0 },
  ]);

  const [newObs, setNewObs] = useState({
    x: 1,
    y: 1,
    Te: 34.5,
    Refuge: 0.5,
    Predator: 0.5,
  });

  // --- CORE MATHEMATICS ---
  const calculateLOF = (t_e, ref, pred, t_pref, vuln, type) => {
    const t_mismatch = Math.min(Math.abs(t_e - t_pref) / 10, 1);
    const r_scarcity = 1 - ref;

    if (type === 'additive') {
      return 0.4 * pred + 0.2 * r_scarcity + 0.2 * t_mismatch + 0.2 * vuln;
    } else {
      // Multiplicative (Thermal-Gated)
      const baseRisk = 0.5 * pred + 0.25 * r_scarcity + 0.25 * vuln;
      const thermalMultiplier = Math.exp(3 * t_mismatch);
      return Math.min(1, baseRisk * thermalMultiplier);
    }
  };

  const currentLOF = calculateLOF(
    te,
    refuge,
    predator,
    tPref,
    vulnScore,
    modelType
  );

  // --- CHART DATA (TPC) ---
  const tpcData = useMemo(() => {
    const data = [];
    for (let i = 15; i <= 45; i++) {
      const performance = Math.max(0, 1 - Math.abs(i - tPref) / 10) * 100;
      data.push({ temp: i, performance: performance.toFixed(1) });
    }
    return data;
  }, [tPref]);

  // --- HEATMAP GENERATION ---
  const processedFieldData = fieldData.map((d) => ({
    ...d,
    LOF: calculateLOF(
      d.Te,
      d.Refuge,
      d.Predator,
      tPref,
      vulnScore,
      modelType
    ).toFixed(3),
  }));

  const heatmapGrid = useMemo(() => {
    const grid = [];
    // Y goes from 10 down to 1 so (1,1) is bottom-left
    for (let y = 10; y >= 1; y--) {
      const row = [];
      for (let x = 1; x <= 10; x++) {
        const point = processedFieldData.find((d) => d.x === x && d.y === y);
        row.push(point ? Number(point.LOF) : null);
      }
      grid.push(row);
    }
    return grid;
  }, [processedFieldData]);

  // --- UTILS ---
  const getRiskLevel = (score) => {
    if (score < 0.3)
      return {
        text: 'Low Risk (Safe Foraging)',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500',
      };
    if (score < 0.6)
      return {
        text: 'Moderate Risk (Vigilance Required)',
        color: 'text-amber-400',
        bg: 'bg-amber-500',
      };
    return {
      text: 'High Risk (Lethal Exposure)',
      color: 'text-rose-500',
      bg: 'bg-rose-600',
    };
  };

  const getHeatmapColor = (val) => {
    if (val === null) return 'bg-slate-900'; // empty cell
    if (val < 0.3) return 'bg-emerald-500';
    if (val < 0.6) return 'bg-amber-500';
    return 'bg-rose-600';
  };

  const handleAddObservation = () => {
    const obs = {
      id: Date.now(),
      x: Number(newObs.x),
      y: Number(newObs.y),
      Te: Number(newObs.Te),
      Refuge: Number(newObs.Refuge),
      Predator: Number(newObs.Predator),
    };
    // Replace if same coordinates exist, else append
    const filtered = fieldData.filter((d) => !(d.x === obs.x && d.y === obs.y));
    setFieldData([...filtered, obs]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans p-4 md:p-8 selection:bg-cyan-900">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* HEADER */}
        <header className="border-b border-slate-800 pb-6">
          <h1 className="text-4xl font-black text-white flex items-center gap-3 tracking-tight">
            <Activity className="text-cyan-500 w-10 h-10" />
            Ectotherm Risk Landscape (LOF)
          </h1>
          <p className="text-slate-400 mt-2 text-sm font-medium uppercase tracking-widest max-w-3xl">
            A trait-integrated spatial framework for mapping multi-dimensional
            fear and physiological trade-offs in herpetofauna.
          </p>
        </header>

        {/* GLOBAL PARAMETERS & MODEL TOGGLE */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-2xl flex flex-col xl:flex-row gap-6">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Study Species
              </label>
              <input
                type="text"
                value={speciesName}
                onChange={(e) => setSpeciesName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-medium focus:border-cyan-500 outline-none transition"
              />
            </div>
            <div>
              <label className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                <span>Preferred Temp (T_pref)</span>
                <span className="text-cyan-400">{tPref}°C</span>
              </label>
              <input
                type="range"
                min="20"
                max="40"
                step="0.1"
                value={tPref}
                onChange={(e) => setTPref(Number(e.target.value))}
                className="w-full accent-cyan-500 mt-2"
              />
            </div>
            <div>
              <label className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                <span>Functional Vulnerability (F)</span>
                <span className="text-purple-400">{vulnScore}</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={vulnScore}
                onChange={(e) => setVulnScore(Number(e.target.value))}
                className="w-full accent-purple-500 mt-2"
              />
            </div>
          </div>

          <div className="w-full xl:w-72 bg-slate-950 p-4 rounded-lg border border-slate-800 flex flex-col justify-center">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Settings2 className="w-4 h-4" /> Model Framework
            </label>
            <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800 relative">
              <button
                onClick={() => setModelType('additive')}
                className={`flex-1 text-xs font-bold py-2 px-2 rounded-md z-10 transition-colors ${
                  modelType === 'additive'
                    ? 'text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Additive (Linear)
              </button>
              <button
                onClick={() => setModelType('multiplicative')}
                className={`flex-1 text-xs font-bold py-2 px-2 rounded-md z-10 transition-colors ${
                  modelType === 'multiplicative'
                    ? 'text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Multiplicative
              </button>
              <div
                className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-cyan-600 rounded-md transition-all duration-300 ease-in-out ${
                  modelType === 'additive' ? 'left-1' : 'left-[calc(50%+2px)]'
                }`}
              />
            </div>
          </div>
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex space-x-2 border-b border-slate-800 pb-px">
          <button
            onClick={() => setActiveTab('calculator')}
            className={`flex items-center gap-2 px-6 py-3 font-bold rounded-t-lg transition-all ${
              activeTab === 'calculator'
                ? 'bg-slate-900 text-cyan-400 border border-slate-800 border-b-slate-900'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50 border border-transparent'
            }`}
          >
            <Calculator className="w-4 h-4" /> Point Calculator
          </button>
          <button
            onClick={() => setActiveTab('data')}
            className={`flex items-center gap-2 px-6 py-3 font-bold rounded-t-lg transition-all ${
              activeTab === 'data'
                ? 'bg-slate-900 text-cyan-400 border border-slate-800 border-b-slate-900'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50 border border-transparent'
            }`}
          >
            <Map className="w-4 h-4" /> Field Data & Mapping
          </button>
        </div>

        {/* --- TAB 1: CALCULATOR --- */}
        {activeTab === 'calculator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Inputs */}
            <div className="lg:col-span-4 bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-xl space-y-8">
              <h2 className="text-white font-bold tracking-wide flex items-center gap-2 border-b border-slate-800 pb-3">
                <Settings2 className="w-5 h-5 text-slate-400" /> Microhabitat
                Variables
              </h2>

              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="flex justify-between text-sm font-bold text-slate-300">
                    <span className="flex items-center gap-2">
                      <Thermometer className="w-4 h-4 text-orange-500" />{' '}
                      Operative Temp (Te)
                    </span>
                    <span className="text-orange-400 font-mono bg-orange-500/10 px-2 py-0.5 rounded">
                      {te}°C
                    </span>
                  </label>
                  <input
                    type="range"
                    min="15"
                    max="45"
                    step="0.5"
                    value={te}
                    onChange={(e) => setTe(Number(e.target.value))}
                    className="w-full accent-orange-500"
                  />
                </div>

                <div className="space-y-3">
                  <label className="flex justify-between text-sm font-bold text-slate-300">
                    <span className="flex items-center gap-2">
                      <Leaf className="w-4 h-4 text-emerald-500" /> Refuge
                      Availability
                    </span>
                    <span className="text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded">
                      {refuge.toFixed(2)}
                    </span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={refuge}
                    onChange={(e) => setRefuge(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Calculated as Scarcity (1 - R) = {(1 - refuge).toFixed(2)}
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="flex justify-between text-sm font-bold text-slate-300">
                    <span className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-500" /> Predator
                      Probability
                    </span>
                    <span className="text-rose-400 font-mono bg-rose-500/10 px-2 py-0.5 rounded">
                      {predator.toFixed(2)}
                    </span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={predator}
                    onChange={(e) => setPredator(Number(e.target.value))}
                    className="w-full accent-rose-500"
                  />
                </div>
              </div>
            </div>

            {/* Outputs */}
            <div className="lg:col-span-8 space-y-6">
              {/* Big Score Display */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
                {/* Background Glow */}
                <div
                  className={`absolute top-0 right-0 w-64 h-64 blur-3xl opacity-10 rounded-full pointer-events-none translate-x-1/2 -translate-y-1/2 ${
                    getRiskLevel(currentLOF).bg
                  }`}
                />

                <div>
                  <h2 className="text-slate-400 font-bold uppercase tracking-widest text-sm mb-2">
                    Composite LOF Score
                  </h2>
                  <div className="flex items-baseline gap-4">
                    <div className="text-7xl font-black text-white tracking-tighter">
                      {currentLOF.toFixed(3)}
                    </div>
                  </div>
                </div>

                <div
                  className={`px-6 py-4 rounded-xl border border-white/10 shadow-2xl font-black text-xl tracking-wide uppercase ${
                    getRiskLevel(currentLOF).color
                  } bg-slate-950 backdrop-blur-md`}
                >
                  {getRiskLevel(currentLOF).text}
                </div>
              </div>

              {/* TPC Chart */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl h-80 flex flex-col">
                <h2 className="text-white font-bold flex items-center gap-2 mb-4 text-sm uppercase tracking-wider">
                  <Activity className="w-5 h-5 text-cyan-400" /> Thermal
                  Performance Curve
                </h2>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={tpcData}
                    margin={{ top: 10, right: 30, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#1e293b"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="temp"
                      stroke="#64748b"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      label={{
                        value: 'Operative Temperature (°C)',
                        position: 'insideBottom',
                        offset: -10,
                        fill: '#475569',
                        fontSize: 12,
                      }}
                    />
                    <YAxis
                      stroke="#64748b"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      domain={[0, 100]}
                      label={{
                        value: 'Performance %',
                        angle: -90,
                        position: 'insideLeft',
                        fill: '#475569',
                        fontSize: 12,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#020617',
                        borderColor: '#1e293b',
                        color: '#f8fafc',
                        borderRadius: '8px',
                      }}
                      itemStyle={{ color: '#22d3ee', fontWeight: 'bold' }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <ReferenceLine
                      x={te}
                      stroke="#f97316"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      label={{
                        value: 'Current Te',
                        fill: '#f97316',
                        position: 'top',
                        fontWeight: 'bold',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="performance"
                      stroke="#06b6d4"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{
                        r: 6,
                        fill: '#22d3ee',
                        stroke: '#020617',
                        strokeWidth: 2,
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB 2: FIELD DATA & MAPPING --- */}
        {activeTab === 'data' && (
          <div className="space-y-6">
            {/* Input Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
              <h2 className="text-white font-bold flex items-center gap-2 mb-6 border-b border-slate-800 pb-3 text-sm uppercase tracking-wider">
                <Map className="w-5 h-5 text-cyan-400" /> Add Field Observation
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-4 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    X (1-10)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newObs.x}
                    onChange={(e) =>
                      setNewObs({ ...newObs, x: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Y (1-10)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newObs.y}
                    onChange={(e) =>
                      setNewObs({ ...newObs, y: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Te (°C)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={newObs.Te}
                    onChange={(e) =>
                      setNewObs({ ...newObs, Te: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Refuge
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={newObs.Refuge}
                    onChange={(e) =>
                      setNewObs({ ...newObs, Refuge: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Predator
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={newObs.Predator}
                    onChange={(e) =>
                      setNewObs({ ...newObs, Predator: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono focus:border-cyan-500 outline-none"
                  />
                </div>
                <button
                  onClick={handleAddObservation}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold p-2.5 rounded-lg transition shadow-lg shadow-cyan-900/50 uppercase tracking-wider text-sm"
                >
                  Add Data
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Heatmap Map */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col items-center">
                <div className="w-full flex justify-between items-center mb-6">
                  <h2 className="text-white font-bold text-sm uppercase tracking-wider">
                    Spatial Heatmap (10x10)
                  </h2>
                  <div className="text-xs font-bold text-slate-500 uppercase flex gap-3">
                    <span className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-emerald-500 rounded-sm"></div>{' '}
                      Safe
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-amber-500 rounded-sm"></div>{' '}
                      Mod
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-rose-600 rounded-sm"></div>{' '}
                      Lethal
                    </span>
                  </div>
                </div>

                <div className="w-full max-w-[400px] aspect-square bg-slate-950 p-2 rounded-xl border border-slate-800 grid grid-cols-10 gap-1 shadow-inner relative">
                  {/* Grid Cells */}
                  {heatmapGrid.map((row, yIdx) =>
                    row.map((cellValue, xIdx) => (
                      <div
                        key={`${xIdx}-${yIdx}`}
                        className={`w-full h-full rounded-sm flex items-center justify-center text-[9px] font-mono font-bold transition-all duration-300 ease-out 
                          ${
                            cellValue
                              ? 'text-white/80 hover:scale-110 hover:z-10 shadow-sm cursor-crosshair'
                              : 'text-transparent hover:bg-slate-800 cursor-not-allowed'
                          } 
                          ${getHeatmapColor(cellValue)}`}
                        title={
                          cellValue
                            ? `Coordinate: X=${xIdx + 1}, Y=${
                                10 - yIdx
                              }\nLOF: ${cellValue.toFixed(3)}`
                            : 'No Data'
                        }
                      >
                        {cellValue ? cellValue.toFixed(1) : ''}
                      </div>
                    ))
                  )}
                </div>
                <p className="text-center text-slate-500 text-xs mt-4 max-w-sm">
                  Toggle the Model Framework above to observe how Thermal-Gating
                  overrides physical safety, transforming the landscape.
                </p>
              </div>

              {/* Data Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-800">
                  <h2 className="text-white font-bold text-sm uppercase tracking-wider">
                    Observation Dataset
                  </h2>
                </div>
                <div className="flex-1 overflow-auto max-h-[450px]">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase tracking-wider bg-slate-950/50 sticky top-0 backdrop-blur-sm">
                      <tr>
                        <th className="px-6 py-4 font-bold">X,Y</th>
                        <th className="px-6 py-4 font-bold">Te (°C)</th>
                        <th className="px-6 py-4 font-bold">Refuge</th>
                        <th className="px-6 py-4 font-bold">Pred</th>
                        <th className="px-6 py-4 font-black text-cyan-400">
                          LOF
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {processedFieldData
                        .slice()
                        .reverse()
                        .map((d) => (
                          <tr
                            key={d.id}
                            className="hover:bg-slate-800/30 transition-colors"
                          >
                            <td className="px-6 py-4 font-mono text-slate-400">
                              {d.x},{d.y}
                            </td>
                            <td className="px-6 py-4 font-mono text-orange-300">
                              {d.Te}
                            </td>
                            <td className="px-6 py-4 font-mono text-emerald-300">
                              {d.Refuge}
                            </td>
                            <td className="px-6 py-4 font-mono text-rose-300">
                              {d.Predator}
                            </td>
                            <td
                              className={`px-6 py-4 font-mono font-black ${
                                getRiskLevel(Number(d.LOF)).color
                              }`}
                            >
                              {d.LOF}
                            </td>
                          </tr>
                        ))}
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
