import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus,
  Search,
  Archive,
  Layout,
  Calendar as CalendarIcon,
  Sparkles,
  Trash2,
  Table,
  Settings as SettingsIcon,
  ExternalLink,
  ShieldCheck,
  BarChart2,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { VideoCard, ViewMode, WorkflowStage, FunnelStage, StageConfig } from './types.ts';
import { DEFAULT_WORKFLOW_STAGES } from './constants.tsx';
import KanbanBoard from './components/KanbanBoard.tsx';
import CalendarView from './components/CalendarView.tsx';
import ArchiveView from './components/ArchiveView.tsx';
import TrashView from './components/TrashView.tsx';
import IdeaInput from './components/IdeaInput.tsx';
import CardModal from './components/CardModal.tsx';
import SettingsModal from './components/SettingsModal.tsx';

/**
 * PRODUCTION TEAM CONFIG
 * Only modify SPREADSHEET_ID here to change the destination sheet for the entire team.
 */
const SPREADSHEET_ID = '1W9216uzRoQOsmks9xl5v2d8U3dSzeveiUduTZ63dkjk';
const CLIENT_ID = '979572069887-6c96876re4v9udofbpqbfmqjru2q91q3.apps.googleusercontent.com';
const DISCOVERY_DOCS = [
  'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
  'https://sheets.googleapis.com/$discovery/rest?version=v4',
];

// NOTE: Keep scopes minimal.
const SCOPES =
  'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';

type SyncStatus =
  | 'disconnected'
  | 'connecting'
  | 'synced'
  | 'syncing'
  | 'error'
  | 'unauthorized'
  | 'auth_fail'
  | 'init_timeout'
  | 'init_missing_scripts'
  | 'init_failed';

// Allow using browser gapi/google without TS errors
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
  const gapi: any;
  const google: any;
}

const App: React.FC = () => {
  // --- Check for missing Spreadsheet ID ---
  if (!SPREADSHEET_ID || SPREADSHEET_ID.trim() === '') {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900 text-white p-8">
        <div className="w-16 h-16 bg-rose-500 rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-rose-500/20">
          <AlertTriangle size={32} />
        </div>
        <h1 className="text-2xl font-bold mb-2">Configuration Error</h1>
        <p className="text-slate-400 text-center max-w-md mb-8">
          The team <strong>SPREADSHEET_ID</strong> is missing or invalid. Please update the application source code to
          include the correct ID.
        </p>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 font-mono text-xs text-indigo-400">
          const SPREADSHEET_ID = "YOUR_SHEET_ID_HERE";
        </div>
      </div>
    );
  }

  const [cards, setCards] = useState<VideoCard[]>([]);
  const [stages, setStages] = useState<StageConfig[]>(DEFAULT_WORKFLOW_STAGES);
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [funnelFilter, setFunnelFilter] = useState<FunnelStage | undefined>(undefined);

  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [inputDefaultStatus, setInputDefaultStatus] = useState<WorkflowStage | undefined>(undefined);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('disconnected');
  const [isGapiLoaded, setIsGapiLoaded] = useState(false);
  const [isGapiReady, setIsGapiReady] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const tokenClientRef = useRef<any>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  // Promise that resolves only when gapi init is complete.
  const gapiReadyRef = useRef<Promise<void> | null>(null);

  // ---- Diagnostics helpers ----
  const logInit = (...args: any[]) => {
    // Keep logs but make them easy to filter.
    console.log('[GAPI_INIT]', ...args);
  };

  const hasGapi = () => !!window.gapi;
  const hasGIS = () => !!window.google?.accounts?.oauth2;

  const waitForLibraries = (timeoutMs = 10000) =>
    new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const t = window.setInterval(() => {
        const ok = hasGapi() && hasGIS();
        if (ok) {
          window.clearInterval(t);
          resolve();
          return;
        }
        if (Date.now() - start > timeoutMs) {
          window.clearInterval(t);
          reject(new Error('Google libraries not loaded (gapi and/or GIS missing or blocked).'));
        }
      }, 100);
    });

  const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    let timer: number | null = null;
    try {
      const timeout = new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      });
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  };

  // Statistics calculation
  const stats = useMemo(() => {
    const total = cards.length;
    const archived = cards.filter((c) => c.isArchived && !c.isTrashed).length;
    const active = cards.filter((c) => !c.isArchived && !c.isTrashed).length;
    const inBacklog = cards.filter((c) => c.status === stages[0].label && !c.isTrashed).length;
    return { total, archived, active, inBacklog };
  }, [cards, stages]);

  // ----- SHEET SYNC -----
  const saveToSheet = useCallback(
    async (data: any) => {
      if (!isGapiLoaded) return;
      setSyncStatus('syncing');

      try {
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: 'PIPELINE_DATA!A1',
          valueInputOption: 'RAW',
          resource: { values: [[JSON.stringify(data)]] },
        });

        setSyncStatus('synced');
        setLastSyncedAt(new Date());
      } catch (err: any) {
        console.error('Sheet Save Failed:', err);
        setSyncStatus('error');
      }
    },
    [isGapiLoaded]
  );

  const handleSyncWithSheet = useCallback(async () => {
    if (!isGapiLoaded) return;

    setSyncStatus('connecting');

    try {
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'PIPELINE_DATA!A1',
      });

      if (response?.result?.values && response.result.values[0]) {
        const remoteData = JSON.parse(response.result.values[0][0]);
        if (remoteData.cards) setCards(remoteData.cards);
        if (remoteData.stages) setStages(remoteData.stages);

        setSyncStatus('synced');
        setLastSyncedAt(new Date());
      } else {
        await saveToSheet({ cards, stages });
      }
    } catch (err: any) {
      console.error('Sheet Sync Failed:', err);

      // If sheet/tab doesn't exist, create the tab
      const msg = err?.result?.error?.message || '';
      if (err.status === 404 || msg.toLowerCase().includes('not found')) {
        try {
          await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
              requests: [{ addSheet: { properties: { title: 'PIPELINE_DATA' } } }],
            },
          });

          await saveToSheet({ cards, stages });
        } catch (createErr) {
          console.error('Failed creating PIPELINE_DATA sheet:', createErr);
          setSyncStatus('error');
        }
      } else if (err.status === 401 || err.status === 403) {
        setSyncStatus('unauthorized');
      } else {
        setSyncStatus('error');
      }
    }
  }, [isGapiLoaded, cards, stages, saveToSheet]);

  // ----- INIT (GAPI + GIS) -----
  useEffect(() => {
    const savedCards = localStorage.getItem('video_funnel_tracker_cards');
    const savedStages = localStorage.getItem('video_funnel_tracker_stages');

    if (savedStages) {
      try {
        setStages(JSON.parse(savedStages));
      } catch (e) {
        console.error(e);
      }
    }

    if (savedCards) {
      try {
        setCards(JSON.parse(savedCards));
      } catch (e) {
        console.error(e);
      }
    } else {
      const templateCard: VideoCard = {
        id: crypto.randomUUID(),
        title: 'Template: Why Raleigh is Booming in 2025',
        funnelStage: FunnelStage.TOF,
        formatType: 'Pros & Cons',
        targetRuntime: 22,
        status: DEFAULT_WORKFLOW_STAGES[0].label,
        notes: 'Welcome! Data is synced to our Team Google Sheet.',
        neighborhood: 'Raleigh, NC',
        createdDate: new Date().toISOString(),
        inspirationLinks: [{ url: '' }, { url: '' }, { url: '' }],
        externalDocs: [],
        checklist: [],
        groundingSources: [],
        isArchived: false,
        isTrashed: false,
      };
      setCards([templateCard]);
    }

    // If you never set a real client id, don't block UI on init; just leave disconnected.
    if (!CLIENT_ID || CLIENT_ID.includes('YOUR_CLIENT_ID')) {
      setIsGapiLoaded(false);
      setIsGapiReady(false);
      setSyncStatus('disconnected');
      return;
    }

    const init = async () => {
      try {
        setIsGapiReady(false);
        setIsGapiLoaded(false);

        logInit('Starting init...');
        logInit('Initial globals', { hasGapi: hasGapi(), hasGIS: hasGIS() });

        // 1) Wait for both scripts. If they never load (blocked/missing), we fail loudly.
        await withTimeout(waitForLibraries(12000), 13000, 'waitForLibraries');

        logInit('Libraries detected', { hasGapi: hasGapi(), hasGIS: hasGIS() });

        // 2) Initialize gapi client. Add timeout so we never hang.
        gapiReadyRef.current = new Promise<void>((resolve, reject) => {
          gapi.load('client', async () => {
            try {
              logInit('gapi.load callback fired. Initializing client...');
              await withTimeout(gapi.client.init({ discoveryDocs: DISCOVERY_DOCS }), 12000, 'gapi.client.init');

              setIsGapiLoaded(true);
              setIsGapiReady(true);
              logInit('gapi ready ✅');
              resolve();
            } catch (initErr) {
              console.error('GAPI Init Error:', initErr);
              setSyncStatus('init_failed');
              setIsGapiLoaded(false);
              setIsGapiReady(false);
              reject(initErr);
            }
          });
        });

        // 3) Initialize the token client (GIS)
        tokenClientRef.current = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: async (response: any) => {
            if (response?.error) {
              console.error('OAuth Error:', response);
              setSyncStatus('auth_fail');
              return;
            }

            try {
              // Make sure gapi is initialized before calling Sheets.
              await gapiReadyRef.current;

              gapi.client.setToken(response);
              await handleSyncWithSheet();
            } catch (e) {
              console.error('Auth callback failed:', e);
              setSyncStatus('error');
            }
          },
        });

        // If we got here, we at least have the button enabled.
        setSyncStatus('disconnected');
      } catch (err: any) {
        console.error('GAPI sequence failed:', err);

        // Helpful, explicit reasons
        const msg = String(err?.message || err || '');
        if (msg.toLowerCase().includes('libraries not loaded')) {
          setSyncStatus('init_missing_scripts');
        } else if (msg.toLowerCase().includes('timed out')) {
          setSyncStatus('init_timeout');
        } else {
          setSyncStatus('init_failed');
        }

        setIsGapiLoaded(false);
        setIsGapiReady(false);
      }
    };

    init();
  }, []);

  // Persist locally + autosave to Sheet (if connected)
  useEffect(() => {
    localStorage.setItem('video_funnel_tracker_cards', JSON.stringify(cards));
    localStorage.setItem('video_funnel_tracker_stages', JSON.stringify(stages));

    if (syncStatus === 'synced' || syncStatus === 'syncing') {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = window.setTimeout(() => {
        saveToSheet({ cards, stages });
      }, 3000);
    }
  }, [cards, stages, syncStatus, saveToSheet]);

  const connectToDrive = () => {
    // Hard guard: don't even try if not ready.
    if (!isGapiReady) {
      alert(
        'Google API is not ready. If this keeps happening, your browser may be blocking Google scripts (adblock/privacy), or index.html is missing required script tags.'
      );
      return;
    }

    if (tokenClientRef.current) {
      tokenClientRef.current.requestAccessToken({ prompt: 'consent' });
    } else {
      alert('System initializing. Please wait.');
    }
  };

  const addCards = useCallback((newCards: VideoCard[]) => setCards((prev) => [...prev, ...newCards]), []);
  const updateCard = useCallback(
    (updatedCard: VideoCard) => setCards((prev) => prev.map((c) => (c.id === updatedCard.id ? updatedCard : c))),
    []
  );

  const deleteCardToTrash = useCallback((id: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, isTrashed: true, deletedDate: new Date().toISOString(), originalStatus: c.status } : c
      )
    );
  }, []);

  const archiveCard = useCallback((id: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, isArchived: true, actualPublishDate: new Date().toISOString(), originalStatus: c.status }
          : c
      )
    );
  }, []);

  const moveCard = useCallback(
    (id: string, newStatus: WorkflowStage) => {
      setCards((prev) =>
        prev.map((c) => {
          if (c.id === id) {
            const isFinal = newStatus === stages[stages.length - 1].label;
            return {
              ...c,
              status: newStatus,
              isArchived: isFinal,
              actualPublishDate: isFinal ? new Date().toISOString() : c.actualPublishDate,
              originalStatus: c.status,
            };
          }
          return c;
        })
      );
    },
    [stages]
  );

  const rescheduleCard = useCallback((id: string, date: string, type: 'shoot' | 'publish') => {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [type === 'shoot' ? 'targetShootDate' : 'targetPublishDate']: date } : c))
    );
  }, []);

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      const matchesSearch =
        card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (card.neighborhood || '').toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;
      if (viewMode === 'trash') return card.isTrashed;
      if (viewMode === 'archive') return card.isArchived && !card.isTrashed;
      return !card.isTrashed && !card.isArchived;
    });
  }, [cards, searchQuery, viewMode]);

  const activeCard = useMemo(() => cards.find((c) => c.id === selectedCardId), [cards, selectedCardId]);

  const renderSyncStatus = () => {
    if (syncStatus === 'synced') {
      return (
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-1.5 text-emerald-600">
            <ShieldCheck size={14} />
            <span className="text-[10px] font-bold uppercase tracking-tight">Team Sheet Connected</span>
          </div>
          {lastSyncedAt && (
            <span className="text-[9px] text-slate-400 font-medium">
              Last sync: {lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      );
    }

    if (syncStatus === 'syncing' || syncStatus === 'connecting') {
      return (
        <div className="flex items-center gap-2 text-blue-500">
          <Table size={14} className="animate-spin" />
          <span className="text-[10px] font-bold uppercase tracking-tight">Updating Cloud...</span>
        </div>
      );
    }

    // Show explicit init errors instead of permanent “Initializing…”
    const initErrorLabel =
      syncStatus === 'init_missing_scripts'
        ? 'Google scripts blocked/missing'
        : syncStatus === 'init_timeout'
          ? 'Google init timed out'
          : syncStatus === 'init_failed'
            ? 'Google init failed'
            : syncStatus === 'unauthorized'
              ? 'Unauthorized'
              : syncStatus === 'auth_fail'
                ? 'Auth failed'
                : null;

    if (initErrorLabel) {
      return (
        <button
          onClick={connectToDrive}
          disabled={!isGapiReady}
          title={
            initErrorLabel +
            '. Check DevTools console for [GAPI_INIT] logs and verify index.html includes api.js + gsi/client.'
          }
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase border transition-all bg-rose-50 text-rose-700 border-rose-200"
        >
          <AlertTriangle size={12} />
          {initErrorLabel}
        </button>
      );
    }

    return (
      <button
        onClick={connectToDrive}
        disabled={!isGapiReady}
        title={!isGapiReady ? 'Initializing Google API… please wait' : ''}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase border transition-all
          ${
            !isGapiReady
              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
              : 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100'
          }`}
      >
        <Lock size={12} />
        {!isGapiReady ? 'Initializing…' : 'Authorize Team Sync'}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 text-slate-900 font-inter">
      <header className="px-6 py-4 bg-white border-b border-slate-200 flex flex-col gap-4 shrink-0 shadow-sm z-[40]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100 transform -rotate-3">
              <Sparkles size={28} />
            </div>
            <div>
              <h1 className="font-extrabold text-xl tracking-tight leading-none mb-1">Vid Trackr</h1>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Team Production Hub</span>
              </div>
            </div>
          </div>

          <div className="flex-1 max-w-lg px-8 hidden xl:block">
            <div className="relative group">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors"
                size={18}
              />
              <input
                type="text"
                placeholder="Search ideas, locations, scripts..."
                className="w-full pl-11 pr-4 py-2.5 bg-slate-100 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            {renderSyncStatus()}

            <div className="flex bg-slate-100 p-1 rounded-xl ml-2">
              <button
                onClick={() => setViewMode('board')}
                className={`p-2 rounded-lg transition-all ${
                  viewMode === 'board' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Kanban Board"
              >
                <Layout size={20} />
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`p-2 rounded-lg transition-all ${
                  viewMode === 'calendar' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Production Calendar"
              >
                <CalendarIcon size={20} />
              </button>
              <button
                onClick={() => setViewMode('archive')}
                className={`p-2 rounded-lg transition-all ${
                  viewMode === 'archive' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Published Archive"
              >
                <Archive size={20} />
              </button>
              <button
                onClick={() => setViewMode('trash')}
                className={`p-2 rounded-lg transition-all ${
                  viewMode === 'trash' ? 'bg-white shadow-sm text-rose-600' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Trash Bin"
              >
                <Trash2 size={20} />
              </button>
            </div>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2.5 bg-slate-100 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 rounded-xl transition-all"
              title="Board Settings"
            >
              <SettingsIcon size={20} />
            </button>

            <button
              onClick={() => {
                setInputDefaultStatus(undefined);
                setIsInputOpen(true);
              }}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-2xl text-sm font-bold transition-all shadow-lg shadow-indigo-200 active:scale-95"
            >
              <Plus size={20} /> New Video
            </button>
          </div>
        </div>

        <div className="flex items-center gap-8 border-t border-slate-50 pt-3">
          <div className="flex items-center gap-2">
            <BarChart2 size={16} className="text-slate-400" />
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Pipeline Health:</span>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-800">{stats.active}</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">In Progress</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-indigo-600">{stats.inBacklog}</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Idea Pool</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-emerald-600">{stats.archived}</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Published</span>
            </div>
          </div>

          {syncStatus === 'synced' && (
            <div className="ml-auto flex items-center gap-3">
              <a
                href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1.5 transition-colors"
              >
                <Table size={12} /> View Dataset <ExternalLink size={10} />
              </a>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative z-0">
        {viewMode === 'board' && (
          <KanbanBoard
            stages={stages}
            cards={filteredCards}
            onMoveCard={moveCard}
            onSelectCard={setSelectedCardId}
            onAddAtStage={(stage) => {
              setInputDefaultStatus(stage);
              setIsInputOpen(true);
            }}
            onArchiveCard={archiveCard}
            funnelFilter={funnelFilter}
            onFunnelFilterChange={setFunnelFilter}
          />
        )}

        {viewMode === 'calendar' && (
          <CalendarView cards={filteredCards} onSelectCard={setSelectedCardId} onReschedule={rescheduleCard} />
        )}

        {viewMode === 'archive' && (
          <ArchiveView
            cards={filteredCards}
            onSelectCard={setSelectedCardId}
            onUnarchive={(id) => {
              const c = cards.find((card) => card.id === id);
              if (c) updateCard({ ...c, isArchived: false, status: c.originalStatus || stages[0].label });
            }}
          />
        )}

        {viewMode === 'trash' && (
          <TrashView
            cards={filteredCards}
            onRestore={(id) => {
              const c = cards.find((card) => card.id === id);
              if (c)
                updateCard({
                  ...c,
                  isTrashed: false,
                  status: c.originalStatus || stages[0].label,
                  deletedDate: undefined,
                });
            }}
            onPermanentDelete={(id) => setCards((prev) => prev.filter((c) => c.id !== id))}
          />
        )}
      </main>

      <IdeaInput
        isOpen={isInputOpen}
        onClose={() => setIsInputOpen(false)}
        onAdd={addCards}
        defaultStatus={inputDefaultStatus}
      />

      {activeCard && (
        <CardModal
          card={activeCard}
          stages={stages}
          isOpen={!!selectedCardId}
          onClose={() => setSelectedCardId(null)}
          onUpdate={updateCard}
          onDelete={deleteCardToTrash}
          onArchive={archiveCard}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        stages={stages}
        onUpdateStages={(s) => setStages(s)}
      />
    </div>
  );
};

export default App;
