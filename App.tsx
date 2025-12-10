
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MapCanvas } from './components/MapCanvas';
import { ModelCanvas } from './components/ModelCanvas';
import { Sidebar } from './components/Sidebar';
import { Login } from './components/Login';
import { RegulatoryModal } from './components/RegulatoryModal';
import { ConfirmationModal, ConfirmType } from './components/ConfirmationModal';
import { SiteConfig, LatLng, GeneratedGeometry, ProjectStats, ToolMode, UserConstraint, SavedProject, ViewMode } from './types';
import { generateBuilding, geoToCartesian } from './services/generator';
import { Map as MapIcon, Box, PenTool, TreePine, MousePointer2, Layers, Palette, Edit2, RotateCcw, Route, Save, FolderOpen, Trash2, X, FilePlus, ChevronLeft, ChevronRight, BarChart3, Download, Hand, Pencil, Undo2, Menu, LayoutDashboard, DollarSign, PieChart, Calculator, Table2, MonitorOff, Sun, Moon, Globe, TrendingUp, ArrowUpRight, Percent, Briefcase, Ruler, AlertCircle, FileOutput } from 'lucide-react';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import * as turf from '@turf/turf';
import { point, lineString, featureCollection } from '@turf/helpers';

interface HistoryState {
  sitePoints: LatLng[];
  constraints: UserConstraint[];
  config: SiteConfig;
  customRoads: {p1: LatLng, p2: LatLng}[];
  overrides: Record<string, Feature<Polygon | MultiPolygon> | null>;
}

const generateId = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);

const generateLotAssets = (lot: Feature<Polygon | MultiPolygon>, index: number, config: SiteConfig) => {
    const frontSetbackM = 5.0; 
    const rearSetbackM = 2.0;
    const sideSetbackM = 0.6;
    const props = lot.properties || {};
    const isBottom = props.isBottomRow; 
    const angle = props.alignmentAngle || 0; 
    let building: Feature<Polygon | MultiPolygon> | null = null;
    let tree: any = null;

    try {
        const sideSetbackKm = sideSetbackM / 1000;
        const buffered = turf.buffer(lot, -sideSetbackKm, { units: 'kilometers' });
        if (buffered) {
            if (typeof isBottom === 'boolean') {
                 const relativeShiftAngle = isBottom ? 90 : -90;
                 const bearing = angle + relativeShiftAngle;
                 const shiftDistKm = (frontSetbackM - sideSetbackM) / 1000;
                 const shifted = turf.transformTranslate(buffered, shiftDistKm, bearing, { units: 'kilometers' });
                 const rearSetbackKm = rearSetbackM / 1000;
                 const rearLimitPoly = turf.buffer(lot, -rearSetbackKm, { units: 'kilometers' });
                 if (shifted && rearLimitPoly) {
                     const clipped = turf.intersect(featureCollection([shifted as Feature<Polygon>, rearLimitPoly as Feature<Polygon>]));
                     building = clipped ? (clipped as Feature<Polygon | MultiPolygon>) : shifted;
                 } else {
                     building = shifted as Feature<Polygon | MultiPolygon>;
                 }
            } else {
                const safeBuffer = turf.buffer(lot, -0.0015, { units: 'kilometers' }); 
                building = safeBuffer ? (safeBuffer as Feature<Polygon | MultiPolygon>) : buffered as Feature<Polygon | MultiPolygon>;
            }
        }
    } catch (e) {}

    if (!building) {
        try { building = turf.transformScale(lot, 0.6); } catch(e) {}
    }
    if (building) {
        building.properties = { lotId: index, heightFactor: 0.9 + (Math.random() * 0.2), colorVariant: Math.floor(Math.random() * 3) };
    }
    const center = turf.centroid(lot);
    tree = center;
    if (typeof isBottom === 'boolean') {
         const relativeFrontAngle = isBottom ? -90 : 90;
         const frontBearing = angle + relativeFrontAngle;
         const treeShift = 0.002; 
         try {
            const potentialTree = turf.transformTranslate(center, treeShift, frontBearing, { units: 'kilometers' });
            if (turf.booleanPointInPolygon(potentialTree, lot)) tree = potentialTree;
         } catch(e) {}
    }
    tree.properties = { lotId: index };
    return { building, tree };
};

const generateParkAssets = (park: Feature<Polygon | MultiPolygon>, index: number) => {
    const trees: any[] = [];
    const parkArea = turf.area(park);
    const density = 40; 
    const targetTreeCount = Math.max(3, Math.floor(parkArea / density));
    const maxTrees = 200; 
    const actualTarget = Math.min(targetTreeCount, maxTrees);
    const bbox = turf.bbox(park);
    let searchPoly = park;
    try {
        const buffered = turf.buffer(park, -0.002, { units: 'kilometers' });
        if (buffered) searchPoly = buffered as Feature<Polygon | MultiPolygon>;
    } catch(e) {}

    let attempts = 0;
    while (trees.length < actualTarget && attempts < actualTarget * 10) {
        attempts++;
        const lng = bbox[0] + Math.random() * (bbox[2] - bbox[0]);
        const lat = bbox[1] + Math.random() * (bbox[3] - bbox[1]);
        const pt = point([lng, lat]);
        if (turf.booleanPointInPolygon(pt, searchPoly)) {
             const isTooClose = trees.some(t => {
                 const tLat = t.geometry.coordinates[1];
                 const tLng = t.geometry.coordinates[0];
                 return Math.abs(tLat - lat) < 0.00004 && Math.abs(tLng - lng) < 0.00004;
             });
             if (!isTooClose) {
                 pt.properties = { type: 'park-tree', parkId: index };
                 trees.push(pt);
             }
        }
    }
    return trees;
};

const AnalyticsView: React.FC<{ stats: ProjectStats; config: SiteConfig; onBack?: () => void }> = ({ stats, config, onBack }) => {
    // Financial Assumptions State
    const [pricePerSqM, setPricePerSqM] = useState<number>(4500);
    const [landCostPerSqM, setLandCostPerSqM] = useState<number>(800);
    const [infraCostPerSqM, setInfraCostPerSqM] = useState<number>(1200); // Cost per m2 of roads/parks
    const [softCostsPct, setSoftCostsPct] = useState<number>(12); // % of hard costs

    // Calculations
    const revenue = stats.netSellableArea * pricePerSqM;
    
    // Cost Breakdown
    const landCostTotal = stats.siteArea * landCostPerSqM;
    const infraArea = stats.roadArea + stats.parkArea; // Area needing development but not sellable directly
    const infraCostTotal = infraArea * infraCostPerSqM;
    const hardCosts = landCostTotal + infraCostTotal;
    const softCosts = hardCosts * (softCostsPct / 100);
    const totalProjectCost = hardCosts + softCosts;
    
    const grossProfit = revenue - totalProjectCost;
    const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const roi = totalProjectCost > 0 ? (grossProfit / totalProjectCost) * 100 : 0;

    // Unit Simulation (Standard vs Premium based on size)
    const avgLotSize = stats.totalLots > 0 ? stats.netSellableArea / stats.totalLots : 0;
    const premiumCount = Math.floor(stats.totalLots * 0.3); // Simulate 30% premium
    const standardCount = stats.totalLots - premiumCount;

    const fmtCurrency = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    const fmtCompact = (n: number) => Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1, style: 'currency', currency: 'USD' }).format(n);
    const fmtPct = (n: number) => `${n.toFixed(1)}%`;

    return (
        <div className="w-full h-full bg-slate-100 overflow-hidden flex font-sans">
            
            {/* Left Control Panel (Assumptions) */}
            <div className="w-80 bg-white border-r border-slate-200 h-full flex flex-col z-20 shadow-xl overflow-y-auto custom-scrollbar">
                <div className="p-6 border-b border-slate-100">
                    <button onClick={onBack} className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-wider mb-6">
                        <ChevronLeft size={14} /> Volver al Editor
                    </button>
                    <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                        <Calculator size={20} className="text-blue-600" />
                        Financiero
                    </h2>
                    <p className="text-xs text-slate-500 mt-1 font-medium">Parámetros de inversión</p>
                </div>

                <div className="p-6 space-y-8">
                    {/* Revenue Inputs */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">Precio Venta Promedio</label>
                            <DollarSign size={14} className="text-emerald-500"/>
                        </div>
                        <div className="relative group">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm">$</span>
                            <input 
                                type="number" 
                                value={pricePerSqM} 
                                onChange={(e) => setPricePerSqM(Number(e.target.value))}
                                className="w-full pl-6 pr-12 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-right font-mono text-sm font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">/m²</span>
                        </div>
                    </div>

                    <div className="w-full h-px bg-slate-100"></div>

                    {/* Cost Inputs */}
                    <div className="space-y-5">
                        <div className="flex items-center gap-2 mb-2">
                            <Briefcase size={14} className="text-slate-400"/>
                            <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">Costos Directos</label>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500">Costo Tierra (Adquisición)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">$</span>
                                <input 
                                    type="number" 
                                    value={landCostPerSqM} 
                                    onChange={(e) => setLandCostPerSqM(Number(e.target.value))}
                                    className="w-full pl-6 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-lg text-right font-mono text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-bold">/m²</span>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500">Urbanización (Infraestructura)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">$</span>
                                <input 
                                    type="number" 
                                    value={infraCostPerSqM} 
                                    onChange={(e) => setInfraCostPerSqM(Number(e.target.value))}
                                    className="w-full pl-6 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-lg text-right font-mono text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-bold">/m²</span>
                            </div>
                            <p className="text-[9px] text-slate-400 mt-1">Aplica a áreas viales y parques.</p>
                        </div>
                    </div>

                    <div className="w-full h-px bg-slate-100"></div>

                    <div className="space-y-1.5">
                         <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Costos Indirectos (Soft)</label>
                            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{softCostsPct}%</span>
                        </div>
                        <input 
                            type="range" min="0" max="30" step="1" 
                            value={softCostsPct} 
                            onChange={(e) => setSoftCostsPct(Number(e.target.value))}
                            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <p className="text-[9px] text-slate-400">Licencias, permisos, marketing, admin.</p>
                    </div>
                </div>

                <div className="mt-auto p-6 bg-slate-50 border-t border-slate-200">
                     <button className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider">
                        <Download size={14}/> Exportar CSV
                     </button>
                </div>
            </div>

            {/* Main Content (Dashboard) */}
            <div className="flex-1 h-full overflow-y-auto custom-scrollbar p-6 md:p-10">
                <div className="max-w-6xl mx-auto">
                    
                    <div className="flex justify-between items-end mb-8">
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Resumen Ejecutivo</h1>
                            <p className="text-sm text-slate-500 font-medium">Análisis de viabilidad técnica y financiera.</p>
                        </div>
                        <div className="text-right hidden md:block">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Última actualización</p>
                            <p className="text-xs font-mono font-bold text-slate-700">{new Date().toLocaleTimeString()}</p>
                        </div>
                    </div>

                    {/* Top Level KPIs */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2"><TrendingUp size={12}/> Utilidad Neta</div>
                            <div className="text-2xl font-mono font-bold text-emerald-600">{fmtCompact(grossProfit)}</div>
                            <div className="text-[10px] font-medium text-slate-400 mt-1">Antes de impuestos</div>
                        </div>
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                             <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Percent size={12}/> Margen (Utilidad)</div>
                             <div className="flex items-baseline gap-2">
                                <div className={`text-2xl font-mono font-bold ${margin > 20 ? 'text-emerald-600' : 'text-amber-500'}`}>{fmtPct(margin)}</div>
                             </div>
                             <div className="w-full bg-slate-100 h-1 mt-2 rounded-full overflow-hidden">
                                 <div className={`h-full ${margin > 20 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(margin, 100)}%` }}></div>
                             </div>
                        </div>
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                             <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2"><ArrowUpRight size={12}/> ROI Proyectado</div>
                             <div className="text-2xl font-mono font-bold text-blue-600">{fmtPct(roi)}</div>
                             <div className="text-[10px] font-medium text-slate-400 mt-1">Retorno sobre Costo</div>
                        </div>
                        <div className="bg-slate-900 p-5 rounded-2xl shadow-lg border border-slate-800 text-white">
                             <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2"><DollarSign size={12}/> Ventas Totales</div>
                             <div className="text-2xl font-mono font-bold">{fmtCompact(revenue)}</div>
                             <div className="text-[10px] font-medium text-slate-500 mt-1">GDV (Gross Dev Value)</div>
                        </div>
                    </div>

                    {/* Detailed Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        
                        {/* Financial Waterfall */}
                        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                            <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2">
                                <Table2 size={16} className="text-blue-500"/> Estructura de Capital y Costos
                            </h3>
                            
                            <div className="space-y-4">
                                {/* Bar Visualization */}
                                <div className="flex h-12 w-full rounded-xl overflow-hidden font-mono text-xs font-bold text-white mb-6">
                                    <div className="bg-slate-500 flex items-center justify-center relative group" style={{ width: `${(landCostTotal/revenue)*100}%` }}>
                                        <span className="hidden group-hover:block absolute -top-8 bg-slate-800 px-2 py-1 rounded">Tierra</span>
                                        {((landCostTotal/revenue)*100) > 10 && 'Tierra'}
                                    </div>
                                    <div className="bg-blue-500 flex items-center justify-center relative group" style={{ width: `${(infraCostTotal/revenue)*100}%` }}>
                                         <span className="hidden group-hover:block absolute -top-8 bg-slate-800 px-2 py-1 rounded">Infra</span>
                                         {((infraCostTotal/revenue)*100) > 10 && 'Infra'}
                                    </div>
                                    <div className="bg-indigo-400 flex items-center justify-center relative group" style={{ width: `${(softCosts/revenue)*100}%` }}>
                                         <span className="hidden group-hover:block absolute -top-8 bg-slate-800 px-2 py-1 rounded">Soft</span>
                                         {((softCosts/revenue)*100) > 10 && 'Soft'}
                                    </div>
                                    <div className="bg-emerald-500 flex items-center justify-center relative group" style={{ width: `${(grossProfit/revenue)*100}%` }}>
                                         <span className="hidden group-hover:block absolute -top-8 bg-slate-800 px-2 py-1 rounded">Utilidad</span>
                                         {((grossProfit/revenue)*100) > 10 && 'Utilidad'}
                                    </div>
                                </div>

                                {/* Table */}
                                <div className="overflow-hidden rounded-xl border border-slate-100">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase">
                                            <tr>
                                                <th className="px-4 py-3 text-left">Concepto</th>
                                                <th className="px-4 py-3 text-right">Monto</th>
                                                <th className="px-4 py-3 text-right">% Ventas</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                                            <tr>
                                                <td className="px-4 py-3 font-sans font-bold text-slate-600"> (+) Ventas Totales</td>
                                                <td className="px-4 py-3 text-right text-slate-900">{fmtCurrency(revenue)}</td>
                                                <td className="px-4 py-3 text-right text-slate-400">100.0%</td>
                                            </tr>
                                            <tr className="bg-red-50/10">
                                                <td className="px-4 py-3 font-sans text-slate-500 pl-8 relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                                    Costo Tierra
                                                </td>
                                                <td className="px-4 py-3 text-right text-red-400">({fmtCurrency(landCostTotal)})</td>
                                                <td className="px-4 py-3 text-right text-slate-400">{fmtPct((landCostTotal/revenue)*100)}</td>
                                            </tr>
                                            <tr className="bg-red-50/10">
                                                <td className="px-4 py-3 font-sans text-slate-500 pl-8 relative">
                                                     <span className="absolute left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                                    Infraestructura
                                                </td>
                                                <td className="px-4 py-3 text-right text-red-400">({fmtCurrency(infraCostTotal)})</td>
                                                <td className="px-4 py-3 text-right text-slate-400">{fmtPct((infraCostTotal/revenue)*100)}</td>
                                            </tr>
                                            <tr className="bg-red-50/10">
                                                <td className="px-4 py-3 font-sans text-slate-500 pl-8 relative">
                                                     <span className="absolute left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-indigo-300"></span>
                                                    Costos Indirectos
                                                </td>
                                                <td className="px-4 py-3 text-right text-red-400">({fmtCurrency(softCosts)})</td>
                                                <td className="px-4 py-3 text-right text-slate-400">{fmtPct((softCosts/revenue)*100)}</td>
                                            </tr>
                                            <tr className="bg-emerald-50/50">
                                                <td className="px-4 py-3 font-sans font-bold text-emerald-800"> (=) Utilidad Bruta</td>
                                                <td className="px-4 py-3 text-right font-bold text-emerald-700">{fmtCurrency(grossProfit)}</td>
                                                <td className="px-4 py-3 text-right font-bold text-emerald-600">{fmtPct(margin)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Technical Specs / Unit Mix */}
                        <div className="space-y-6">
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <Briefcase size={16} className="text-amber-500"/> Inventario (Unit Mix)
                                </h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">STD</div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-700">Lote Estándar</p>
                                                <p className="text-[10px] text-slate-400">Promedio ~{Math.round(avgLotSize)}m²</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-mono font-bold text-slate-800">{standardCount}</p>
                                            <p className="text-[10px] text-slate-400">Unidades</p>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-amber-50 rounded-xl border border-amber-100">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center font-bold text-xs">PRE</div>
                                            <div>
                                                <p className="text-xs font-bold text-amber-900">Lote Premium</p>
                                                <p className="text-[10px] text-amber-600/70">Esquinas / Frente Parque</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-mono font-bold text-amber-900">{premiumCount}</p>
                                            <p className="text-[10px] text-amber-600/70">Unidades</p>
                                        </div>
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between text-xs">
                                        <span className="font-bold text-slate-500">Total Unidades</span>
                                        <span className="font-mono font-bold text-slate-900">{stats.totalLots}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <Ruler size={16} className="text-slate-400"/> Eficiencia Técnica
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                     <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Vendible</p>
                                        <p className="text-lg font-mono font-bold text-slate-700">{fmtPct(stats.efficiency*100)}</p>
                                     </div>
                                     <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Densidad</p>
                                        <p className="text-lg font-mono font-bold text-slate-700">{Math.round((stats.totalLots / (stats.siteArea/10000)))} <span className="text-[10px] text-slate-400">Viv/Ha</span></p>
                                     </div>
                                     <div className="col-span-2 bg-slate-50 p-2 rounded-lg border border-slate-100 flex gap-2 items-start">
                                        <AlertCircle size={14} className="text-slate-400 mt-0.5 shrink-0"/>
                                        <p className="text-[10px] text-slate-500 leading-tight">
                                            Una eficiencia superior al 70% optimiza la rentabilidad pero puede afectar el cumplimiento de áreas verdes municipales.
                                        </p>
                                     </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sitePoints, setSitePoints] = useState<LatLng[]>([]);
  const [constraints, setConstraints] = useState<UserConstraint[]>([]);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  
  // Set initial tool to 'SELECT' (Move Mode) instead of 'DRAW_SITE'
  const [activeTool, setActiveTool] = useState<ToolMode>('SELECT');
  
  const [buildingColor, setBuildingColor] = useState('#f59e0b');
  const [customRoads, setCustomRoads] = useState<{p1: LatLng, p2: LatLng}[]>([]);
  const [showEntrances, setShowEntrances] = useState(false);
  const [config, setConfig] = useState<SiteConfig>({ roadWidth: 12, lotWidth: 8, lotDepth: 18, parkPercentage: 15, stories: 2, entryIndex: 0 });
  const [viewMode, setViewMode] = useState<ViewMode>('2D');
  const [rawGeometry, setRawGeometry] = useState<GeneratedGeometry>({ siteBoundary: null, superblocks: [], roads: [], lots: [], buildings: [], parks: [], trees: [], perimeterWalls: [], accessControl: null, roadMarkings: [], stopSigns: [], entranceCandidates: [], isValid: false });
  const [stats, setStats] = useState<ProjectStats>({ siteArea: 0, netSellableArea: 0, roadArea: 0, parkArea: 0, totalLots: 0, efficiency: 0, possibleEntrances: 0 });
  const [overrides, setOverrides] = useState<Record<string, Feature<Polygon | MultiPolygon> | null>>({});
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showRegulationsModal, setShowRegulationsModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [analyticsData, setAnalyticsData] = useState<{stats: ProjectStats, config: SiteConfig} | null>(null);
  const [mapStyle, setMapStyle] = useState<'light' | 'dark' | 'satellite'>('light');
  const [showStyleSelector, setShowStyleSelector] = useState(false);
  
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Auto-hide Dock State
  const [isDockVisible, setIsDockVisible] = useState(true);
  const dockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -- Confirmation Modal State --
  const [confirmationState, setConfirmationState] = useState<{
      isOpen: boolean;
      title: string;
      message: string;
      type?: ConfirmType;
      confirmText?: string;
      cancelText?: string;
      onConfirm: () => void;
  }>({
      isOpen: false,
      title: '',
      message: '',
      onConfirm: () => {}
  });

  const closeConfirm = () => setConfirmationState(prev => ({ ...prev, isOpen: false }));

  const requestConfirmation = (
    title: string, 
    message: string, 
    onConfirm: () => void, 
    type: ConfirmType = 'danger',
    confirmText?: string
  ) => {
      setConfirmationState({
          isOpen: true,
          title,
          message,
          type,
          onConfirm: () => {
              onConfirm();
              closeConfirm();
          },
          confirmText,
          cancelText: 'Cancelar'
      });
  };
  // --------------------------------

  // --- Auto-Hide Dock Logic ---
  const resetDockTimer = useCallback(() => {
    setIsDockVisible(true);
    if (dockTimerRef.current) clearTimeout(dockTimerRef.current);
    dockTimerRef.current = setTimeout(() => {
        setIsDockVisible(false);
    }, 4000); // Hide after 4 seconds of inactivity
  }, []);

  // --- DEVICE DETECTION LOGIC ---
  useEffect(() => {
      const checkDevice = () => {
          // 1. Screen Resolution Check
          const width = window.innerWidth;
          
          // 2. User Agent Check (Strict)
          const ua = navigator.userAgent.toLowerCase();
          const isMobileUA = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua);
          
          // 3. Touch + Screen Size (Catches 'Desktop Mode' on Phones)
          const isTouch = navigator.maxTouchPoints > 0;
          // Most phones in desktop mode still report a screen.width that is small, 
          // or their innerWidth might be around 980px but logical screen is small.
          const isSmallScreen = window.screen.width < 1024 || width < 1024;

          // Block if it matches explicit mobile UA OR if the screen is too small (including phones in desktop mode)
          if (isMobileUA || isSmallScreen) {
              setIsMobileDevice(true);
          } else {
              setIsMobileDevice(false);
          }
      };

      checkDevice();
      window.addEventListener('resize', checkDevice);
      return () => window.removeEventListener('resize', checkDevice);
  }, []);

  useEffect(() => {
    // Attach listeners to detect activity
    window.addEventListener('mousemove', resetDockTimer);
    window.addEventListener('touchstart', resetDockTimer);
    window.addEventListener('click', resetDockTimer);
    window.addEventListener('keydown', resetDockTimer);

    // Initial timer start
    resetDockTimer();

    return () => {
        window.removeEventListener('mousemove', resetDockTimer);
        window.removeEventListener('touchstart', resetDockTimer);
        window.removeEventListener('click', resetDockTimer);
        window.removeEventListener('keydown', resetDockTimer);
        if (dockTimerRef.current) clearTimeout(dockTimerRef.current);
    };
  }, [resetDockTimer]);
  // ----------------------------

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'analytics') {
        const stored = localStorage.getItem('urban-lytica-analytics-data');
        if (stored) {
            try {
                setAnalyticsData(JSON.parse(stored));
                setViewMode('STATS');
            } catch(e) {}
        }
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('urban-lytica-projects');
    if (stored) try { setSavedProjects(JSON.parse(stored)); } catch (e) {}
  }, []);

  const recordState = useCallback(() => {
    setHistory(prev => {
        const snapshot: HistoryState = { sitePoints, constraints, config: { ...config }, customRoads: [...customRoads], overrides: { ...overrides } };
        const newHistory = [...prev, snapshot];
        if (newHistory.length > 50) newHistory.shift();
        return newHistory;
    });
  }, [sitePoints, constraints, config, customRoads, overrides]);

  const handleUndo = useCallback(() => {
      setHistory(prev => {
          if (prev.length === 0) return prev;
          const lastState = prev[prev.length - 1];
          const remaining = prev.slice(0, -1);
          setSitePoints(lastState.sitePoints); setConstraints(lastState.constraints); setConfig(lastState.config);
          setCustomRoads(lastState.customRoads); setOverrides(lastState.overrides);
          return remaining;
      });
  }, []);

  const handleClearAll = () => {
    requestConfirmation(
        'Eliminar Proyecto',
        '¿Estás seguro de que deseas eliminar todo el trabajo actual? Esta acción no se puede deshacer.',
        () => {
            recordState();
            setSitePoints([]);
            setConstraints([]);
            setCustomRoads([]);
            setOverrides({});
        },
        'danger',
        'Sí, eliminar todo'
    );
  };

  useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo(); } };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo]);

  const saveProject = () => {
      if (!newProjectName.trim()) return;
      const project: SavedProject = { id: generateId(), name: newProjectName, createdAt: Date.now(), data: { sitePoints, constraints, config, customRoads, overrides, buildingColor } };
      const updated = [project, ...savedProjects];
      setSavedProjects(updated);
      localStorage.setItem('urban-lytica-projects', JSON.stringify(updated));
      setShowSaveModal(false); setNewProjectName("");
  };

  const loadProject = (project: SavedProject) => {
      requestConfirmation(
        'Abrir Proyecto',
        'Al cargar este proyecto, se perderán los cambios no guardados del diseño actual.',
        () => {
            setSitePoints(project.data.sitePoints); setConstraints(project.data.constraints); setConfig(project.data.config);
            setCustomRoads(project.data.customRoads); setOverrides(project.data.overrides); setBuildingColor(project.data.buildingColor || '#f59e0b');
            setHistory([]); setShowLoadModal(false); setActiveTool('SELECT'); setSidebarOpen(false);
        },
        'warning',
        'Abrir de todos modos'
      );
  };

  const deleteProject = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      requestConfirmation(
          'Borrar Archivo',
          '¿Eliminar este proyecto de la memoria local permanentemente?',
          () => {
            const updated = savedProjects.filter(p => p.id !== id);
            setSavedProjects(updated);
            localStorage.setItem('urban-lytica-projects', JSON.stringify(updated));
          },
          'danger',
          'Eliminar'
      );
  }

  // Handle Logout
  const handleLogout = () => {
      requestConfirmation(
          'Cerrar Sesión',
          '¿Quieres salir de la plataforma?',
          () => {
             setIsLoggedIn(false);
             setSidebarOpen(false);
          },
          'warning',
          'Salir'
      );
  };

  // DXF Export Logic
  const handleExportDXF = () => {
    if (!displayGeometry.siteBoundary) return;

    let dxfContent = "";
    // Header
    dxfContent += "0\nSECTION\n2\nHEADER\n0\nENDSEC\n";
    // Tables (Layers)
    dxfContent += "0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n4\n";
    const layers = [
        { name: "SITE_BOUNDARY", color: 7 }, // White
        { name: "LOTS", color: 2 }, // Yellow
        { name: "BUILDINGS", color: 1 }, // Red
        { name: "ROADS", color: 252 }, // Gray
        { name: "PARKS", color: 3 } // Green
    ];
    layers.forEach(l => {
        dxfContent += `0\nLAYER\n2\n${l.name}\n70\n0\n62\n${l.color}\n6\nCONTINUOUS\n0\n`;
    });
    dxfContent += "0\nENDTAB\n0\nENDSEC\n";
    
    // Entities
    dxfContent += "0\nSECTION\n2\nENTITIES\n";

    // Helper: Write Polyline
    const writePolyline = (feature: Feature<Polygon | MultiPolygon>, layer: string) => {
        if (!feature.geometry || !feature.geometry.coordinates) return;
        
        // Find reference center from site boundary to normalize coords to 0,0 area
        const refCenter = sitePoints.length > 0 ? sitePoints[0] : {lat:0, lng:0};

        const processRing = (ring: number[][]) => {
             dxfContent += `0\nLWPOLYLINE\n8\n${layer}\n90\n${ring.length}\n70\n1\n`; // 70=1 means closed
             ring.forEach(coord => {
                 const [x, y] = geoToCartesian(coord[0], coord[1], refCenter.lng, refCenter.lat);
                 dxfContent += `10\n${x.toFixed(4)}\n20\n${y.toFixed(4)}\n`;
             });
        };

        if (feature.geometry.type === 'Polygon') {
            (feature.geometry.coordinates as number[][][]).forEach(ring => processRing(ring));
        } else if (feature.geometry.type === 'MultiPolygon') {
            (feature.geometry.coordinates as number[][][][]).forEach(poly => {
                poly.forEach(ring => processRing(ring));
            });
        }
    };

    if (displayGeometry.siteBoundary) writePolyline(displayGeometry.siteBoundary as Feature<Polygon>, "SITE_BOUNDARY");
    displayGeometry.lots.forEach(l => l && writePolyline(l as Feature<Polygon>, "LOTS"));
    displayGeometry.buildings.forEach(b => b && writePolyline(b as Feature<Polygon>, "BUILDINGS"));
    displayGeometry.roads.forEach(r => r && writePolyline(r as Feature<Polygon>, "ROADS"));
    displayGeometry.parks.forEach(p => p && writePolyline(p as Feature<Polygon>, "PARKS"));

    dxfContent += "0\nENDSEC\n0\nEOF";

    // Download
    const blob = new Blob([dxfContent], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Masterplan_${Date.now()}.dxf`; // .dxf opens in AutoCAD
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    const result = generateBuilding(sitePoints, config, constraints);
    setRawGeometry(result.geometry);
    setStats(result.stats);
  }, [sitePoints, config, constraints]);

  const displayGeometry = useMemo(() => {
      const mergeList = (list: any[], prefix: string) => list.map((item, i) => {
           const key = `${prefix}-${i}`;
           return (key in overrides) ? overrides[key] : item;
      });
      let finalLots = rawGeometry.lots.map((item, i) => {
          const key = `lot-${i}`;
          return (key in overrides) ? overrides[key] : item;
      });
      
      const overriddenLotIndices = new Set<number>();
      Object.keys(overrides).forEach(key => {
          if (key.startsWith('lot-')) overriddenLotIndices.add(parseInt(key.split('-')[1]));
      });

      let finalSuperblocks = rawGeometry.superblocks.map((b, i) => {
          const key = `block-${i}`;
          return (key in overrides) ? overrides[key] : b;
      });

      overriddenLotIndices.forEach(lotIdx => {
          const originalLot = rawGeometry.lots[lotIdx];
          const newLot = overrides[`lot-${lotIdx}`];
          if (!originalLot) return;
          const blockIdx = rawGeometry.superblocks.findIndex(b => b && turf.booleanIntersects(b, originalLot));
          
          if (blockIdx !== -1 && finalSuperblocks[blockIdx]) {
              let currentBlock = finalSuperblocks[blockIdx] as Feature<Polygon | MultiPolygon>;
              try {
                  if (newLot) {
                      const union = turf.union(featureCollection([currentBlock, newLot]));
                      if (union) currentBlock = union as Feature<Polygon | MultiPolygon>;
                      const voidPoly = turf.difference(featureCollection([originalLot, newLot]));
                      if (voidPoly) {
                           const diff = turf.difference(featureCollection([currentBlock, voidPoly]));
                           if (diff) currentBlock = diff as Feature<Polygon | MultiPolygon>;
                      }
                  } else {
                      const diff = turf.difference(featureCollection([currentBlock, originalLot]));
                      if (diff) currentBlock = diff as Feature<Polygon | MultiPolygon>;
                  }
                  finalSuperblocks[blockIdx] = currentBlock;
              } catch (err) {}
          }
      });

      let finalParks = mergeList(rawGeometry.parks, 'park');
      const roadPolygons: Feature<Polygon | MultiPolygon>[] = rawGeometry.roads ? [...rawGeometry.roads] : [];
      
      if (customRoads.length > 0 && rawGeometry.siteBoundary) {
          const roadWidthKm = config.roadWidth / 1000;
          customRoads.forEach(seg => {
              const line = lineString([[seg.p1.lng, seg.p1.lat], [seg.p2.lng, seg.p2.lat]]);
              const buffered = turf.buffer(line, roadWidthKm / 2, { units: 'kilometers' });
              try {
                  const clipped = turf.intersect(featureCollection([buffered, rawGeometry.siteBoundary as any]));
                  if (clipped) roadPolygons.push(clipped as Feature<Polygon | MultiPolygon>);
              } catch(e) {}
          });

          if (roadPolygons.length > 0) {
              const cutAll = (features: (Feature<Polygon | MultiPolygon>|null)[]) => features.map(f => {
                  if (!f) return null;
                  let current = f;
                  try {
                      for (const road of roadPolygons) {
                          if (!current) break;
                          if (turf.booleanIntersects(current, road)) {
                              const diff = turf.difference(featureCollection([current, road]));
                              current = diff as Feature<Polygon | MultiPolygon>; 
                          }
                      }
                  } catch(e) {}
                  return current;
              });
              finalLots = cutAll(finalLots);
              finalSuperblocks = cutAll(finalSuperblocks);
              finalParks = cutAll(finalParks);
          }
      }

      const finalBuildings: any[] = [];
      const finalTrees: any[] = [];
      const usedLotIndices = new Set<number>();

      finalLots.forEach((lot, i) => {
          if (!lot) return; 
          const lotId = i;
          usedLotIndices.add(lotId);
          
          if (overrides[`bldg-${lotId}`]) {
              finalBuildings.push(overrides[`bldg-${lotId}`]);
              const origTree = rawGeometry.trees.find(t => t.properties?.lotId === lotId);
              if (origTree) finalTrees.push(origTree);
          } else {
              const isModified = overriddenLotIndices.has(lotId) || roadPolygons.some(r => turf.booleanIntersects(lot, r));
              if (isModified) {
                   const { building, tree } = generateLotAssets(lot, lotId, config);
                   if (building) finalBuildings.push(building);
                   if (tree) finalTrees.push(tree);
              } else {
                   const origBldg = rawGeometry.buildings.find(b => b.properties?.lotId === lotId);
                   const origTree = rawGeometry.trees.find(t => t.properties?.lotId === lotId);
                   if (origBldg) finalBuildings.push(origBldg);
                   if (origTree) finalTrees.push(origTree);
              }
          }
      });
      
      finalParks.forEach((park, index) => {
          if (!park) return;
          const original = rawGeometry.parks[index];
          let shouldUseOriginal = false;
          const isOverridden = `park-${index}` in overrides;
          if (original && !isOverridden) {
               const origArea = turf.area(original);
               const newArea = turf.area(park);
               if (Math.abs(origArea - newArea) < 1.0) shouldUseOriginal = true;
          }
          if (shouldUseOriginal) {
               const existing = rawGeometry.trees.filter(t => t.properties?.parkId === index);
               finalTrees.push(...existing);
          } else {
               const newTrees = generateParkAssets(park, index);
               finalTrees.push(...newTrees);
          }
      });

      return {
          ...rawGeometry, lots: finalLots, superblocks: finalSuperblocks, parks: finalParks, roads: roadPolygons, buildings: finalBuildings, trees: finalTrees
      };
  }, [rawGeometry, overrides, customRoads, config]);

  const handleGeometryOverride = (updates: Record<string, Feature<Polygon | MultiPolygon> | null>, commit: boolean = false) => {
      const nextOverrides = { ...overrides };
      Object.entries(updates).forEach(([id, feature]) => {
          let finalFeature = feature;
          if (commit && finalFeature && rawGeometry.siteBoundary) {
              try {
                 const isClippable = id.startsWith('lot-') || id.startsWith('park-');
                 if (isClippable) {
                     const clipped = turf.intersect(featureCollection([finalFeature as any, rawGeometry.siteBoundary as any]));
                     finalFeature = clipped ? (clipped as Feature<Polygon | MultiPolygon>) : null; 
                 }
              } catch(e) {}
          }
          nextOverrides[id] = finalFeature;
          if (id.startsWith('lot-')) {
              const index = id.split('-')[1];
              if (nextOverrides[`bldg-${index}`]) delete nextOverrides[`bldg-${index}`];
          }
      });
      setOverrides(nextOverrides);
  };

  const handleAddRoad = (p1: LatLng, p2: LatLng) => { setCustomRoads([...customRoads, { p1, p2 }]); setActiveTool('SELECT'); };

  const isEditMode = ['DRAW_SITE', 'PLACE_PARK', 'DRAW_ROAD', 'EDIT_GEOMETRY'].includes(activeTool);

  // If Mobile, Block Access
  if (isMobileDevice) {
      return (
          <div className="h-screen w-screen bg-slate-50 flex items-center justify-center p-6 text-center font-sans">
              <div className="max-w-md bg-white rounded-3xl shadow-2xl p-10 border border-slate-100 flex flex-col items-center">
                  <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6 relative">
                      <MonitorOff size={40} className="text-slate-400" strokeWidth={1.5} />
                      <div className="absolute top-0 right-0 bg-rose-500 rounded-full p-1 border-2 border-white">
                          <X size={12} className="text-white" strokeWidth={3} />
                      </div>
                  </div>
                  <h1 className="text-2xl font-black text-slate-900 mb-3">Dispositivo no compatible</h1>
                  <p className="text-sm font-medium text-slate-500 leading-relaxed mb-6">
                      La plataforma <strong className="text-slate-800">AI Masterplan</strong> requiere una pantalla más grande y periféricos de precisión (mouse) para procesar y visualizar los planos maestros en 3D.
                  </p>
                  <div className="bg-blue-50 text-blue-800 px-4 py-3 rounded-xl text-xs font-bold border border-blue-100">
                      Por favor, usa una PC, Laptop o Tablet.
                  </div>
              </div>
          </div>
      );
  }

  if (!isLoggedIn) return <Login onLogin={() => setIsLoggedIn(true)} />;

  if (viewMode === 'STATS') {
      const displayStats = analyticsData ? analyticsData.stats : stats;
      const displayConfig = analyticsData ? analyticsData.config : config;
      return (
        <div className="h-screen w-screen bg-slate-50 overflow-hidden">
             <AnalyticsView stats={displayStats} config={displayConfig} onBack={() => {
                 setViewMode('2D');
                 setAnalyticsData(null); 
                 if (window.history.pushState) {
                     const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                     window.history.pushState({path:newUrl},'',newUrl);
                 }
             }} />
        </div>
      );
  }

  return (
    <div className="flex h-screen w-screen bg-slate-100 text-slate-800 font-sans overflow-hidden">
      
      {/* Sidebar - Floating Overlay */}
      <Sidebar 
        config={config} setConfig={setConfig} stats={stats} 
        showEntrances={showEntrances} setShowEntrances={setShowEntrances} 
        onInteractStart={recordState} 
        onSave={() => setShowSaveModal(true)} onLoad={() => setShowLoadModal(true)} 
        onClear={handleClearAll}
        onOpenRegulations={() => setShowRegulationsModal(true)}
        onLogout={handleLogout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      
      {/* Main Content Area - Full Screen without margin */}
      <div className="flex-1 flex flex-col relative h-full min-h-0 transition-all duration-300"> 
        
        {/* Mobile Sidebar Toggle */}
        <div className="md:hidden absolute top-6 left-4 z-40 animate-enter-up">
            <button onClick={() => setSidebarOpen(true)} className="btn-interactive p-3 bg-white/90 backdrop-blur-xl rounded-full shadow-lg border border-slate-200 text-slate-700">
                <Menu size={20} />
            </button>
        </div>

        {/* Floating Top Nav (View Toggle) - Centered */}
        <div className="absolute top-6 md:top-4 left-1/2 -translate-x-1/2 z-40 animate-enter-down">
           <div className="glass-panel p-1 rounded-full shadow-lg border border-white/50 flex gap-0.5">
              <button 
                onClick={() => setViewMode('2D')} 
                className={`btn-interactive px-5 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all ${viewMode === '2D' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50/50'}`}
              >
                  <MapIcon size={14} /> <span className="hidden sm:inline">Mapa</span>
              </button>
              <button 
                onClick={() => setViewMode('3D')} 
                className={`btn-interactive px-5 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all ${viewMode === '3D' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50/50'}`}
              >
                  <Box size={14} /> <span className="hidden sm:inline">Modelo</span>
              </button>
              <button 
                onClick={() => setViewMode('STATS')} 
                className={`btn-interactive px-5 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all text-slate-500 hover:text-slate-700 hover:bg-slate-50/50`}
              >
                  <BarChart3 size={14} /> <span className="hidden sm:inline">Análisis</span>
              </button>
           </div>
        </div>

        {/* Map Style Selector FAB - Only visible in 2D Map Mode */}
        {viewMode === '2D' && (
            <div className={`absolute right-4 md:right-6 z-50 flex flex-col items-end gap-3 animate-enter-up delay-200 transition-all duration-500 ease-spring bottom-24 md:bottom-8`}>
                {showStyleSelector && (
                    <div className="glass-panel p-2 rounded-2xl shadow-2xl w-64 animate-enter-scale origin-bottom-right border border-white/60">
                        <div className="space-y-1">
                            <button
                                onClick={() => setMapStyle('light')}
                                className={`btn-interactive w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${mapStyle === 'light' ? 'bg-blue-50/80 border-blue-200 text-blue-700' : 'border-transparent hover:bg-slate-50/50 text-slate-600'}`}
                            >
                                <div className={`p-1.5 rounded-lg ${mapStyle === 'light' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                    <MapIcon size={18} />
                                </div>
                                <span className="font-bold text-sm">Estándar</span>
                                {mapStyle === 'light' && <div className="ml-auto w-2 h-2 rounded-full bg-blue-500"></div>}
                            </button>

                            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-50/50 rounded-xl border border-slate-100">
                                <button
                                    onClick={() => setMapStyle('light')}
                                    className={`btn-interactive flex items-center justify-center gap-2 py-2 rounded-lg transition-all ${mapStyle === 'light' ? 'bg-white shadow-sm text-slate-900 font-bold' : 'text-slate-400 font-medium hover:text-slate-600'}`}
                                >
                                    <Sun size={14} /> Día
                                </button>
                                <button
                                    onClick={() => setMapStyle('dark')}
                                    className={`btn-interactive flex items-center justify-center gap-2 py-2 rounded-lg transition-all ${mapStyle === 'dark' ? 'bg-slate-800 shadow-sm text-white font-bold' : 'text-slate-400 font-medium hover:text-slate-600'}`}
                                >
                                    <Moon size={14} /> Noche
                                </button>
                            </div>

                            <button
                                onClick={() => setMapStyle('satellite')}
                                className={`btn-interactive w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${mapStyle === 'satellite' ? 'bg-blue-50/80 border-blue-200 text-blue-700' : 'border-transparent hover:bg-slate-50/50 text-slate-600'}`}
                            >
                                <div className={`p-1.5 rounded-lg ${mapStyle === 'satellite' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                    <Globe size={18} />
                                </div>
                                <span className="font-bold text-sm">Satelital</span>
                                {mapStyle === 'satellite' && <div className="ml-auto w-2 h-2 rounded-full bg-blue-500"></div>}
                            </button>
                        </div>
                    </div>
                )}
                <button 
                    onClick={() => setShowStyleSelector(!showStyleSelector)}
                    className={`w-14 h-14 rounded-full shadow-2xl shadow-blue-900/20 flex items-center justify-center transition-all duration-500 ease-spring hover:scale-110 active:scale-95 ${showStyleSelector ? 'bg-blue-700 text-white rotate-90' : 'bg-blue-600 text-white'}`}
                >
                    {showStyleSelector ? <X size={26} strokeWidth={2.5}/> : <Layers size={26} strokeWidth={2.5} />}
                </button>
            </div>
        )}

        {/* Floating Bottom Toolbar (Dock) with Auto-Hide */}
        {viewMode === '2D' && (
            <div 
                className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-40 max-w-[95vw] overflow-visible px-2 pb-safe transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${isDockVisible ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-20 opacity-0 pointer-events-none'}`}
                onMouseEnter={() => {
                    if (dockTimerRef.current) clearTimeout(dockTimerRef.current);
                    setIsDockVisible(true);
                }}
                onMouseLeave={resetDockTimer}
            >
                <div className="glass-panel flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl shadow-2xl min-w-max relative z-20 border border-white/60 backdrop-blur-xl mx-auto">
                    
                    {/* Centered Tool Submenu */}
                    <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-4 bg-white/90 backdrop-blur-xl p-1.5 rounded-2xl border border-white/50 shadow-2xl flex gap-1 origin-bottom transition-all duration-300 ease-spring z-10 ${isEditMode ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-90 translate-y-4 pointer-events-none'}`}>
                        <button onClick={(e) => { e.stopPropagation(); setActiveTool('DRAW_SITE'); }} className={`btn-interactive p-2.5 rounded-xl transition-all ${activeTool === 'DRAW_SITE' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50 hover:text-blue-500'}`} title="Dibujar Sitio"><PenTool size={18}/></button>
                        <button onClick={(e) => { e.stopPropagation(); setActiveTool('PLACE_PARK'); }} className={`btn-interactive p-2.5 rounded-xl transition-all ${activeTool === 'PLACE_PARK' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50 hover:text-blue-500'}`} title="Añadir Parque"><TreePine size={18}/></button>
                        <button onClick={(e) => { e.stopPropagation(); setActiveTool('DRAW_ROAD'); }} className={`btn-interactive p-2.5 rounded-xl transition-all ${activeTool === 'DRAW_ROAD' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50 hover:text-blue-500'}`} title="Dibujar Calle"><Route size={18}/></button>
                        <button onClick={(e) => { e.stopPropagation(); setActiveTool('EDIT_GEOMETRY'); }} className={`btn-interactive p-2.5 rounded-xl transition-all ${activeTool === 'EDIT_GEOMETRY' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50 hover:text-blue-500'}`} title="Editar Geometría"><Edit2 size={18}/></button>
                    </div>

                    {/* Undo */}
                    <button onClick={handleUndo} className="btn-interactive p-3 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all" title="Deshacer">
                        <Undo2 size={20} strokeWidth={2} />
                    </button>
                    
                    <div className="w-px h-6 bg-slate-300/50 mx-1"></div>

                    {/* Move / Pan */}
                    <button onClick={() => setActiveTool('SELECT')} className={`btn-interactive p-3 rounded-xl transition-all ${activeTool === 'SELECT' ? 'bg-blue-50 text-blue-600 shadow-inner' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'}`} title="Mover">
                            <Hand size={20} strokeWidth={activeTool === 'SELECT' ? 2.5 : 2} />
                    </button>
                    
                    {/* Edit Toggle */}
                    <button onClick={() => setActiveTool(isEditMode ? 'SELECT' : 'DRAW_SITE')} className={`btn-interactive p-3 rounded-xl transition-all ${isEditMode ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'}`} title="Editar">
                        <Pencil size={20} strokeWidth={isEditMode ? 2.5 : 2} />
                    </button>

                    <div className="w-px h-6 bg-slate-300/50 mx-1"></div>

                    {/* Delete */}
                    <button onClick={handleClearAll} className="btn-interactive p-3 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all" title="Borrar Todo">
                        <Trash2 size={20} strokeWidth={2} />
                    </button>
                </div>
            </div>
        )}

        {viewMode === '3D' && rawGeometry.isValid && (
           <div className="absolute top-20 right-6 z-40 glass-panel p-5 rounded-2xl shadow-xl w-64 animate-slide-in-right border border-white/60">
               {/* 3D Controls */}
               <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                  <Box size={16} className="text-blue-600"/>
                  <h3 className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Visualización 3D</h3>
               </div>
               <div className="mb-6">
                    <label className="text-[10px] font-bold uppercase text-slate-400 mb-3 flex items-center gap-2 tracking-wider"><Palette size={12}/> Fachada</label>
                    <div className="flex gap-2 flex-wrap">
                       {['#f59e0b', '#3b82f6', '#10b981', '#64748b', '#ef4444', '#8b5cf6', '#ffffff'].map(c => (
                           <button key={c} onClick={() => setBuildingColor(c)} className={`btn-interactive w-8 h-8 rounded-full shadow-sm border border-slate-100 ${buildingColor === c ? 'ring-2 ring-blue-600 ring-offset-2 scale-110' : ''}`} style={{ backgroundColor: c }} />
                       ))}
                    </div>
               </div>
               <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-2 tracking-wider"><Layers size={12} /> Niveles</label>
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{config.stories}</span>
                    </div>
                    <input type="range" min="1" max="8" step="1" value={config.stories} onPointerDown={recordState} onChange={(e) => setConfig({ ...config, stories: Number(e.target.value) })} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
               </div>

               {/* Export CAD Button */}
               <button 
                  onClick={handleExportDXF}
                  className="btn-interactive w-full py-2.5 bg-slate-800 text-white rounded-xl shadow-lg flex items-center justify-center gap-2 hover:bg-slate-700 transition-all text-xs font-bold"
               >
                   <FileOutput size={14} /> Exportar CAD (.dxf)
               </button>
           </div>
        )}

        <div className="w-full h-full relative bg-slate-100">
           {viewMode === '2D' && (
             <MapCanvas 
               points={sitePoints} setPoints={setSitePoints} geometry={displayGeometry} activeTool={activeTool}
               constraints={constraints} setConstraints={setConstraints} config={config} setConfig={setConfig}
               showEntrances={showEntrances} onGeometryOverride={handleGeometryOverride} onAddRoad={handleAddRoad} onInteractStart={recordState}
               mapStyle={mapStyle}
             />
           )}
           {viewMode === '3D' && (
             <div className="w-full h-full bg-gradient-to-b from-slate-200 to-slate-300">
                {rawGeometry.isValid ? <ModelCanvas geometry={displayGeometry} config={config} points={sitePoints} buildingColor={buildingColor} mapStyle={mapStyle} /> : <div className="flex items-center justify-center h-full text-slate-400 text-sm flex-col gap-2 animate-pulse"><MousePointer2 size={32} className="opacity-20"/><span>Dibuja un polígono para comenzar</span></div>}
             </div>
           )}
        </div>

        {/* Global Confirmation Modal */}
        <ConfirmationModal 
            isOpen={confirmationState.isOpen}
            title={confirmationState.title}
            message={confirmationState.message}
            onConfirm={confirmationState.onConfirm}
            onCancel={closeConfirm}
            type={confirmationState.type}
            confirmText={confirmationState.confirmText}
            cancelText={confirmationState.cancelText}
        />

        {/* Improved Modals */}
        <RegulatoryModal isOpen={showRegulationsModal} onClose={() => setShowRegulationsModal(false)} stats={stats} config={config} />

        {(showSaveModal || showLoadModal) && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/30 backdrop-blur-md p-4 animate-fade-in">
                {/* Save Modal */}
                {showSaveModal && (
                    <div className="bg-white rounded-[2rem] shadow-2xl p-8 w-full max-w-[400px] animate-enter-scale border border-white/50">
                        <div className="flex justify-between items-center mb-6"><h3 className="text-lg font-bold text-slate-900">Guardar Proyecto</h3><button onClick={() => setShowSaveModal(false)} className="btn-interactive text-slate-400 hover:text-slate-600 bg-slate-50 p-2 rounded-full transition-colors"><X size={18} /></button></div>
                        <div className="mb-6"><label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider">Nombre del Proyecto</label><input type="text" autoFocus value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="Ej. Masterplan Norte..." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none text-sm font-medium transition-all shadow-sm text-slate-800" /></div>
                        <div className="flex gap-3"><button onClick={() => setShowSaveModal(false)} className="btn-interactive flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button><button onClick={saveProject} disabled={!newProjectName.trim()} className="btn-interactive flex-1 py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:shadow-none">Guardar</button></div>
                    </div>
                )}
                {/* Load Modal */}
                {showLoadModal && (
                    <div className="bg-white rounded-[2rem] shadow-2xl p-8 w-full max-w-[500px] max-h-[80vh] flex flex-col animate-enter-scale border border-white/50">
                        <div className="flex justify-between items-center mb-6"><h3 className="text-lg font-bold text-slate-900">Abrir Proyecto</h3><button onClick={() => setShowLoadModal(false)} className="btn-interactive text-slate-400 hover:text-slate-600 bg-slate-50 p-2 rounded-full transition-colors"><X size={18} /></button></div>
                        <div className="flex-1 overflow-y-auto pr-2 space-y-2 mb-4 custom-scrollbar">
                            {savedProjects.length === 0 ? <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50"><FilePlus size={40} className="mx-auto mb-3 opacity-30 text-blue-600"/><p className="text-sm font-medium">No hay proyectos guardados.</p></div> : savedProjects.map(proj => (
                                    <div key={proj.id} className="btn-interactive group p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-white hover:border-blue-200 hover:shadow-lg hover:shadow-blue-600/5 transition-all cursor-pointer flex justify-between items-center" onClick={() => loadProject(proj)}>
                                        <div><h4 className="font-bold text-slate-800 group-hover:text-blue-600 mb-1 transition-colors">{proj.name}</h4><p className="text-xs text-slate-400 font-medium">{new Date(proj.createdAt).toLocaleDateString()}</p></div>
                                        <button onClick={(e) => deleteProject(proj.id, e)} className="btn-interactive p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};

export default App;
