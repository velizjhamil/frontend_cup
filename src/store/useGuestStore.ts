import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type GuestState = {
  /** El usuario eligió "Probar como invitado": no hay cuenta ni sesión en el servidor. */
  isGuest: boolean;
  enterAsGuest: () => void;
  leaveGuest: () => void;
};

/**
 * Modo invitado (docs/ARCHITECTURE.md §Invitado): los intentos se quedan
 * en IndexedDB y no se crea ningún usuario en el backend. La marca vive en
 * localStorage para sobrevivir recargas.
 */
export const useGuestStore = create<GuestState>()(
  persist(
    (set) => ({
      isGuest: false,
      enterAsGuest: () => set({ isGuest: true }),
      leaveGuest: () => set({ isGuest: false }),
    }),
    { name: 'cup-guest' },
  ),
);
