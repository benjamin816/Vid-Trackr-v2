
export enum FunnelStage {
  TOF = 'TOF',
  MOF = 'MOF',
  BOF = 'BOF'
}

export type WorkflowStage = string;

export interface StageConfig {
  id: string;
  label: string;
  isDeletable: boolean;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface InspirationLink {
  url: string;
  title?: string;
  thumbnail?: string;
}

export interface ExternalDoc {
  name: string;
  url: string; 
  type: 'pdf' | 'doc' | 'other';
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface VideoCard {
  id: string;
  title: string;
  funnelStage: FunnelStage;
  formatType: string;
  targetRuntime: number; 
  status: WorkflowStage;
  notes: string;
  location?: string;
  neighborhood?: string;
  createdDate: string;
  targetShootDate?: string;
  targetPublishDate?: string;
  targetPublishTime?: string; 
  actualPublishDate?: string;
  deletedDate?: string;
  originalStatus?: WorkflowStage;
  youtubeLink?: string;
  inspirationLinks: InspirationLink[];
  externalDocs: ExternalDoc[];
  checklist: ChecklistItem[];
  groundingSources: GroundingSource[];
  thumbnailConceptUrl?: string;
  isArchived: boolean;
  isTrashed: boolean;
}

export type ViewMode = 'board' | 'calendar' | 'archive' | 'trash';
export type CalendarMode = 'month' | 'week' | 'day';
