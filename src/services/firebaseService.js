/**
 * Firebase Service Layer
 *
 * Cloud Function 방식:
 *   1. 클라이언트가 Firestore에 photo doc 생성 + Storage에 이미지 업로드
 *   2. Storage 트리거 → Cloud Function이 AI 평가 자동 실행
 *   3. Cloud Function이 Firestore에 scores/critique 업데이트
 *   4. 클라이언트는 onSnapshot으로 실시간 반영
 *
 * Firestore Collections:
 *   - photos: Main photo documents
 *   - photos/{id}/comments: Subcollection for user critiques
 *
 * Storage:
 *   - photos/{id}/original.jpg   ← 업로드하면 Cloud Function 트리거
 *   - photos/{id}/thumbnail.jpg  ← Cloud Function이 자동 생성
 */

import { db, storage } from '../firebase';
import {
  collection, doc, getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp
} from 'firebase/firestore';
import {
  ref, uploadBytes, getDownloadURL, deleteObject, listAll
} from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';

// ===== Photos =====

export async function fetchPhotos(filters = {}) {
  const photosRef = collection(db, 'photos');
  const constraints = [];

  if (filters.category && filters.category !== '전체') {
    constraints.push(where('category', '==', filters.category));
  }
  if (filters.sortBy === 'totalScore') {
    constraints.push(orderBy('totalScore', 'desc'));
  } else {
    constraints.push(orderBy('date', 'desc'));
  }

  const q = constraints.length > 0
    ? query(photosRef, ...constraints)
    : photosRef;

  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Subscribe to real-time photo updates.
 * AI 평가가 완료되면 scores/critique 필드가 자동으로 업데이트되고,
 * onSnapshot이 이를 감지하여 UI에 실시간 반영됨.
 */
export function subscribeToPhotos(callback) {
  const q = query(collection(db, 'photos'), orderBy('date', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const photos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(photos);
  });
}

/**
 * Subscribe to a single photo (for side panel real-time updates)
 */
export function subscribeToPhoto(photoId, callback) {
  return onSnapshot(doc(db, 'photos', photoId), (snapshot) => {
    if (snapshot.exists()) {
      callback({ id: snapshot.id, ...snapshot.data() });
    }
  });
}

/**
 * Upload a photo: creates Firestore doc first, then uploads image to Storage.
 * Storage upload triggers Cloud Function for:
 *   - AI auto-evaluation (scores + critique)
 *   - Thumbnail generation
 *
 * @param {Object} photoData - Photo metadata (title, category, etc.)
 * @param {Blob} imageBlob - Resized image blob
 * @returns {string} photoId
 */
export async function uploadPhoto(photoData, imageBlob) {
  // 1. Create Firestore document first (so Cloud Function can find it)
  const photoId = doc(collection(db, 'photos')).id;

  await setDoc(doc(db, 'photos', photoId), {
    ...photoData,
    id: photoId,
    scores: {
      composition: 0, lighting: 0, color: 0, focus: 0,
      storytelling: 0, timing: 0, postProcessing: 0
    },
    totalScore: 0,
    critique: null,
    aiEvaluated: false,
    aiStatus: 'pending', // pending → processing → done → error
    createdAt: serverTimestamp(),
  });

  // 2. Upload image to Storage → triggers Cloud Function
  const storageRef = ref(storage, `photos/${photoId}/original.jpg`);
  await uploadBytes(storageRef, imageBlob, {
    contentType: 'image/jpeg',
  });

  // 3. Get download URL and update doc
  const imageUrl = await getDownloadURL(storageRef);
  await updateDoc(doc(db, 'photos', photoId), {
    imageUrl,
    thumbnailUrl: imageUrl, // Will be replaced by Cloud Function's thumbnail
  });

  return photoId;
}

/**
 * Trigger 3-AI debate evaluation (Claude + GPT-4 + Gemini)
 */
export async function debateEvaluatePhoto(photoId) {
  const functions = getFunctions(undefined, 'asia-northeast1');
  const debateEvaluate = httpsCallable(functions, 'debateEvaluatePhoto');

  // Mark as debate processing
  await updateDoc(doc(db, 'photos', photoId), {
    debateStatus: 'processing',
  });

  const result = await debateEvaluate({ photoId });
  return result.data;
}

/**
 * Manually trigger re-evaluation via callable Cloud Function
 */
export async function reEvaluatePhoto(photoId) {
  const functions = getFunctions(undefined, 'asia-northeast1');
  const reEvaluate = httpsCallable(functions, 'reEvaluatePhoto');

  // Mark as processing
  await updateDoc(doc(db, 'photos', photoId), {
    aiStatus: 'processing',
    aiEvaluated: false,
  });

  const result = await reEvaluate({ photoId });
  return result.data;
}

// ===== Comments (User Critiques) =====

export async function fetchComments(photoId) {
  const commentsRef = collection(db, 'photos', photoId, 'comments');
  const q = query(commentsRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function subscribeToComments(photoId, callback) {
  const q = query(
    collection(db, 'photos', photoId, 'comments'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const comments = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(comments);
  });
}

export async function addComment(photoId, commentData) {
  const commentsRef = collection(db, 'photos', photoId, 'comments');
  const docRef = await addDoc(commentsRef, {
    ...commentData,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

// ===== Delete Photo =====

/**
 * Delete a photo: removes Firestore doc, comments subcollection, and Storage files
 */
export async function deletePhoto(photoId) {
  // 1. Delete comments subcollection
  const commentsRef = collection(db, 'photos', photoId, 'comments');
  const commentsSnap = await getDocs(commentsRef);
  const deleteComments = commentsSnap.docs.map(d => deleteDoc(d.ref));
  await Promise.all(deleteComments);

  // 2. Delete Storage files (original + thumbnail)
  try {
    const folderRef = ref(storage, `photos/${photoId}`);
    const fileList = await listAll(folderRef);
    await Promise.all(fileList.items.map(item => deleteObject(item)));
  } catch (err) {
    console.warn('Storage cleanup error (may not exist):', err);
  }

  // 3. Delete Firestore document
  await deleteDoc(doc(db, 'photos', photoId));
}

// ===== Admin: User Management =====

export async function listUsers() {
  const functions = getFunctions(undefined, 'asia-northeast1');
  const listUsersFn = httpsCallable(functions, 'listUsers');
  const result = await listUsersFn();
  return result.data.users;
}

export async function deleteAuthUser(uid) {
  const functions = getFunctions(undefined, 'asia-northeast1');
  const deleteUserFn = httpsCallable(functions, 'deleteAuthUser');
  const result = await deleteUserFn({ uid });
  return result.data;
}

export async function reTagAllPhotos() {
  const functions = getFunctions(undefined, 'asia-northeast1');
  const reTagFn = httpsCallable(functions, 'reTagAllPhotos');
  const result = await reTagFn();
  return result.data;
}

// ===== Legacy (for sample data mode) =====

export async function addPhoto(photoData) {
  const docRef = await addDoc(collection(db, 'photos'), {
    ...photoData,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}
