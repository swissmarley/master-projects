import { kvStorage } from '@/lib/storage';

import { createSettingsStore } from './store';

export const useSettings = createSettingsStore(kvStorage);

export * from './store';
