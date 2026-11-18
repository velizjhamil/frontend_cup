import { submitAttempt } from '../api/client';
import type { SubmitAttemptBody } from '../types/attempt';
import { db } from './db';

/**
 * Guarda el payload de un intento terminado sin conexión para reintentarlo
 * más tarde con `syncPendingAttempts`.
 */
export async function queuePendingAttempt(payload: SubmitAttemptBody): Promise<string> {
  const id = crypto.randomUUID();
  await db.pendingAttempts.put({ id, payload, createdAt: Date.now() });
  return id;
}

/** Cantidad de intentos todavía sin enviar (para mostrar un indicador si hace falta). */
export function countPendingAttempts(): Promise<number> {
  return db.pendingAttempts.count();
}

// Evita que dos disparos casi simultáneos (el del montaje y un evento `online`,
// o dos eventos `online` seguidos) arranquen dos sincronizaciones en paralelo
// y envíen el mismo intento dos veces.
let isSyncing = false;

/**
 * Envía al backend los intentos pendientes guardados mientras no había
 * conexión, en orden de creación. Si uno falla, corta el resto de la cola
 * para reintentar todo junto en el próximo evento `online` en vez de generar
 * una cascada de errores.
 */
export async function syncPendingAttempts(): Promise<void> {
  if (isSyncing || !navigator.onLine) return;

  isSyncing = true;
  try {
    const pending = await db.pendingAttempts.toArray();
    const sorted = pending.sort((a, b) => a.createdAt - b.createdAt);

    for (const item of sorted) {
      try {
        await submitAttempt(item.payload);
        await db.pendingAttempts.delete(item.id);
      } catch (error) {
        console.error(
          '[offlineSync] No se pudo sincronizar un intento pendiente, se reintentará luego:',
          error,
        );
        break;
      }
    }
  } finally {
    isSyncing = false;
  }
}
