
import React, { useRef } from 'react';
import { VideoCard, WorkflowStage, FunnelStage, StageConfig } from '../types';
import VideoCardItem from './VideoCard';
import { Plus, Filter, MoreHorizontal, Layout } from 'lucide-react';

interface KanbanBoardProps {
  stages: StageConfig[];
  cards: VideoCard[];
  onMoveCard: (id: string, newStatus: WorkflowStage) => void;
  onSelectCard: (id: string) => void;
  onAddAtStage: (stage: WorkflowStage) => void;
  onArchiveCard?: (id: string) => void;
  funnelFilter?: FunnelStage;
  onFunnelFilterChange: (stage: FunnelStage | undefined) => void;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({ 
  stages,
  cards, 
  onMoveCard, 
  onSelectCard, 
  onAddAtStage, 
  onArchiveCard,
  funnelFilter,
  onFunnelFilterChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent, statusLabel: string) => {
    const cardId = e.dataTransfer.getData('cardId');
    onMoveCard(cardId, statusLabel);
  };

  return (
    <div className="h-full flex flex-col relative overflow-hidden bg-slate-50/50">
      <div 
        ref={containerRef}
        className="flex-1 flex overflow-x-auto overflow-y-hidden p-6 gap-6 items-start custom-scrollbar"
      >
        {stages.map((stage, index) => {
          let stageCards = cards.filter(c => c.status === stage.label);
          const isBacklog = index === 0;
          const isFinalStage = index === stages.length - 1;
          
          if (isBacklog && funnelFilter) {
            stageCards = stageCards.filter(c => c.funnelStage === funnelFilter);
          }
          
          return (
            <div 
              key={stage.id}
              className="flex-shrink-0 w-72 flex flex-col max-h-full"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage.label)}
            >
              {/* Column Header */}
              <div className="flex flex-col mb-4 bg-white rounded-2xl border border-slate-200 shadow-sm sticky top-0 z-10 shrink-0 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className={`w-2 h-2 rounded-full ${isBacklog ? 'bg-indigo-400' : isFinalStage ? 'bg-emerald-400' : 'bg-slate-300'}`}></div>
                    <h3 className="font-extrabold text-[10px] uppercase tracking-widest text-slate-600 truncate">{stage.label}</h3>
                    <span className="bg-slate-50 text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded-lg border border-slate-100 shrink-0">
                      {stageCards.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {!isBacklog && (
                      <button onClick={() => onAddAtStage(stage.label)} className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors shrink-0">
                        <Plus size={16} />
                      </button>
                    )}
                    <button className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-300 transition-colors">
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                </div>

                {/* Localized Filter for Idea Backlog */}
                {isBacklog && (
                  <div className="px-4 py-2 bg-indigo-50/30 flex items-center gap-3 border-t border-slate-50">
                    <Filter size={12} className="text-indigo-400 shrink-0" />
                    <select 
                      className="w-full text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-transparent border-none focus:ring-0 p-0 cursor-pointer"
                      value={funnelFilter || ''}
                      onChange={(e) => onFunnelFilterChange(e.target.value as FunnelStage || undefined)}
                    >
                      <option value="">All Funnels</option>
                      <option value={FunnelStage.TOF}>TOF: Top of Funnel</option>
                      <option value={FunnelStage.MOF}>MOF: Middle</option>
                      <option value={FunnelStage.BOF}>BOF: Conversion</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Column Content */}
              <div className="flex-1 overflow-y-auto min-h-[200px] flex flex-col gap-4 pb-12 pr-1.5 custom-scrollbar">
                {stageCards.length === 0 ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-3xl py-12 flex flex-col items-center justify-center text-slate-400 bg-white/40 group hover:border-indigo-200 transition-colors">
                    <Layout size={32} className="mb-2 opacity-5 group-hover:opacity-10 transition-opacity" />
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-20 text-center">
                      {funnelFilter ? `No ${funnelFilter} Items` : 'Drag items here'}
                    </span>
                  </div>
                ) : (
                  stageCards.map(card => (
                    <VideoCardItem 
                      key={card.id} 
                      card={card} 
                      onSelect={() => onSelectCard(card.id)} 
                      onArchive={isFinalStage ? onArchiveCard : undefined}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
        <div className="flex-shrink-0 w-24 h-1" />
      </div>
    </div>
  );
};

export default KanbanBoard;
