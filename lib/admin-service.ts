import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { UserProfile } from '@/context/auth-context';

export interface UploadRecord {
  id: string;
  userId: string;
  userEmail: string;
  userName?: string;
  fileName: string;
  fileSize: number;
  rowCount: number;
  openingBalance: number;
  closingBalance: number;
  netCashFlow: number;
  totalInflow: number;
  totalOutflow: number;
  healthScore: number;
  uploadedAt: string;
}

/**
 * Record a parsed statement analysis into Firestore
 */
export async function recordStatementUpload(params: {
  userId: string;
  userEmail: string;
  userName?: string;
  fileName: string;
  fileSize: number;
  rowCount: number;
  openingBalance: number;
  closingBalance: number;
  netCashFlow: number;
  totalInflow: number;
  totalOutflow: number;
  healthScore: number;
  currentUploadCount?: number;
}): Promise<string> {
  const uploadId = `upl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const uploadRef = doc(db, 'uploads', uploadId);
  const path = `uploads/${uploadId}`;

  const record: Omit<UploadRecord, 'id'> = {
    userId: params.userId,
    userEmail: params.userEmail,
    userName: params.userName || params.userEmail.split('@')[0],
    fileName: params.fileName,
    fileSize: params.fileSize,
    rowCount: params.rowCount,
    openingBalance: params.openingBalance,
    closingBalance: params.closingBalance,
    netCashFlow: params.netCashFlow,
    totalInflow: params.totalInflow,
    totalOutflow: params.totalOutflow,
    healthScore: params.healthScore,
    uploadedAt: new Date().toISOString(),
  };

  try {
    await setDoc(uploadRef, record);

    // Update user's uploadedFilesCount
    const userRef = doc(db, 'users', params.userId);
    try {
      await updateDoc(userRef, {
        uploadedFilesCount: (params.currentUploadCount || 0) + 1,
        lastActiveAt: new Date().toISOString(),
      });
    } catch {
      // User update is secondary
    }

    return uploadId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Admin: Fetch all registered users
 */
export async function fetchAllUsers(): Promise<UserProfile[]> {
  const path = 'users';
  try {
    const q = query(collection(db, path));
    const snap = await getDocs(q);
    const users: UserProfile[] = [];
    snap.forEach((docSnap) => {
      users.push({ ...docSnap.data() } as UserProfile);
    });
    // Sort by last active descending
    users.sort((a, b) => new Date(b.lastActiveAt || 0).getTime() - new Date(a.lastActiveAt || 0).getTime());
    return users;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * Admin: Fetch all bank statement uploads across platform
 */
export async function fetchAllUploads(): Promise<UploadRecord[]> {
  const path = 'uploads';
  try {
    const q = query(collection(db, path));
    const snap = await getDocs(q);
    const records: UploadRecord[] = [];
    snap.forEach((docSnap) => {
      records.push({ id: docSnap.id, ...docSnap.data() } as UploadRecord);
    });
    records.sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
    return records;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * User: Fetch own uploads
 */
export async function fetchUserUploads(userId: string): Promise<UploadRecord[]> {
  const path = 'uploads';
  try {
    const q = query(collection(db, path), where('userId', '==', userId), limit(50));
    const snap = await getDocs(q);
    const records: UploadRecord[] = [];
    snap.forEach((docSnap) => {
      records.push({ id: docSnap.id, ...docSnap.data() } as UploadRecord);
    });
    records.sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
    return records;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * Admin: Suspend or Unsuspend a user
 */
export async function toggleUserSuspension(userId: string, newStatus: 'active' | 'suspended'): Promise<void> {
  const path = `users/${userId}`;
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { status: newStatus });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Admin: Change a user's role (user <-> admin)
 */
export async function updateUserRole(userId: string, newRole: 'user' | 'admin'): Promise<void> {
  const path = `users/${userId}`;
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { role: newRole });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Admin: Remove a user record
 */
export async function deleteUserRecord(userId: string): Promise<void> {
  const path = `users/${userId}`;
  try {
    const userRef = doc(db, 'users', userId);
    await deleteDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Admin: Delete an upload record
 */
export async function deleteUploadRecord(uploadId: string): Promise<void> {
  const path = `uploads/${uploadId}`;
  try {
    const uploadRef = doc(db, 'uploads', uploadId);
    await deleteDoc(uploadRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
