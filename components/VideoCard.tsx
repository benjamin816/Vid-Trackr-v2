
import React from 'react';
import { VideoCard } from '../types';
import { FUNNEL_CONFIG } from '../constants';
import { Clock, MapPin, Camera, ExternalLink, ListTodo, MoreHorizontal, Video } from 'lucide-react';

interface VideoCardItemProps {
  card: VideoCard;
  onSelect: () => void;
  onArchive?: (id: string) => void;
}

const VideoCardItem: React.FC<VideoCardItemProps> = ({ card, onSelect, onArchive }) => {
  const funnel = FUNNEL_CONFIG[card.funnelStage];
  
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('cardId', card.id);
  };

  const handleArchiveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onArchive) onArchive(card.id);
  };

  const completedTasks = card.checklist?.filter(i => i.completed).length || 0;
  const totalTasks = card.checklist?.length || 0;

  return (
    <div 
      draggable
      onDragStart={handleDragStart}
      onClick={onSelect}
      className="group bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 hover:border-indigo-400 transition-all cursor-pointer select-none active:scale-[0.98] ring-0 hover:ring-1 hover:ring-indigo-100"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md uppercase border ${funnel.color}`}>
            {funnel.label}
          </span>
          {card.thumbnailConceptUrl && (
            <div className="w-5 h-5 bg-indigo-50 rounded-md flex items-center justify-center text-indigo-400">
               <Video size={10} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {totalTasks > 0 && (
            <div className={`flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border ${completedTasks === totalTasks ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
              <ListTodo size={10} />
              <span>{completedTasks}/{totalTasks}</span>
            </div>
          )}
          <MoreHorizontal size={14} className="text-slate-300 group-hover:text-slate-500" />
        </div>
      </div>

      <h4 className="font-bold text-sm text-slate-800 leading-[1.4] mb-4 group-hover:text-indigo-600 transition-colors">
        {card.title}
      </h4>

      <div className="space-y-2.5">
        {card.neighborhood && (
          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold tracking-tight truncate">
            <MapPin size={12} className="text-slate-300" />
            <span className="truncate">{card.neighborhood}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-tight">
          <Clock size={12} className="text-slate-300" />
          <span>{card.targetRuntime}m Est.</span>
        </div>

        {card.targetShootDate && (
          <div className="flex items-center gap-2 text-[10px] text-indigo-600 font-extrabold bg-indigo-50 px-2 py-1 rounded-lg inline-flex">
            <Camera size={12} className="text-indigo-400" />
            <span>{new Date(card.targetShootDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          </div>
        )}
      </div>

      <div className="mt-5 pt-3 border-t border-slate-50 flex items-center justify-between">
        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">
          {card.formatType}
        </span>
        <div className="flex gap-2.5 items-center">
           {card.notes && <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" title="Has script notes"></div>}
           {card.externalDocs?.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-blue-400" title="Has documents"></div>}
           {card.youtubeLink && <ExternalLink size={12} className="text-slate-300 hover:text-indigo-500" />}
        </div>
      </div>

      {onArchive && (
        <button 
          onClick={handleArchiveClick}
          className="mt-4 w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-extrabold py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-100"
        >
          POST & ARCHIVE
        </button>
      )}
    </div>
  );
};

export default VideoCardItem;
