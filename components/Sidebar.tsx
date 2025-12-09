
import React from 'react';
import { SiteConfig, ProjectStats } from '../types';
import { Ruler, TreePine, Home, Map as MapIcon, RefreshCw, Save, FolderOpen, LayoutGrid, Layers, Settings2, Car, Trash2, FilePlus, Scale, X, LogOut } from 'lucide-react';

interface SidebarProps {
  config: SiteConfig;
  setConfig: (c: SiteConfig) => void;
  stats: ProjectStats;
  showEntrances: boolean;
  setShowEntrances: (v: boolean) => void;
  onInteractStart: () => void;
  onSave: () => void;
  onLoad: () => void;
  onClear: () => void;
  onOpenRegulations: () => void;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
}

// Ultra-compact Slider Component
const ConfigSlider = ({ label, value, min, max, step, onChange, unit, onStart }: any) => (
    <div className="mb-3 px-1 group">
        <div className="flex justify-between items-center mb-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide group-hover:text-blue-600 transition-colors">{label}</label>
            <div className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm min-w-[3rem] text-center transition-all group-hover:border-blue-200 group-hover:shadow-md">
                {value}{unit}
            </div>
        </div>
        <div className="relative h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div 
                className="absolute left-0 top-0 bottom-0 bg-blue-600 rounded-full transition-all duration-150 ease-out" 
                style={{ width: `${((value - min) / (max - min)) * 100}%` }}
            ></div>
            <input 
                type="range" min={min} max={max} step={step}
                value={value}
                onPointerDown={onStart}
                onChange={(e) => onChange(Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
        </div>
    </div>
);

// Compact Metric Card
const MetricCard = ({ label, value, unit, icon: Icon, colorClass = "text-slate-800", delay }: any) => (
    <div className={`bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between h-[72px] relative overflow-hidden group hover:border-blue-200 hover:shadow-md transition-all duration-300 animate-enter-up ${delay}`}>
        <div className="flex items-center gap-1.5 text-slate-400 z-10">
            <Icon size={13} strokeWidth={2.5} className="group-hover:text-blue-500 transition-colors duration-300"/>
            <span className="text-[9px] font-bold uppercase tracking-wider group-hover:text-slate-600 transition-colors">{label}</span>
        </div>
        <div className="z-10 mt-0.5">
             <span className={`text-2xl font-extrabold tracking-tight ${colorClass} transition-transform duration-300 group-hover:scale-105 inline-block`}>{value}</span>
             {unit && <span className="text-[10px] text-slate-400 font-bold ml-0.5">{unit}</span>}
        </div>
        <Icon className="absolute -right-2 -bottom-2 text-slate-50 opacity-[0.04] w-14 h-14 pointer-events-none group-hover:opacity-[0.1] group-hover:scale-110 group-hover:-rotate-12 transition-all duration-500" />
    </div>
);

export const Sidebar: React.FC<SidebarProps> = ({ config, setConfig, stats, showEntrances, setShowEntrances, onInteractStart, onSave, onLoad, onClear, onOpenRegulations, onLogout, isOpen, onClose }) => {
  
  const updateConfig = (key: keyof SiteConfig, value: number) => {
    setConfig({ ...config, [key]: value });
  };

  return (
    <>
        {/* Mobile Backdrop with fade */}
        <div 
            className={`fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[90] transition-opacity duration-500 md:hidden ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
            onClick={onClose}
        ></div>

        {/* Sidebar Container */}
        <div className={`
            fixed left-4 top-4 z-[100]
            flex flex-col
            w-[calc(100vw-2rem)] md:w-[320px] 
            max-h-[calc(100vh-2rem)]
            bg-white/95 backdrop-blur-xl rounded-[1.5rem] shadow-2xl shadow-blue-900/10 border border-white/50
            transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] origin-top-left
            ${isOpen ? 'translate-x-0 opacity-100 scale-100' : '-translate-x-[20px] opacity-0 scale-95 md:translate-x-0 md:opacity-100 md:scale-100 pointer-events-none md:pointer-events-auto'}
            font-sans
        `}>
        
            {/* Header Section */}
            <div className="p-5 pb-2 shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-3 animate-enter-up">
                    <img src="./Imagenes/logo.png" alt="AI Masterplan Logo" className="w-10 h-10 object-contain drop-shadow-sm" />
                    <div>
                        <h1 className="text-sm font-extrabold text-slate-900 leading-none tracking-tight">AI Masterplan</h1>
                    </div>
                </div>
                
                {/* Actions */}
                <div className="flex gap-1 animate-enter-up delay-75">
                    <button onClick={onOpenRegulations} className="btn-interactive p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Marco Legal">
                        <Scale size={16} strokeWidth={2.5}/>
                    </button>
                    <button onClick={onSave} className="btn-interactive p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Guardar">
                        <Save size={16} strokeWidth={2.5}/>
                    </button>
                    <button onClick={onLoad} className="btn-interactive p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Cargar">
                        <FolderOpen size={16} strokeWidth={2.5}/>
                    </button>
                    <button onClick={onClear} className="btn-interactive p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg" title="Borrar Todo">
                        <Trash2 size={16} strokeWidth={2.5}/>
                    </button>
                </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="overflow-y-auto px-5 py-4 space-y-6 scrollbar-hide flex-1">
                
                {/* Metrics */}
                <section>
                    <h2 className="text-[9px] font-extrabold uppercase text-slate-400 tracking-[0.15em] mb-2.5 flex items-center gap-1.5 animate-enter-up delay-100">
                        <LayoutGrid size={12} /> Métricas en Vivo
                    </h2>
                    <div className="grid grid-cols-2 gap-2.5 bg-slate-50/50 p-2.5 rounded-2xl border border-slate-100/50">
                        <MetricCard label="Lotes" value={stats.totalLots} unit="ud." icon={Home} colorClass="text-slate-900" delay="delay-100" />
                        <MetricCard label="Efic." value={Math.round(stats.efficiency * 100)} unit="%" icon={Layers} colorClass="text-blue-600" delay="delay-150" />
                        <MetricCard label="Vendible" value={Math.round(stats.netSellableArea).toLocaleString()} unit="m²" icon={MapIcon} colorClass="text-slate-900" delay="delay-200" />
                        <MetricCard label="Verdes" value={Math.round(stats.parkArea).toLocaleString()} unit="m²" icon={TreePine} colorClass="text-emerald-600" delay="delay-300" />
                    </div>
                </section>

                {/* Parameters */}
                <section className="animate-enter-up delay-200">
                    <h2 className="text-[9px] font-extrabold uppercase text-slate-400 tracking-[0.15em] mb-2.5 flex items-center gap-1.5">
                        <Settings2 size={12} /> Configuración
                    </h2>
                    
                    <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 shadow-inner">
                        <ConfigSlider 
                            label="Frente de Lote" 
                            value={config.lotWidth} min={6} max={20} step={0.5} unit="m"
                            onChange={(v: number) => updateConfig('lotWidth', v)}
                            onStart={onInteractStart}
                        />
                        <ConfigSlider 
                            label="Fondo de Lote" 
                            value={config.lotDepth} min={12} max={40} step={1} unit="m"
                            onChange={(v: number) => updateConfig('lotDepth', v)}
                            onStart={onInteractStart}
                        />
                        <ConfigSlider 
                            label="Ancho Vialidad" 
                            value={config.roadWidth} min={8} max={25} step={1} unit="m"
                            onChange={(v: number) => updateConfig('roadWidth', v)}
                            onStart={onInteractStart}
                        />
                        <ConfigSlider 
                            label="% Donación" 
                            value={config.parkPercentage} min={5} max={40} step={1} unit="%"
                            onChange={(v: number) => updateConfig('parkPercentage', v)}
                            onStart={onInteractStart}
                        />
                        <ConfigSlider 
                            label="Niveles" 
                            value={config.stories} min={1} max={6} step={1} unit="pisos"
                            onChange={(v: number) => updateConfig('stories', v)}
                            onStart={onInteractStart}
                        />
                    </div>
                </section>

                {/* Access */}
                <section className="animate-enter-up delay-300">
                     <h2 className="text-[9px] font-extrabold uppercase text-slate-400 tracking-[0.15em] mb-2.5 flex items-center gap-1.5">
                        <Car size={12} /> Accesos
                    </h2>
                    <div className="bg-slate-50/50 p-2 rounded-2xl border border-slate-100">
                        <button 
                            onClick={() => {
                                onInteractStart();
                                updateConfig('entryIndex', config.entryIndex + 1);
                            }}
                            disabled={stats.possibleEntrances <= 1}
                            className="btn-interactive w-full flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-400 hover:shadow-sm group disabled:opacity-50"
                        >
                            <div className="flex items-center gap-2">
                                <RefreshCw size={14} className="text-slate-400 group-hover:text-blue-600 transition-colors"/>
                                <span className="text-[10px] font-bold text-slate-600 group-hover:text-slate-900">Rotar Acceso</span>
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded group-hover:bg-blue-50 group-hover:text-blue-600">
                                Opción {config.entryIndex % Math.max(1, stats.possibleEntrances) + 1}
                            </span>
                        </button>
                    </div>
                </section>
            </div>

            {/* Footer / Logout */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-[1.5rem] shrink-0 animate-enter-up delay-300">
                <button 
                    onClick={onLogout}
                    className="btn-interactive w-full flex items-center justify-center gap-2 p-3 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl hover:bg-rose-100 hover:border-rose-200 transition-colors"
                >
                    <LogOut size={16} /> Salir de la Plataforma
                </button>
            </div>

        </div>
    </>
  );
};
