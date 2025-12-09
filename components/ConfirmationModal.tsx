
import React from 'react';
import { AlertTriangle, Trash2, LogOut, CheckCircle2, X, AlertCircle } from 'lucide-react';

export type ConfirmType = 'danger' | 'warning' | 'info';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmType;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  type = 'info',
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  // Visual Configuration based on Type
  const config = {
    danger: {
      icon: Trash2,
      color: 'text-rose-500',
      bg: 'bg-rose-100',
      border: 'border-rose-200',
      buttonBg: 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/30',
      iconBg: 'bg-rose-50',
    },
    warning: {
      icon: LogOut,
      color: 'text-amber-500',
      bg: 'bg-amber-100',
      border: 'border-amber-200',
      buttonBg: 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/30',
      iconBg: 'bg-amber-50',
    },
    info: {
      icon: AlertCircle,
      color: 'text-blue-500',
      bg: 'bg-blue-100',
      border: 'border-blue-200',
      buttonBg: 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/30',
      iconBg: 'bg-blue-50',
    }
  };

  const currentConfig = config[type];
  const Icon = currentConfig.icon;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      {/* Backdrop with Blur */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity duration-300"
        onClick={onCancel}
      ></div>

      {/* Modal Card */}
      <div className="relative bg-white/95 backdrop-blur-xl w-full max-w-[380px] rounded-[2rem] shadow-2xl border border-white/50 p-6 flex flex-col items-center text-center animate-enter-scale overflow-hidden">
        
        {/* Decorative Background Glow */}
        <div className={`absolute top-0 left-0 w-full h-32 opacity-20 bg-gradient-to-b ${type === 'danger' ? 'from-rose-400' : type === 'warning' ? 'from-amber-400' : 'from-blue-400'} to-transparent pointer-events-none`}></div>

        {/* Animated Icon */}
        <div className={`relative mb-5 p-4 rounded-full ${currentConfig.iconBg} ${currentConfig.color} shadow-lg ring-4 ring-white animate-enter-up`}>
          <Icon size={32} strokeWidth={2.5} />
        </div>

        {/* Content */}
        <h3 className="text-xl font-black text-slate-800 mb-2 leading-tight">
          {title}
        </h3>
        <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed px-2">
          {message}
        </p>

        {/* Actions */}
        <div className="flex gap-3 w-full">
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 hover:text-slate-700 transition-colors text-sm"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3.5 rounded-xl font-bold text-white shadow-lg transition-all transform active:scale-95 text-sm ${currentConfig.buttonBg}`}
          >
            {confirmText}
          </button>
        </div>

      </div>
    </div>
  );
};
