
import React from 'react';
import { VideoCard } from '../types';
import { Trash2, RotateCcw, Youtube, Info } from 'lucide-react';

interface TrashViewProps {
  cards: VideoCard[];
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
}

const TrashView: React.FC<TrashViewProps> = ({ cards, onRestore, onPermanentDelete }) => {
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <Trash2 size={64} strokeWidth={1} className="mb-4 opacity-10" />
        <h3 className="text-lg font-bold">Trash is Empty</h3>
        <p className="text-sm">Deleted ideas will stay here for 14 days.</p>
      </div>
    );
  }

  return (
    <div className="p-8 h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Trash Bin</h2>
            <p className="text-sm text-slate-500 font-medium">Items here are automatically deleted after 14 days.</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex gap-3 text-amber-700 max-w-sm">
            <Info size={18} className="shrink-0" />
            <p className="text-[11px] font-medium leading-relaxed">
              Restoring an item will move it back to its original production stage.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map(card => {
             const deletedAt = card.deletedDate ? new Date(card.deletedDate) : new Date();
             const daysRemaining = Math.max(0, 14 - Math.floor((new Date().getTime() - deletedAt.getTime()) / (1000 * 3600 * 24)));

             return (
              <div key={card.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group hover:border-rose-200 transition-all opacity-80 hover:opacity-100">
                <div className="p-5 flex-1">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {card.originalStatus || 'Backlog'}
                    </span>
                    <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-1 rounded-md">
                      {daysRemaining} Days Left
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-700 leading-tight mb-4">{card.title}</h3>
                </div>
                <div className="bg-slate-50 p-3 flex items-center justify-between border-t border-slate-100">
                  <button onClick={() => onRestore(card.id)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800">
                    <RotateCcw size={14} /> Restore
                  </button>
                  <button onClick={() => onPermanentDelete(card.id)} className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-rose-600">
                    <Trash2 size={14} /> Delete Forever
                  </button>
                </div>
              </div>
             );
          })}
        </div>
      </div>
    </div>
  );
};

export default TrashView;
