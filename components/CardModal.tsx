
import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Trash2, 
  Save, 
  Clock, 
  MapPin, 
  Calendar, 
  FileText,
  Activity,
  Sparkles,
  Youtube,
  Plus,
  Loader2,
  ExternalLink,
  CheckCircle2,
  Circle,
  ImageIcon,
  Search as SearchIcon
} from 'lucide-react';
import { VideoCard, WorkflowStage, FunnelStage, ChecklistItem, GroundingSource, StageConfig } from '../types';
import { FUNNEL_CONFIG } from '../constants';
import { GoogleGenAI } from "@google/genai";

const getApiKey = () => process.env.API_KEY || null;

interface CardModalProps {
  card: VideoCard;
  stages: StageConfig[];
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (card: VideoCard) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
}

const CardModal: React.FC<CardModalProps> = ({ card, stages, isOpen, onClose, onUpdate, onDelete, onArchive }) => {
  const [edited, setEdited] = useState<VideoCard>({ 
    ...card,
    inspirationLinks: [...(card.inspirationLinks || [])].slice(0, 3),
    checklist: card.checklist || [],
    groundingSources: card.groundingSources || []
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);
  const [fetchingIndices, setFetchingIndices] = useState<Set<number>>(new Set());
  const fetchedUrls = useRef<Set<string>>(new Set());
  const [newChecklistItem, setNewChecklistItem] = useState('');

  useEffect(() => {
    edited.inspirationLinks.forEach((link, index) => {
      const url = link.url.trim();
      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
      if (url && isYouTube && !link.title && !fetchingIndices.has(index) && !fetchedUrls.current.has(url)) {
        autoFetchMetadata(index, url);
      }
    });
  }, [edited.inspirationLinks]);

  const autoFetchMetadata = async (index: number, url: string) => {
    const apiKey = getApiKey();
    if (!apiKey) return;
    
    setFetchingIndices(prev => new Set(prev).add(index));
    fetchedUrls.current.add(url);
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Find the exact video title and a thumbnail URL for this YouTube video: ${url}. Return ONLY a JSON object: {"title": "String", "thumbnail": "String"}`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] }
      });
      
      const text = response.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        setEdited(prev => {
          const updated = [...prev.inspirationLinks];
          updated[index] = { ...updated[index], ...data };
          return { ...prev, inspirationLinks: updated };
        });
      }
    } catch (err) {
      console.error("AI Fetch Error:", err);
    } finally {
      setFetchingIndices(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const generateAIOutline = async () => {
    const apiKey = getApiKey();
    if (!apiKey) return;

    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Act as a high-end real estate YouTube producer. Create a comprehensive video outline for: "${edited.title}". 
      Funnel Stage: ${edited.funnelStage} (${FUNNEL_CONFIG[edited.funnelStage].name}). 
      Target Runtime: ${edited.targetRuntime} mins.
      Format: ${edited.formatType}. 
      Location: ${edited.neighborhood}.
      
      Include:
      1. High-retention Hook (0-60s)
      2. 4 core value points optimized for real estate lead gen.
      3. A transition to a soft-close CTA.
      4. Research current market data or neighborhood specifics for this area using Google Search.`;

      const response = await ai.models.generateContent({ 
        model: 'gemini-3-pro-preview', 
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] }
      });

      const extractedSources: GroundingSource[] = [];
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        chunks.forEach((chunk: any) => {
          if (chunk.web) {
            extractedSources.push({ title: chunk.web.title, uri: chunk.web.uri });
          }
        });
      }

      if (response.text) {
        setEdited(prev => ({ 
          ...prev, 
          notes: (prev.notes ? prev.notes + "\n\n" : "") + "### ✨ PRO PRODUCTION STRATEGY (AI Draft)\n" + response.text,
          groundingSources: [...prev.groundingSources, ...extractedSources]
        }));
      }
    } catch (err) {
      console.error("AI Outline Generation Error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateThumbnailConcept = async () => {
    const apiKey = getApiKey();
    if (!apiKey) return;
    setIsGeneratingThumbnail(true);
    try {
      const ai = new GoogleGenAI({ apiKey: apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: `A high-end, vibrant YouTube thumbnail for a real estate video. Title: "${edited.title}". The scene should feel aspirational, clean, and professional. 16:9 cinematic ratio.` }]
        },
        config: { imageConfig: { aspectRatio: "16:9" } }
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          setEdited(prev => ({ ...prev, thumbnailConceptUrl: imageUrl }));
          break;
        }
      }
    } catch (err) {
      console.error("Thumbnail Generation Error:", err);
    } finally {
      setIsGeneratingThumbnail(false);
    }
  };

  const addChecklistItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChecklistItem.trim()) return;
    const newItem: ChecklistItem = { id: crypto.randomUUID(), text: newChecklistItem.trim(), completed: false };
    setEdited(prev => ({ ...prev, checklist: [...prev.checklist, newItem] }));
    setNewChecklistItem('');
  };

  const toggleChecklistItem = (id: string) => {
    setEdited(prev => ({
      ...prev,
      checklist: prev.checklist.map(item => item.id === id ? { ...item, completed: !item.completed } : item)
    }));
  };

  const removeChecklistItem = (id: string) => {
    setEdited(prev => ({ ...prev, checklist: prev.checklist.filter(item => item.id !== id) }));
  };

  if (!isOpen) return null;

  const handleSave = () => { onUpdate(edited); onClose(); };
  const isFinalStage = edited.status === stages[stages.length - 1].label;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl flex flex-col max-h-[95vh] my-auto overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase border ${FUNNEL_CONFIG[edited.funnelStage].color}`}>
              {edited.funnelStage}
            </span>
            <div className="flex items-center gap-2 text-slate-400">
               <Activity size={14} />
               <span className="text-[10px] font-bold uppercase tracking-widest">{edited.status}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { onDelete(card.id); onClose(); }} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"><Trash2 size={20} /></button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors"><X size={20} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          <input 
            type="text" 
            className="w-full text-3xl font-bold text-slate-800 border-none bg-transparent focus:ring-0 px-0 mb-8 outline-none"
            value={edited.title}
            onChange={(e) => setEdited(prev => ({ ...prev, title: e.target.value }))}
            placeholder="Working Title..."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div className="md:col-span-2 space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Funnel & Format</label>
                  <div className="flex flex-col gap-2">
                    <select className="bg-slate-50 border border-slate-200 rounded-xl text-sm p-3 focus:ring-2 focus:ring-indigo-500 outline-none" value={edited.funnelStage} onChange={(e) => setEdited(prev => ({ ...prev, funnelStage: e.target.value as FunnelStage }))}>
                      {Object.values(FunnelStage).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select className="bg-slate-50 border border-slate-200 rounded-xl text-sm p-3 focus:ring-2 focus:ring-indigo-500 outline-none" value={edited.formatType} onChange={(e) => setEdited(prev => ({ ...prev, formatType: e.target.value }))}>
                      {FUNNEL_CONFIG[edited.funnelStage].formats.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Target Mins</label>
                    <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm p-3 outline-none" value={edited.targetRuntime} onChange={(e) => setEdited(prev => ({ ...prev, targetRuntime: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Neighborhood</label>
                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm p-3 outline-none" value={edited.neighborhood || ''} onChange={(e) => setEdited(prev => ({ ...prev, neighborhood: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-4 flex items-center justify-between">
                  Production Checklist 
                  <span className="text-[9px] bg-slate-100 px-2 py-0.5 rounded text-slate-500">{edited.checklist.filter(i => i.completed).length}/{edited.checklist.length}</span>
                </label>
                <div className="space-y-2 mb-4">
                  {edited.checklist.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl group">
                      <button onClick={() => toggleChecklistItem(item.id)} className={`transition-colors ${item.completed ? 'text-emerald-500' : 'text-slate-300 hover:text-indigo-400'}`}>
                        {item.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                      </button>
                      <span className={`flex-1 text-sm ${item.completed ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>{item.text}</span>
                      <button onClick={() => removeChecklistItem(item.id)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-500 transition-all"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
                <form onSubmit={addChecklistItem} className="flex gap-2">
                  <input type="text" value={newChecklistItem} onChange={(e) => setNewChecklistItem(e.target.value)} placeholder="Add a task..." className="flex-1 bg-white border border-slate-200 rounded-xl text-sm p-2 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                  <button type="submit" className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"><Plus size={18} /></button>
                </form>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100">
                <label className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest block mb-4 flex items-center gap-2"><Calendar size={14} /> Production Dates</label>
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Filming</span>
                    <input type="date" className="w-full bg-white border border-indigo-100 rounded-xl p-2 text-sm" value={edited.targetShootDate || ''} onChange={(e) => setEdited(prev => ({ ...prev, targetShootDate: e.target.value }))} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Publishing</span>
                    <input type="date" className="w-full bg-white border border-indigo-100 rounded-xl p-2 text-sm" value={edited.targetPublishDate || ''} onChange={(e) => setEdited(prev => ({ ...prev, targetPublishDate: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 text-white">
                 <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block mb-4 flex items-center gap-2"><ImageIcon size={14} /> AI Visual Concept</label>
                 {edited.thumbnailConceptUrl ? (
                   <div className="aspect-video bg-black rounded-xl overflow-hidden mb-4 relative group">
                      <img src={edited.thumbnailConceptUrl} className="w-full h-full object-cover" />
                      <button onClick={generateThumbnailConcept} className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center font-bold text-xs gap-2"><Sparkles size={14} /> Regenerate</button>
                   </div>
                 ) : (
                   <button onClick={generateThumbnailConcept} disabled={isGeneratingThumbnail} className="w-full aspect-video border-2 border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-indigo-400 hover:border-indigo-400 transition-all">
                      {isGeneratingThumbnail ? <Loader2 size={24} className="animate-spin" /> : <Sparkles size={24} />}
                      <span className="text-[10px] font-bold uppercase tracking-widest">Generate Thumbnail Idea</span>
                   </button>
                 )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-8">
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><FileText size={14} /> Scripts & Notes</label>
                <button onClick={generateAIOutline} disabled={isGenerating} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 transition-colors disabled:opacity-50">
                  {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {isGenerating ? 'Drafting...' : 'Generate Pro Script'}
                </button>
              </div>
              <textarea rows={12} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-6 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none font-mono text-slate-700" value={edited.notes} onChange={(e) => setEdited(prev => ({ ...prev, notes: e.target.value }))} placeholder="The narrative starts here..." />
              
              {edited.groundingSources.length > 0 && (
                <div className="mt-6">
                   <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-3 flex items-center gap-2"><SearchIcon size={12} /> AI Research Sources</label>
                   <div className="flex flex-wrap gap-2">
                      {edited.groundingSources.map((source, i) => (
                        <a key={i} href={source.uri} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-600 px-3 py-1.5 rounded-full text-[10px] font-bold hover:bg-indigo-100 transition-colors">
                          {source.title} <ExternalLink size={10} />
                        </a>
                      ))}
                   </div>
                </div>
              )}
            </div>
            
            <div className="space-y-4">
               <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block flex items-center gap-2"><Youtube size={14} /> Market Comp</label>
               {edited.inspirationLinks.map((link, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                  <div className="aspect-video bg-slate-200 rounded-xl mb-3 overflow-hidden relative">
                    {fetchingIndices.has(idx) ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-sm"><Loader2 size={16} className="animate-spin text-indigo-600" /></div>
                    ) : link.thumbnail ? (
                      <img src={link.thumbnail} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300"><Youtube size={24} /></div>
                    )}
                  </div>
                  <input type="text" placeholder="Paste URL..." className="w-full bg-transparent border-none p-0 text-[10px] font-bold text-slate-600 focus:ring-0 truncate" value={link.url} onChange={(e) => {
                    const updated = [...edited.inspirationLinks];
                    updated[idx] = { url: e.target.value, title: undefined, thumbnail: undefined };
                    setEdited(prev => ({ ...prev, inspirationLinks: updated }));
                  }} />
                  {link.title && <p className="text-[9px] text-slate-400 mt-1 line-clamp-1 italic">{link.title}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Stage:</label>
            <select className="bg-white border border-slate-200 rounded-xl text-xs font-bold p-2 outline-none focus:ring-1 focus:ring-indigo-500" value={edited.status} onChange={(e) => setEdited(prev => ({ ...prev, status: e.target.value as WorkflowStage }))}>
              {stages.map(s => <option key={s.id} value={s.label}>{s.label}</option>)}
            </select>
          </div>
          <div className="flex gap-4">
            <button onClick={onClose} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">Cancel</button>
            {isFinalStage ? (
              <button onClick={() => { onArchive(edited.id); onClose(); }} className="bg-emerald-600 text-white px-10 py-2.5 rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition-all active:scale-95 flex items-center gap-2"><CheckCircle2 size={18} /> Complete & Archive</button>
            ) : (
              <button onClick={handleSave} className="bg-slate-900 text-white px-10 py-2.5 rounded-xl font-bold shadow-lg hover:bg-black transition-all active:scale-95 flex items-center gap-2"><Save size={18} /> Update Content</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CardModal;
