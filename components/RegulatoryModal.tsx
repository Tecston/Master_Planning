
import React from 'react';
import { X, CheckCircle2, AlertTriangle, BookOpen, FileText, Download, Scale, Building2, ExternalLink } from 'lucide-react';
import { ProjectStats, SiteConfig } from '../types';

interface RegulatoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: ProjectStats;
  config: SiteConfig;
}

interface RegulationItem {
  category: string;
  concept: string;
  standard: string;
  value: string | number;
  isCompliant: boolean;
  article: string;
  description: string;
}

export const RegulatoryModal: React.FC<RegulatoryModalProps> = ({ isOpen, onClose, stats, config }) => {
  if (!isOpen) return null;

  // Analysis Logic (Mocked Standards vs Current Config)
  const regulations: RegulationItem[] = [
    {
      category: 'Vialidad y Movilidad',
      concept: 'Sección Vial Mínima',
      standard: 'Min. 12.00 m',
      value: `${config.roadWidth.toFixed(2)} m`,
      isCompliant: config.roadWidth >= 12,
      article: 'Art. 134 - Ley de Movilidad',
      description: 'Ancho mínimo requerido para vialidades secundarias incluyendo banquetas y arroyo vehicular.'
    },
    {
      category: 'Equipamiento y Donación',
      concept: 'Área de Donación Municipal',
      standard: 'Min. 15%',
      value: `${((stats.parkArea / stats.siteArea) * 100).toFixed(1)}%`,
      isCompliant: (stats.parkArea / stats.siteArea) * 100 >= 15,
      article: 'Art. 42 - Ley de Asentamientos Humanos',
      description: 'Superficie de terreno destinada a equipamiento urbano, parques y jardines de libre acceso.'
    },
    {
      category: 'Zonificación',
      concept: 'Frente Mínimo de Lote',
      standard: 'Min. 7.00 m',
      value: `${config.lotWidth.toFixed(2)} m`,
      isCompliant: config.lotWidth >= 7,
      article: 'Art. 28 - Reglamento de Zonificación',
      description: 'Dimensión frontal mínima para lotes habitacionales unifamiliares de densidad media.'
    },
    {
      category: 'Zonificación',
      concept: 'Superficie Mínima de Lote',
      standard: 'Min. 90.00 m²',
      value: `${(config.lotWidth * config.lotDepth).toFixed(2)} m²`,
      isCompliant: (config.lotWidth * config.lotDepth) >= 90,
      article: 'Art. 29 - Reglamento de Zonificación',
      description: 'Área privativa mínima permitida por unidad de vivienda.'
    },
    {
      category: 'Densidad',
      concept: 'Eficiencia de Suelo Vendible',
      standard: 'Max. 70%',
      value: `${(stats.efficiency * 100).toFixed(1)}%`,
      isCompliant: stats.efficiency <= 0.70, // Usually cities want to ensure enough public space, so too high efficiency might be flagged or purely dependent on developer goals. Here strictly regulatory implies limits on density.
      article: 'Criterio Técnico Municipal 04',
      description: 'Proporción máxima de área vendible respecto al área total del predio para garantizar habitabilidad.'
    }
  ];

  const compliantCount = regulations.filter(r => r.isCompliant).length;
  const totalCount = regulations.length;
  const overallStatus = compliantCount === totalCount ? 'VIABLE' : 'OBSERVACIONES';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>

      {/* Modal Content */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-100">
        
        {/* Header */}
        <div className="bg-slate-50 border-b border-slate-200 p-6 flex justify-between items-start">
            <div className="flex gap-4">
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                    <Scale size={24} strokeWidth={2.5} />
                </div>
                <div>
                    <h2 className="text-xl font-extrabold text-slate-900">Marco Normativo y Legal</h2>
                    <p className="text-sm text-slate-500 font-medium mt-1">Sustento jurídico para trámite de licencias y permisos.</p>
                </div>
            </div>
            <button 
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
            >
                <X size={24} />
            </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar">
            
            {/* Status Banner */}
            <div className={`rounded-2xl p-4 mb-8 flex items-center gap-4 border ${overallStatus === 'VIABLE' ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${overallStatus === 'VIABLE' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                    {overallStatus === 'VIABLE' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                </div>
                <div className="flex-1">
                    <h3 className={`text-sm font-bold uppercase tracking-wider ${overallStatus === 'VIABLE' ? 'text-emerald-800' : 'text-amber-800'}`}>
                        Estado del Dictamen: {overallStatus}
                    </h3>
                    <p className={`text-xs font-medium mt-0.5 ${overallStatus === 'VIABLE' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        La propuesta cumple con {compliantCount} de {totalCount} criterios normativos analizados.
                    </p>
                </div>
                <button className="hidden sm:flex items-center gap-2 bg-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 transition-all">
                    <Download size={14} /> Descargar Cédula
                </button>
            </div>

            {/* Regulations Table */}
            <div className="space-y-6">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <BookOpen size={16} className="text-blue-500"/> Análisis de Cumplimiento Normativo
                </h3>
                
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Concepto / Referencia</th>
                                <th className="px-6 py-4 text-center">Norma</th>
                                <th className="px-6 py-4 text-center">Propuesta</th>
                                <th className="px-6 py-4 text-center">Estatus</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {regulations.map((reg, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-800">{reg.concept}</div>
                                        <div className="text-xs text-blue-600 font-medium mt-1 flex items-center gap-1">
                                            <FileText size={10} /> {reg.article}
                                        </div>
                                        <div className="text-[10px] text-slate-400 mt-1 max-w-xs leading-relaxed">
                                            {reg.description}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-md text-xs font-bold border border-slate-200">
                                            {reg.standard}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center font-mono text-slate-700 font-medium">
                                        {reg.value}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {reg.isCompliant ? (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                                                <CheckCircle2 size={12} /> CUMPLE
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold border border-rose-200">
                                                <AlertTriangle size={12} /> REVISAR
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Additional Resources */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div 
                    onClick={() => window.open('https://www.implanhermosillo.gob.mx/', '_blank')}
                    className="p-5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-blue-200 transition-all cursor-pointer group"
                    title="Abrir mapa en nueva pestaña"
                 >
                    <div className="flex items-start justify-between mb-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                            <Building2 size={16} />
                        </div>
                        <ExternalLink size={14} className="text-slate-300 group-hover:text-blue-400" />
                    </div>
                    <h4 className="font-bold text-slate-800 text-sm">Plan de Desarrollo Urbano</h4>
                    <p className="text-xs text-slate-500 mt-1">Consulta el mapa oficial de zonificación y usos de suelo del municipio.</p>
                 </div>
                 <div 
                    onClick={() => window.open('https://www.implanhermosillo.gob.mx/marco-normativo/', '_blank')}
                    className="p-5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-blue-200 transition-all cursor-pointer group"
                    title="Ver reglamento completo"
                 >
                    <div className="flex items-start justify-between mb-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                            <BookOpen size={16} />
                        </div>
                        <ExternalLink size={14} className="text-slate-300 group-hover:text-indigo-400" />
                    </div>
                    <h4 className="font-bold text-slate-800 text-sm">Reglamento de Construcción</h4>
                    <p className="text-xs text-slate-500 mt-1">Normas técnicas complementarias para diseño estructural y arquitectónico.</p>
                 </div>
            </div>

        </div>

        {/* Footer */}
        <div className="p-5 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
             <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-200 transition-colors">
                Cerrar
             </button>
             <button className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2">
                <FileText size={16} /> Generar Reporte PDF
             </button>
        </div>

      </div>
    </div>
  );
};
