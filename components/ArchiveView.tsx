
import React from 'react';
import { VideoCard } from '../types';
import { RotateCcw, Youtube, ExternalLink } from 'lucide-react';
import { FUNNEL_CONFIG } from '../constants';

interface ArchiveViewProps {
  cards: VideoCard[];
  onSelectCard: (id: string) => void;
  onUnarchive: (id: string) => void;
}

const ArchiveView: React.FC<ArchiveViewProps> = ({ cards, onSelectCard, onUnarchive }) => {
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <Youtube size={64} strokeWidth={1} className="mb-4 opacity-20" />
        <h3 className="text-lg font-bold">No Published Videos Yet</h3>
        <p className="text-sm">When you move a card to "Published", it will appear here.</p>
      </div>
    );
  }

  return (
    <div className="p-8 h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Published Archive</h2>
          <p className="text-sm text-slate-500 font-medium">Historical record of all content produced for this funnel.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map(card => {
             const funnel = FUNNEL_CONFIG[card.funnelStage];
             return (
              <div key={card.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:border-indigo-200 transition-all">
                <div className="p-5 flex-1">
                  <div className="flex items-center justify-between mb-4">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md border ${funnel.color}`}>
                      {funnel.label}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                      {card.actualPublishDate ? new Date(card.actualPublishDate).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  
                  <h3 className="font-bold text-slate-800 leading-tight mb-4">{card.title}</h3>
                  
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded uppercase tracking-wider">
                      {card.formatType}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 flex items-center justify-between border-t border-slate-100">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => onSelectCard(card.id)}
                      className="text-[11px] font-bold text-slate-500 hover:text-slate-800 transition-colors"
                    >
                      View Details
                    </button>
                    {card.youtubeLink && (
                      <a 
                        href={card.youtubeLink} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                      >
                        Watch <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  
                  <button 
                    onClick={() => onUnarchive(card.id)}
                    title="Move back to Idea Backlog"
                    className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                  >
                    <RotateCcw size={16} />
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

export default ArchiveView;
