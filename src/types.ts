export interface ImagePrompt {
  characterName: string;
  nanoBananaPrompt: string;
}

export interface VideoScene {
  scene: number;
  timeline: string;
  context: string;
  action: string;
  character: string;
  voice: string;
  dialogue: string;
  prompt: string;
}

export interface VideoScript {
  veo3: VideoScene[];
  grok: VideoScene[];
}

export interface GeneratedResult {
  imagePrompts: ImagePrompt[];
  videoScript: VideoScript;
  voiceover: string;
  references?: string;
}

export interface HistoryItem {
  id: string;
  date: string;
  idea: string;
  result: GeneratedResult;
}
