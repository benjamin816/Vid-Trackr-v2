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

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

function isSpreadsheetConfigured() {
  return !!SPREADSHEET_ID && !SPREADSHEET_ID.includes('YOUR_SHEET_ID_HERE');
}

export default function App() {
  // Guard early if sheet isn't configured.
  if (!isSpreadsheetConfigured()) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h1 className="text-xl font-extrabold mb-2">Missing SPREADSHEET_ID</h1>
          <p className="text-sm text-slate-300 mb-4">
            Open <span className="font-mono">App.tsx</span> and set the constant{' '}
            <span className="font-mono">SPREADSHEET_ID</span> to your team sheet ID. Then redeploy.
          </p>
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 font-mono text-xs text-indigo-400">
            const SPREADSHEET_ID = &quot;YOUR_SHEET_ID_HERE&quot;;
          </div>
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

  // ---- Multi-tab always-sync (free) ----
  const tabIdRef = useRef<string>(crypto.randomUUID());
  const bcRef = useRef<BroadcastChannel | null>(null);

  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [isLeader, setIsLeader] = useState(false);
  const isLeaderRef = useRef(false);

  const dirtyRef = useRef(false);
  // When we apply a remote update (sheet / other tab), we want to update local state and localStorage
  // but NOT mark the app dirty or trigger an autosave back to the sheet.
  const suppressNextAutosaveRef = useRef(false);

  const hasConflictRef = useRef(false);

  // Legacy flag (kept for compatibility; no longer relied on for autosave suppression)
  const suppressDirtyRef = useRef(false);
  const lastRemoteVersionRef = useRef<string | null>(null);
  const pendingRemoteRef = useRef<{ data: any; version: string | null } | null>(null);
  const [hasConflict, setHasConflict] = useState(false);

  const writeInFlightRef = useRef(false);
  const pendingWriteRef = useRef<any | null>(null);

  const pollIntervalRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);

  const LEADER_KEY = 'vid_trackr_sync_leader_v1';
  const CHANNEL = 'vid_trackr_sync_v1';

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

  // ----- SHEET SYNC (multi-tab, single-writer) -----
  const applyRemote = useCallback((payload: any, version: string | null) => {
    // Skip the *next* autosave cycle that would normally be triggered by these setState calls.
    // React applies state updates later; a try/finally flag won't survive until the effect runs.
    const willUpdateState = !!(payload?.cards || payload?.stages);
    if (willUpdateState) suppressNextAutosaveRef.current = true;

    if (payload?.cards) setCards(payload.cards);
    if (payload?.stages) setStages(payload.stages);

    lastRemoteVersionRef.current = version;
    dirtyRef.current = false;

    setHasConflict(false);
    hasConflictRef.current = false;
    pendingRemoteRef.current = null;

    setSyncStatus('synced');
    setLastSyncedAt(new Date());
  }, []);

  const pullRemote = useCallback(async (): Promise<{ data: any | null; version: string | null }> => {
    if (!gapiReadyRef.current) return { data: null, version: null };
    await gapiReadyRef.current;

    const [a1, b1] = await Promise.all([
      gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'PIPELINE_DATA!A1' }),
      gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'PIPELINE_DATA!B1' }),
    ]);

    const version = b1?.result?.values?.[0]?.[0] ?? null;
    const raw = a1?.result?.values?.[0]?.[0];
    if (!raw) return { data: null, version };

    try {
      return { data: JSON.parse(raw), version };
    } catch {
      return { data: null, version };
    }
  }, []);

  const enqueueWrite = useCallback(async (payload: any, sourceTabId?: string) => {
    if (!gapiReadyRef.current) return;
    await gapiReadyRef.current;

    pendingWriteRef.current = payload;
    if (writeInFlightRef.current) return;
    writeInFlightRef.current = true;

    try {
      while (pendingWriteRef.current) {
        const next = pendingWriteRef.current;
        pendingWriteRef.current = null;

        setSyncStatus('syncing');
        const version = new Date().toISOString();

        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: 'PIPELINE_DATA!A1:B1',
          valueInputOption: 'RAW',
          resource: { values: [[JSON.stringify(next), version]] },
        });

        lastRemoteVersionRef.current = version;
        dirtyRef.current = false;

        setHasConflict(false);
        hasConflictRef.current = false;
        pendingRemoteRef.current = null;

        setSyncStatus('synced');
        setLastSyncedAt(new Date());

        bcRef.current?.postMessage({
          type: 'remote_update',
          version,
          data: next,
          sourceTabId: sourceTabId ?? tabIdRef.current,
        });
      }
    } catch (err: any) {
      console.error('Sheet Save Failed:', err);
      if (err?.status === 401 || err?.status === 403) setSyncStatus('unauthorized');
      else setSyncStatus('error');
    } finally {
      writeInFlightRef.current = false;
    }
  }, []);

  const requestSave = useCallback(
    (payload: any) => {
      // If we're in conflict mode, never write until the user chooses Load/Overwrite.
      if (hasConflictRef.current) return;

      // If this tab is the leader, it writes. If BroadcastChannel isn't available,
      // fall back to direct write (old behavior) so sync still works.
      if (isLeaderRef.current || !bcRef.current) {
        enqueueWrite(payload);
        return;
      }

      bcRef.current?.postMessage({ type: 'save_request', from: tabIdRef.current, data: payload });
    },
    [enqueueWrite]
  );

  const handleSyncWithSheet = useCallback(async () => {
    if (!gapiReadyRef.current) return;
    await gapiReadyRef.current;

    setSyncStatus('connecting');

    try {
      const { data, version } = await pullRemote();

      if (data) {
        applyRemote(data, version);
        return;
      }

      await enqueueWrite({ cards, stages });
    } catch (err: any) {
      console.error('Sheet Sync Failed:', err);

      const msg = err?.result?.error?.message || '';
      const looksLikeMissingTab =
        err?.status === 404 ||
        msg.toLowerCase().includes('not found') ||
        msg.toLowerCase().includes('unable to parse range') ||
        msg.toLowerCase().includes('invalid argument');

      if (looksLikeMissingTab) {
        try {
          await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: { requests: [{ addSheet: { properties: { title: 'PIPELINE_DATA' } } }] },
          });

          await enqueueWrite({ cards, stages });
        } catch (createErr) {
          console.error('Failed creating PIPELINE_DATA sheet:', createErr);
          setSyncStatus('error');
        }
      } else if (err?.status === 401 || err?.status === 403) {
        setSyncStatus('unauthorized');
      } else {
        setSyncStatus('error');
      }
    }
  }, [applyRemote, cards, enqueueWrite, pullRemote, stages]);

  const loadRemoteFromConflict = useCallback(() => {
    const pending = pendingRemoteRef.current;
    if (!pending) return;
    applyRemote(pending.data, pending.version);
  }, [applyRemote]);

  const overwriteRemoteFromConflict = useCallback(() => {
    // setState is async; update the ref immediately so requestSave doesn't no-op.
    setHasConflict(false);
    hasConflictRef.current = false;
    pendingRemoteRef.current = null;
    requestSave({ cards, stages });
  }, [cards, requestSave, stages]);

  useEffect(() => {
    isLeaderRef.current = isLeader;
  }, [isLeader]);

  useEffect(() => {
    hasConflictRef.current = hasConflict;
  }, [hasConflict]);

  // ----- MULTI-TAB COORDINATION + LEADER ELECTION -----
  useEffect(() => {
    try {
      bcRef.current = new BroadcastChannel(CHANNEL);
    } catch {
      bcRef.current = null;
    }

    const now = () => Date.now();
    const ttl = 8000;

    const readLock = (): { tabId: string; expires: number } | null => {
      try {
        const raw = localStorage.getItem(LEADER_KEY);
        if (!raw) return null;
        const p = JSON.parse(raw);
        if (!p?.tabId || !p?.expires) return null;
        return p;
      } catch {
        return null;
      }
    };

    const writeLock = (tabId: string) => {
      const payload = { tabId, expires: now() + ttl };
      localStorage.setItem(LEADER_KEY, JSON.stringify(payload));
      setLeaderId(tabId);
      setIsLeader(tabId === tabIdRef.current);
    };

    const evalLeader = () => {
      // If BroadcastChannel is unavailable, leader election doesn't buy us anything.
      // Treat the current tab as the writer (old behavior) so sync remains functional.
      if (!bcRef.current) {
        writeLock(tabIdRef.current);
        return;
      }

      const lock = readLock();
      if (!lock || lock.expires < now()) {
        writeLock(tabIdRef.current);
        return;
      }
      setLeaderId(lock.tabId);
      setIsLeader(lock.tabId === tabIdRef.current);
    };

    evalLeader();

    if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    heartbeatRef.current = window.setInterval(() => {
      const lock = readLock();
      const iAm = lock?.tabId === tabIdRef.current && (lock?.expires ?? 0) > now();
      if (iAm) writeLock(tabIdRef.current);
      else evalLeader();
    }, 2500);

    const onStorage = (e: StorageEvent) => {
      if (e.key === LEADER_KEY) evalLeader();
    };
    window.addEventListener('storage', onStorage);

    const onMessage = (ev: MessageEvent) => {
      const msg = ev.data;
      if (!msg?.type) return;

      if (msg.type === 'save_request' && isLeaderRef.current) {
        enqueueWrite(msg.data, msg.from);
        return;
      }

      if (msg.type === 'remote_update') {
        if (msg.sourceTabId === tabIdRef.current) return;

        if (dirtyRef.current) {
          setHasConflict(true);
          hasConflictRef.current = true;
          pendingRemoteRef.current = { data: msg.data, version: msg.version ?? null };
          return;
        }

        applyRemote(msg.data, msg.version ?? null);
      }
    };

    bcRef.current?.addEventListener('message', onMessage);

    return () => {
      window.removeEventListener('storage', onStorage);
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;

      if (bcRef.current) {
        bcRef.current.removeEventListener('message', onMessage);
        bcRef.current.close();
      }
      bcRef.current = null;
    };
  }, [applyRemote, enqueueWrite]);

  // ----- POLLING (leader only) -----
  useEffect(() => {
    if (!isLeader) return;
    if (syncStatus !== 'synced') return;

    const poll = async () => {
      try {
        if (!gapiReadyRef.current) return;
        await gapiReadyRef.current;

        const verResp = await gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: 'PIPELINE_DATA!B1',
        });
        const remoteVersion = verResp?.result?.values?.[0]?.[0] ?? null;

        if (!remoteVersion || remoteVersion === lastRemoteVersionRef.current) return;

        const { data, version } = await pullRemote();

        if (!data) {
          lastRemoteVersionRef.current = version;
          return;
        }

        if (dirtyRef.current) {
          setHasConflict(true);
          hasConflictRef.current = true;
          pendingRemoteRef.current = { data, version };
          return;
        }

        applyRemote(data, version);

        bcRef.current?.postMessage({
          type: 'remote_update',
          version,
          data,
          sourceTabId: tabIdRef.current,
        });
      } catch (e) {
        console.error('Poll failed:', e);
      }
    };

    poll();

    if (pollIntervalRef.current) window.clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = window.setInterval(poll, 10000);

    return () => {
      if (pollIntervalRef.current) window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    };
  }, [applyRemote, isLeader, pullRemote, syncStatus]);

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
      // Initialize with example data if none exists
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

    // If client ID isn't configured, skip Google.
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

        // 1) Wait for scripts.
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
              // Silent token attempts can return interaction_required; don't hard-fail the UI.
              const errStr = String(response?.error || '').toLowerCase();
              if (
                errStr.includes('interaction_required') ||
                errStr.includes('consent_required') ||
                errStr.includes('login_required')
              ) {
                setSyncStatus('disconnected');
                return;
              }
              console.error('OAuth Error:', response);
              setSyncStatus('auth_fail');
              return;
            }

            try {
              // Ensure gapi is initialized.
              await gapiReadyRef.current;

              // Set token for gapi client
              gapi.client.setToken(response);

              // Immediately attempt to sync so UI can flip to "synced".
              await handleSyncWithSheet();
            } catch (e) {
              console.error('Auth callback failed:', e);
              setSyncStatus('error');
            }
          },
        });

        // 4) Attempt silent token fetch to restore session (won't show UI if already granted).
        try {
          tokenClientRef.current.requestAccessToken({ prompt: '' });
        } catch {
          // ignore
        }

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
    // Always keep localStorage up to date.
    localStorage.setItem('video_funnel_tracker_cards', JSON.stringify(cards));
    localStorage.setItem('video_funnel_tracker_stages', JSON.stringify(stages));

    // If this render was caused by applying a remote update, don't mark dirty or autosave.
    if (suppressNextAutosaveRef.current) {
      suppressNextAutosaveRef.current = false;
      return;
    }

    dirtyRef.current = true;

    if (syncStatus === 'synced' || syncStatus === 'syncing') {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = window.setTimeout(() => {
        requestSave({ cards, stages });
      }, 3000);
    }
  }, [cards, stages, syncStatus, requestSave]);

  const connectToDrive = () => {
    // Hard guard: don't even try if not ready.
    if (!isGapiReady) {
      alert(
        'Google API is not ready. If this keeps happening, your browser may be blocking Google scripts (adblock/privacy), or index.html is missing required script tags.'
      );
      return;
    }

    // Force consent screen.
    tokenClientRef.current?.requestAccessToken({ prompt: 'consent' });
  };

  const openNewIdea = useCallback(() => {
    setInputDefaultStatus(undefined);
    setIsInputOpen(true);
  }, []);

  const addCards = useCallback(
    (newCards: VideoCard[]) => {
      setCards((prev) => [...prev, ...newCards]);
      setIsInputOpen(false);
    },
    []
  );

  const updateCard = useCallback((updatedCard: VideoCard) => {
    setCards((prev) => prev.map((c) => (c.id === updatedCard.id ? updatedCard : c)));
  }, []);

  const moveCard = useCallback((id: string, newStatus: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: newStatus,
              lastUpdated: new Date().toISOString(),
            }
          : c
      )
    );
  }, []);

  const archiveCard = useCallback((id: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              isArchived: true,
              lastUpdated: new Date().toISOString(),
            }
          : c
      )
    );
  }, []);

  const unarchiveCard = useCallback((id: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              isArchived: false,
              lastUpdated: new Date().toISOString(),
            }
          : c
      )
    );
  }, []);

  const trashCard = useCallback((id: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              isTrashed: true,
              deletedDate: new Date().toISOString(),
              originalStatus: c.status,
              lastUpdated: new Date().toISOString(),
            }
          : c
      )
    );
  }, []);

  const restoreFromTrash = useCallback((id: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              isTrashed: false,
              deletedDate: undefined,
              status: c.originalStatus || c.status,
              originalStatus: undefined,
              lastUpdated: new Date().toISOString(),
            }
          : c
      )
    );
  }, []);

  const permanentlyDelete = useCallback((id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleUpdateStages = useCallback((newStages: StageConfig[]) => {
    setStages(newStages);
  }, []);

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
            <span className="text-[10px] font-bold uppercase tracking-tight">
              Team Sheet Connected {isLeader ? '(Leader)' : leaderId ? '(Follower)' : ''}
            </span>
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
///This is where code part 2 will be pasted in to complete the rest of the code////
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
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  Team Production Hub
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 max-w-lg px-8 hidden xl:block">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ideas, neighborhoods..."
                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-200 transition"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="px-4 py-2 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-slate-100 transition flex items-center gap-2"
              >
                <SettingsIcon size={16} className="text-slate-500" />
                <span className="text-[10px] font-bold uppercase text-slate-600">Settings</span>
              </button>

              <button
                onClick={() => setViewMode('calendar')}
                className={`px-4 py-2 rounded-2xl border transition flex items-center gap-2 text-[10px] font-bold uppercase
                  ${
                    viewMode === 'calendar'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
              >
                <CalendarIcon size={14} />
                Calendar
              </button>

              <button
                onClick={() => setViewMode('board')}
                className={`px-4 py-2 rounded-2xl border transition flex items-center gap-2 text-[10px] font-bold uppercase
                  ${
                    viewMode === 'board'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
              >
                <Layout size={14} />
                Board
              </button>

              <button
                onClick={() => setViewMode('archive')}
                className={`px-4 py-2 rounded-2xl border transition flex items-center gap-2 text-[10px] font-bold uppercase
                  ${
                    viewMode === 'archive'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
              >
                <Archive size={14} />
                Archive
              </button>

              <button
                onClick={() => setViewMode('trash')}
                className={`px-4 py-2 rounded-2xl border transition flex items-center gap-2 text-[10px] font-bold uppercase
                  ${
                    viewMode === 'trash'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
              >
                <Trash2 size={14} />
                Trash
              </button>
            </div>

            {renderSyncStatus()}

            <button
              onClick={openNewIdea}
              className="px-5 py-3 rounded-2xl bg-indigo-600 text-white font-extrabold text-sm shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition flex items-center gap-2"
            >
              <Plus size={18} />
              New
            </button>
          </div>
        </div>

        {/* Mobile search */}
        <div className="xl:hidden">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ideas, neighborhoods..."
              className="w-full pl-11 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-200 transition"
            />
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
            <div className="text-[10px] font-bold uppercase text-slate-500">Total</div>
            <div className="text-lg font-extrabold text-slate-900">{stats.total}</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
            <div className="text-[10px] font-bold uppercase text-slate-500">Active</div>
            <div className="text-lg font-extrabold text-slate-900">{stats.active}</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
            <div className="text-[10px] font-bold uppercase text-slate-500">Backlog</div>
            <div className="text-lg font-extrabold text-slate-900">{stats.inBacklog}</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
            <div className="text-[10px] font-bold uppercase text-slate-500">Archived</div>
            <div className="text-lg font-extrabold text-slate-900">{stats.archived}</div>
          </div>
        </div>

        {/* Conflict Banner */}
        {hasConflict && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-amber-600 mt-0.5" size={18} />
              <div>
                <div className="font-extrabold text-amber-800 text-sm">Sync conflict detected</div>
                <div className="text-xs text-amber-700 font-medium">
                  The team sheet changed while you had unsaved edits. Choose what to keep.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadRemoteFromConflict}
                className="px-4 py-2 rounded-xl bg-white border border-amber-200 text-amber-800 text-[10px] font-bold uppercase hover:bg-amber-100 transition"
              >
                Load remote
              </button>
              <button
                onClick={overwriteRemoteFromConflict}
                className="px-4 py-2 rounded-xl bg-amber-600 text-white text-[10px] font-bold uppercase hover:bg-amber-700 transition"
              >
                Overwrite
              </button>
            </div>
          </div>
        )}
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
            onRestore={restoreFromTrash}
            onPermanentDelete={permanentlyDelete}
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
          onDelete={trashCard}
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
}
