
import React, { useState } from 'react';
import { X, Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Save } from 'lucide-react';
import { StageConfig } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stages: StageConfig[];
  onUpdateStages: (stages: StageConfig[]) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, stages, onUpdateStages }) => {
  const [localStages, setLocalStages] = useState<StageConfig[]>([...stages]);

  if (!isOpen) return null;

  const handleAddStage = () => {
    const newStage: StageConfig = {
      id: crypto.randomUUID(),
      label: 'New Stage',
      isDeletable: true
    };
    setLocalStages([...localStages, newStage]);
  };

  const handleRemoveStage = (id: string) => {
    setLocalStages(localStages.filter(s => s.id !== id));
  };

  const handleMoveStage = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 1) { // Index 0 is fixed Backlog
      const newStages = [...localStages];
      [newStages[index], newStages[index - 1]] = [newStages[index - 1], newStages[index]];
      setLocalStages(newStages);
    } else if (direction === 'down' && index < localStages.length - 1 && index > 0) {
      const newStages = [...localStages];
      [newStages[index], newStages[index + 1]] = [newStages[index + 1], newStages[index]];
      setLocalStages(newStages);
    }
  };

  const handleLabelChange = (id: string, label: string) => {
    setLocalStages(localStages.map(s => s.id === id ? { ...s, label } : s));
  };

  const handleSave = () => {
    onUpdateStages(localStages);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
              <GripVertical size={20} />
            </div>
            <div>
              <h2 className="font-bold text-lg">Board Workflow Settings</h2>
              <p className="text-xs text-slate-500">Customize your production pipeline stages</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Pipeline Order (Backlog to Archive)</p>
          
          {localStages.map((stage, index) => (
            <div 
              key={stage.id} 
              className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${!stage.isDeletable ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200 hover:border-indigo-200 shadow-sm'}`}
            >
              <div className="flex flex-col gap-1">
                {stage.isDeletable && (
                  <>
                    <button 
                      onClick={() => handleMoveStage(index, 'up')}
                      disabled={index <= 1}
                      className="text-slate-300 hover:text-indigo-600 disabled:opacity-20"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button 
                      onClick={() => handleMoveStage(index, 'down')}
                      disabled={index === localStages.length - 1}
                      className="text-slate-300 hover:text-indigo-600 disabled:opacity-20"
                    >
                      <ChevronDown size={16} />
                    </button>
                  </>
                )}
                {!stage.isDeletable && <GripVertical size={16} className="text-slate-300 mx-auto" />}
              </div>

              <input 
                type="text" 
                value={stage.label} 
                onChange={(e) => handleLabelChange(stage.id, e.target.value)}
                disabled={!stage.isDeletable}
                className={`flex-1 text-sm font-semibold outline-none bg-transparent ${!stage.isDeletable ? 'text-slate-400' : 'text-slate-700'}`}
              />

              {stage.isDeletable && (
                <button 
                  onClick={() => handleRemoveStage(stage.id)}
                  className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}

          <button 
            onClick={handleAddStage}
            className="w-full py-4 mt-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/30 transition-all"
          >
            <Plus size={16} /> Add Custom Stage
          </button>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">Discard</button>
          <button onClick={handleSave} className="bg-slate-900 text-white px-10 py-2.5 rounded-xl font-bold shadow-lg hover:bg-black transition-all active:scale-95 flex items-center gap-2">
            <Save size={18} /> Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
