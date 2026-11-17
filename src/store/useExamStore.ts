import { create } from 'zustand';
import { countLocalQuestions, syncQuestions } from '../api/client';

type ExamState = {
  isSyncing: boolean;
  lastSynced: number | null;
  questionCount: number;
  error: string | null;
  syncBank: () => Promise<void>;
  loadLocalCount: () => Promise<void>;
};

/**
 * Estado global de la sincronización del banco de preguntas.
 * Las preguntas en sí viven en IndexedDB (Dexie), no en el store.
 */
export const useExamStore = create<ExamState>((set) => ({
  isSyncing: false,
  lastSynced: null,
  questionCount: 0,
  error: null,

  syncBank: async () => {
    set({ isSyncing: true, error: null });

    try {
      const count = await syncQuestions();
      set({ isSyncing: false, lastSynced: Date.now(), questionCount: count });
    } catch (error) {
      set({
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Error desconocido al sincronizar.',
      });
    }
  },

  loadLocalCount: async () => {
    const count = await countLocalQuestions();
    set({ questionCount: count });
  },
}));
