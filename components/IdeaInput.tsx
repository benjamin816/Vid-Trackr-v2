
import React, { useState } from 'react';
import { X, Send, Layers, Trash2, Sparkles } from 'lucide-react';
import { VideoCard, WorkflowStage } from '../types';
import { categorizeIdea } from '../utils/categorizer';

interface IdeaInputProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (cards: VideoCard[]) => void;
  defaultStatus?: WorkflowStage;
}

const IdeaInput: React.FC<IdeaInputProps> = ({ isOpen, onClose, onAdd, defaultStatus }) => {
  const [inputText, setInputText] = useState('');
  const [mode, setMode] = useState<'single' | 'bulk'>('single');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    let ideasToProcess = [inputText.trim()];
    if (mode === 'bulk') {
      ideasToProcess = inputText.split('\n').filter(line => line.trim() !== '');
    }

    const newCards = ideasToProcess.map(idea => {
      const card = categorizeIdea(idea) as VideoCard;
      if (defaultStatus) {
        card.status = defaultStatus;
        // Fix: Replaced WorkflowStage.PublishedAnalyticsReview (type used as value) with string literal 'Posted'
        if (defaultStatus === 'Posted') {
          card.isArchived = true;
          card.actualPublishDate = new Date().toISOString();
        }
      }
      return card;
    });

    onAdd(newCards);
    setInputText('');
    onClose();
  };

  const handleDiscard = () => {
    setInputText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
              <Layers size={20} />
            </div>
            <div>
              <h2 className="font-bold text-lg">Add to {defaultStatus || 'Pipeline'}</h2>
              <p className="text-xs text-slate-500">Auto-tagging will apply to each idea</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={handleDiscard} 
              className="p-2 hover:bg-rose-50 rounded-full text-slate-400 hover:text-rose-500 transition-colors"
              title="Discard & Close"
            >
              <Trash2 size={20} />
            </button>
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg mb-4">
            <button 
              onClick={() => setMode('single')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${mode === 'single' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
            >
              Single Idea
            </button>
            <button 
              onClick={() => setMode('bulk')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${mode === 'bulk' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
            >
              Bulk Import
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                {mode === 'single' ? 'What is the video idea?' : 'Paste a list of ideas (one per line)'}
              </label>
              {mode === 'single' ? (
                <input 
                  autoFocus
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="e.g. Touring The Preserve in Wake Forest"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                />
              ) : (
                <textarea 
                  autoFocus
                  rows={8}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Touring Apex NC&#10;Everything to know about Durham&#10;The Preserve in Wake Forest..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none resize-none"
                />
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium">
                <Sparkles size={14} />
                <span>AI Categorizer Active</span>
              </div>
              <div className="flex gap-3">
                 <button 
                  type="button"
                  onClick={handleDiscard}
                  className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-rose-500 transition-colors"
                >
                  Discard
                </button>
                <button 
                  type="submit"
                  disabled={!inputText.trim()}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-indigo-100"
                >
                  Add to Pipeline <Send size={16} />
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default IdeaInput;
