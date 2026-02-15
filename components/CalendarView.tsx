
import React, { useState, useMemo } from 'react';
import { VideoCard, CalendarMode } from '../types';
import { ChevronLeft, ChevronRight, Camera, Rocket, Clock } from 'lucide-react';
import VideoCardItem from './VideoCard';

interface CalendarViewProps {
  cards: VideoCard[];
  onSelectCard: (id: string) => void;
  onReschedule: (id: string, date: string, type: 'shoot' | 'publish') => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({ cards, onSelectCard, onReschedule }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [mode, setMode] = useState<CalendarMode>('month');

  const formatDateKey = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const calendarData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (mode === 'month') {
      const firstDayOfMonth = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const prevMonthLastDay = new Date(year, month, 0).getDate();
      
      const prevMonthDays = Array.from({ length: firstDayOfMonth }, (_, i) => {
        const d = new Date(year, month - 1, prevMonthLastDay - (firstDayOfMonth - 1 - i));
        return { date: d, isCurrentMonth: false };
      });
      const currentMonthDays = Array.from({ length: daysInMonth }, (_, i) => {
        const d = new Date(year, month, i + 1);
        return { date: d, isCurrentMonth: true };
      });
      const totalSoFar = prevMonthDays.length + currentMonthDays.length;
      const nextMonthPadding = (42 - totalSoFar);
      const nextMonthDays = Array.from({ length: nextMonthPadding }, (_, i) => {
        const d = new Date(year, month + 1, i + 1);
        return { date: d, isCurrentMonth: false };
      });
      return [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];
    } else if (mode === 'week') {
      const dayOfWeek = currentDate.getDay();
      const sunday = new Date(currentDate);
      sunday.setDate(currentDate.getDate() - dayOfWeek);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(sunday);
        d.setDate(sunday.getDate() + i);
        return { date: d, isCurrentMonth: true };
      });
    } else {
      return [{ date: new Date(currentDate), isCurrentMonth: true }];
    }
  }, [currentDate, mode]);

  const handleNavigate = (direction: 'prev' | 'next') => {
    const next = new Date(currentDate);
    if (mode === 'month') next.setMonth(currentDate.getMonth() + (direction === 'next' ? 1 : -1));
    else if (mode === 'week') next.setDate(currentDate.getDate() + (direction === 'next' ? 7 : -7));
    else next.setDate(currentDate.getDate() + (direction === 'next' ? 1 : -1));
    setCurrentDate(next);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('cardId');
    const type = e.dataTransfer.getData('dragType') as 'shoot' | 'publish';
    if (!id || !type) return;
    onReschedule(id, formatDateKey(date), type);
  };

  const yearLabel = currentDate.getFullYear();
  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      <div className="flex items-center justify-between p-4 shrink-0 border-b border-slate-100">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <h2 className="text-lg font-bold text-slate-800 leading-none">
              {mode === 'day' ? currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : `${monthName} ${yearLabel}`}
            </h2>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{mode} view</span>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button onClick={() => handleNavigate('prev')} className="p-1 hover:bg-white rounded-lg text-slate-600 transition-all"><ChevronLeft size={16}/></button>
            <button onClick={() => setCurrentDate(new Date())} className="px-3 text-[10px] font-bold text-slate-500 uppercase">Today</button>
            <button onClick={() => handleNavigate('next')} className="p-1 hover:bg-white rounded-lg text-slate-600 transition-all"><ChevronRight size={16}/></button>
          </div>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner">
          {(['month', 'week', 'day'] as CalendarMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${mode === m ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>{m}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/20">
        <div className={`grid ${mode === 'day' ? 'grid-cols-1' : 'grid-cols-7'} h-full border-slate-100`}>
          {mode === 'month' && ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="p-2 bg-white text-[10px] font-bold text-slate-400 uppercase text-center border-b border-r border-slate-100 sticky top-0 z-10">{day}</div>
          ))}

          {calendarData.map(({ date, isCurrentMonth }, idx) => {
            const dateStr = formatDateKey(date);
            const shootCards = cards.filter(c => c.targetShootDate === dateStr);
            const publishCards = cards.filter(c => c.targetPublishDate === dateStr);
            const isToday = formatDateKey(new Date()) === dateStr;

            return (
              <div 
                key={idx} 
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, date)}
                className={`min-h-[120px] p-2 border-r border-b border-slate-100 flex flex-col transition-colors relative
                  ${!isCurrentMonth && mode === 'month' ? 'bg-slate-50/50 opacity-40' : 'bg-white'}
                  ${mode === 'day' ? 'min-h-full p-8' : ''}
                  ${mode === 'week' ? 'min-h-full bg-white border-t border-slate-100' : ''}
                  ${isToday ? 'bg-indigo-50/30 ring-1 ring-inset ring-indigo-100' : ''}
                `}
              >
                <div className="flex flex-col mb-4">
                  {(mode === 'week' || mode === 'day') && (
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      {date.toLocaleDateString(undefined, { weekday: 'long' })}
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] font-bold flex items-center justify-center ${isToday ? 'bg-indigo-600 text-white w-6 h-6 rounded-full shadow-sm' : 'text-slate-700'}`}>
                      {date.getDate()}
                    </span>
                    {(mode === 'week' || mode === 'day') && (
                      <span className="text-[11px] font-bold text-slate-400 uppercase">
                        {date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>

                <div className={`flex flex-col gap-2 ${mode !== 'month' ? 'max-w-xl mx-auto w-full' : 'overflow-hidden'}`}>
                  {mode === 'day' || mode === 'week' ? (
                    <div className="space-y-4">
                      {[...shootCards, ...publishCards].map(card => (
                        <div key={card.id} className="transform hover:translate-y-[-2px] transition-transform">
                          <VideoCardItem card={card} onSelect={() => onSelectCard(card.id)} />
                        </div>
                      ))}
                      {(shootCards.length === 0 && publishCards.length === 0) && (
                        <div className="py-24 flex flex-col items-center justify-center opacity-10 text-center">
                          <Clock size={48} className="mb-2" />
                          <p className="font-bold uppercase tracking-widest text-[10px]">No Activity</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {shootCards.map(card => (
                        <button key={card.id} onClick={() => onSelectCard(card.id)} className="text-[9px] p-1 rounded-md border border-blue-100 bg-blue-50 text-blue-700 truncate font-bold flex items-center gap-1 shrink-0"><Camera size={10}/> {card.title}</button>
                      ))}
                      {publishCards.map(card => (
                        <button key={card.id} onClick={() => onSelectCard(card.id)} className="text-[9px] p-1 rounded-md border border-emerald-100 bg-emerald-50 text-emerald-700 truncate font-bold flex items-center gap-1 shrink-0"><Rocket size={10}/> {card.title}</button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CalendarView;
