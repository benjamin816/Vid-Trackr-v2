
import { FunnelStage, VideoCard, WorkflowStage } from '../types';
import { FUNNEL_CONFIG } from '../constants';

export const categorizeIdea = (text: string): Partial<VideoCard> => {
  const lowerText = text.toLowerCase();
  let detectedStage = FunnelStage.TOF; 
  let detectedFormat = 'Custom';
  let detectedRuntime = 22;

  // Improved Location Extraction
  let detectedLocation = '';
  
  const locationPatterns = [
    /(?:touring|toured|explore|exploring|in|of|about|to)\s+(the\s+)?([A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s+in\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/,
    /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s+NC)/i,
    /(?:touring|toured|explore|exploring|in|of|about|to)\s+(the\s+)?([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/
  ];

  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match) {
      const loc = match[match.length - 1];
      if (loc) {
        detectedLocation = loc.trim();
        if (!detectedLocation.toUpperCase().includes('NC')) {
          detectedLocation += ', NC';
        }
        break;
      }
    }
  }

  const isWalkingOrDriving = lowerText.includes('walking') || 
                             lowerText.includes('driving') || 
                             lowerText.includes('we toured') || 
                             lowerText.includes('full tour') || 
                             lowerText.includes('touring') ||
                             lowerText.includes('toured');
                             
  const isMap = lowerText.includes('map tour') || lowerText.includes('explained');
  const isNewConst = lowerText.includes('new construction') || lowerText.includes('builder') || lowerText.includes('model home');

  if (isNewConst) {
    detectedStage = FunnelStage.BOF;
    detectedRuntime = 45;
    detectedFormat = lowerText.includes('builder') ? 'Builder Community Tour' : 'New Construction Tour';
  } else if (isWalkingOrDriving && !isMap) {
    detectedStage = FunnelStage.MOF;
    const isNeighborhood = lowerText.includes('neighborhood') || lowerText.includes('community') || lowerText.includes('preserve');
    detectedFormat = isNeighborhood ? 'Neighborhood Tours' : 'City Tours';
    detectedRuntime = isNeighborhood ? 28 : 45;
  } else if (isMap) {
    detectedStage = FunnelStage.MOF;
    detectedRuntime = 25;
    detectedFormat = 'Map Tours';
  } else {
    if (FUNNEL_CONFIG.BOF.keywords.some(k => lowerText.includes(k))) {
      detectedStage = FunnelStage.BOF;
      detectedFormat = FUNNEL_CONFIG.BOF.formats[0];
    } else if (FUNNEL_CONFIG.MOF.keywords.some(k => lowerText.includes(k))) {
      detectedStage = FunnelStage.MOF;
      detectedFormat = FUNNEL_CONFIG.MOF.formats[0];
    } else {
      detectedStage = FunnelStage.TOF;
      detectedFormat = FUNNEL_CONFIG.TOF.formats[0];
    }
  }

  return {
    id: crypto.randomUUID(),
    title: text,
    funnelStage: detectedStage,
    formatType: detectedFormat,
    targetRuntime: detectedRuntime,
    // Fix: Replaced WorkflowStage.IdeaBacklog (type used as value) with string literal 'Idea Backlog'
    status: 'Idea Backlog',
    notes: '',
    neighborhood: detectedLocation,
    createdDate: new Date().toISOString(),
    inspirationLinks: [{ url: '' }, { url: '' }, { url: '' }],
    externalDocs: [],
    checklist: [],
    groundingSources: [],
    isArchived: false,
    isTrashed: false
  };
};
