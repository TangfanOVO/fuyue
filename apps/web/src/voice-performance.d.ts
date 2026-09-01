export type VoicePerformance = {
  cleanText: string;
  speechText: string;
  tags: string[];
};

export function cleanVoicePerformance(input: string): string;
export function mergeStreamingText(current: string, incoming: string): string;
export function visibleVoicePerformanceTags(input: string): string[];
export function prepareElevenV3Speech(input: string): VoicePerformance;
export function performanceSourceSuffix(tags: string[]): string;
