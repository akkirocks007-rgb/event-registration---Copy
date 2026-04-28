import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

/**
 * Logs an auditable action to Firestore's 'auditLogs' collection.
 * Silently fails so it never breaks the calling code.
 *
 * @param {import('firebase/firestore').Firestore} db
 * @param {{ uid: string, email: string, role?: string } | null} user
 * @param {string} action        - e.g. 'CREATE_EVENT', 'DELETE_ATTENDEE'
 * @param {string} targetType    - e.g. 'event', 'attendee', 'device'
 * @param {string} targetId      - Firestore document ID of the affected resource
 * @param {Object} [details={}]  - Any extra structured metadata to record
 */
export const logAction = async (db, user, action, targetType, targetId, details = {}) => {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      userId: user?.uid ?? null,
      userEmail: user?.email ?? null,
      userRole: user?.role ?? null,
      action,
      targetType,
      targetId,
      details,
      timestamp: serverTimestamp(),
    });
  } catch {
    // Intentionally swallowed — audit logging must never break calling code
  }
};
