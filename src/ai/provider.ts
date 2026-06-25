import type { VideoGenProvider } from './types';
import { MockProvider } from './MockProvider';
import { KlingProvider } from './KlingProvider';
import { DoubaoProvider } from './DoubaoProvider';

const PROVIDER_NAME = (process.env.EXPO_PUBLIC_AI_PROVIDER ?? 'mock').toLowerCase();

function pick(name: string): VideoGenProvider {
  switch (name) {
    case 'doubao':
    case 'seedance':
      return DoubaoProvider;
    case 'kling':
      return KlingProvider;
    case 'mock':
    default:
      return MockProvider;
  }
}

export const defaultProvider: VideoGenProvider = pick(PROVIDER_NAME);

export const ALL_PROVIDERS: Record<string, VideoGenProvider> = {
  mock: MockProvider,
  doubao: DoubaoProvider,
  kling: KlingProvider,
};
