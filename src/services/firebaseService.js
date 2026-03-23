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
  collection, collectionGroup, doc, getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, Timestamp
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

export async function deleteComment(photoId, commentId) {
  await deleteDoc(doc(db, 'photos', photoId, 'comments', commentId));
}

// ===== 내 사진 댓글 알림 =====

// 내 사진들에 달린 새 댓글을 실시간 구독
export function subscribeToMyPhotoNotifications(myPhotoIds, lastCheckedTime, callback) {
  if (!myPhotoIds.length) { callback([]); return () => {}; }

  // 각 내 사진의 댓글 서브컬렉션을 구독
  const unsubs = [];
  const notifMap = new Map(); // photoId -> comments[]

  for (const photoId of myPhotoIds) {
    const q = query(
      collection(db, 'photos', photoId, 'comments'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const newComments = snapshot.docs
        .map(d => ({ id: d.id, photoId, ...d.data() }))
        .filter(c => {
          if (!c.createdAt) return false;
          const t = c.createdAt.toDate ? c.createdAt.toDate() : new Date(c.createdAt);
          return t > lastCheckedTime;
        });
      notifMap.set(photoId, newComments);
      // 모든 새 댓글 합산 후 콜백
      const all = [];
      notifMap.forEach(v => all.push(...v));
      all.sort((a, b) => {
        const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return tb - ta;
      });
      callback(all);
    });
    unsubs.push(unsub);
  }

  return () => unsubs.forEach(u => u());
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

// ===== Tag Management =====

/**
 * 모든 사진에서 특정 태그를 삭제
 */
export async function deleteTag(tagName) {
  const q = query(collection(db, 'photos'), where('aiTags', 'array-contains', tagName));
  const snapshot = await getDocs(q);
  const updates = snapshot.docs.map(d => {
    const tags = d.data().aiTags || [];
    return updateDoc(d.ref, {
      aiTags: tags.filter(t => t !== tagName),
    });
  });
  await Promise.all(updates);
  return snapshot.size;
}

/**
 * 여러 태그를 하나로 병합 (sourceTags → targetTag)
 * 모든 사진에서 sourceTags를 targetTag로 교체, 중복 제거
 */
export async function mergeTags(sourceTags, targetTag) {
  const allSourceTags = [...new Set([...sourceTags, targetTag])];
  // 각 소스 태그를 가진 사진을 조회
  const photoMap = new Map();
  for (const tag of allSourceTags) {
    const q = query(collection(db, 'photos'), where('aiTags', 'array-contains', tag));
    const snapshot = await getDocs(q);
    snapshot.docs.forEach(d => {
      if (!photoMap.has(d.id)) photoMap.set(d.id, { ref: d.ref, tags: d.data().aiTags || [] });
    });
  }
  // 각 사진에서 소스 태그들을 targetTag 하나로 교체
  const updates = [];
  photoMap.forEach(({ ref: docRef, tags }) => {
    const newTags = tags.filter(t => !allSourceTags.includes(t));
    newTags.push(targetTag);
    // 중복 제거
    const uniqueTags = [...new Set(newTags)];
    updates.push(updateDoc(docRef, { aiTags: uniqueTags }));
  });
  await Promise.all(updates);
  return photoMap.size;
}

/**
 * 특정 태그 이름 변경 (모든 사진에서)
 */
export async function renameTag(oldName, newName) {
  const q = query(collection(db, 'photos'), where('aiTags', 'array-contains', oldName));
  const snapshot = await getDocs(q);
  const updates = snapshot.docs.map(d => {
    const tags = d.data().aiTags || [];
    const newTags = [...new Set(tags.map(t => t === oldName ? newName : t))];
    return updateDoc(d.ref, { aiTags: newTags });
  });
  await Promise.all(updates);
  return snapshot.size;
}

/**
 * 특정 사진에 태그 추가
 */
export async function addTagToPhoto(photoId, tagName) {
  const photoRef = doc(db, 'photos', photoId);
  const photoSnap = await getDoc(photoRef);
  if (!photoSnap.exists()) return;
  const tags = photoSnap.data().aiTags || [];
  if (!tags.includes(tagName)) {
    await updateDoc(photoRef, { aiTags: [...tags, tagName] });
  }
}

/**
 * AI로 태그 목록 분석하여 병합 제안 받기
 */
export async function analyzeTagsForMerge(tags) {
  const functions = getFunctions(undefined, 'asia-northeast1');
  const analyzeFn = httpsCallable(functions, 'analyzeTagsForMerge');
  const result = await analyzeFn({ tags });
  return result.data;
}

// ===== Albums =====

export function subscribeToAlbums(callback) {
  const q = query(collection(db, 'albums'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const albums = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(albums);
  });
}

export async function createAlbum(albumData) {
  const docRef = await addDoc(collection(db, 'albums'), {
    ...albumData,
    photoIds: [],
    photoCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateAlbum(albumId, data) {
  await updateDoc(doc(db, 'albums', albumId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAlbum(albumId) {
  await deleteDoc(doc(db, 'albums', albumId));
}

export async function addPhotoToAlbum(albumId, photoId) {
  const albumRef = doc(db, 'albums', albumId);
  const albumSnap = await getDoc(albumRef);
  if (!albumSnap.exists()) throw new Error('앨범을 찾을 수 없습니다');
  const data = albumSnap.data();
  const photoIds = data.photoIds || [];
  if (photoIds.includes(photoId)) return; // already added
  const updated = [...photoIds, photoId];
  await updateDoc(albumRef, {
    photoIds: updated,
    photoCount: updated.length,
    updatedAt: serverTimestamp(),
  });
}

export async function removePhotoFromAlbum(albumId, photoId) {
  const albumRef = doc(db, 'albums', albumId);
  const albumSnap = await getDoc(albumRef);
  if (!albumSnap.exists()) return;
  const data = albumSnap.data();
  const updated = (data.photoIds || []).filter(id => id !== photoId);
  await updateDoc(albumRef, {
    photoIds: updated,
    photoCount: updated.length,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToAlbum(albumId, callback) {
  return onSnapshot(doc(db, 'albums', albumId), (snapshot) => {
    if (snapshot.exists()) {
      callback({ id: snapshot.id, ...snapshot.data() });
    }
  });
}

// ===== Contests (투표) =====

export function subscribeToContests(callback) {
  const q = query(collection(db, 'contests'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function createContest(data) {
  const docRef = await addDoc(collection(db, 'contests'), {
    ...data,
    status: 'submitting', // submitting → voting → closed
    entryCount: 0,
    createdAt: serverTimestamp(),
    closedAt: null,
  });
  return docRef.id;
}

export async function advanceContest(contestId, newStatus) {
  const update = { status: newStatus };
  if (newStatus === 'closed') update.closedAt = serverTimestamp();
  if (newStatus === 'voting') update.votingStartedAt = serverTimestamp();
  // 결선에서 종료 시 runoffEntryIds 유지 (결과 정렬에 사용)
  await updateDoc(doc(db, 'contests', contestId), update);
}

// 결선 투표 시작 (동점 엔트리만 투표 초기화)
export async function startRunoff(contestId, entryIds) {
  for (const eid of entryIds) {
    const entryRef = doc(db, 'contests', contestId, 'entries', eid);
    await updateDoc(entryRef, { votes: [], voteCount: 0 });
  }
  await updateDoc(doc(db, 'contests', contestId), {
    status: 'runoff',
    runoffEntryIds: entryIds,
  });
}

// 관리자 직접 1위 선택
export async function setContestWinner(contestId, winnerId) {
  await updateDoc(doc(db, 'contests', contestId), {
    winnerId,
    status: 'closed',
    closedAt: serverTimestamp(),
    runoffEntryIds: null,
  });
}

export async function deleteContest(contestId) {
  // entries 서브컬렉션 삭제
  const entriesRef = collection(db, 'contests', contestId, 'entries');
  const snap = await getDocs(entriesRef);
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  // Storage 파일 삭제
  try {
    const folderRef = ref(storage, `contests/${contestId}`);
    const fileList = await listAll(folderRef);
    await Promise.all(fileList.items.map(item => deleteObject(item)));
  } catch (e) { console.warn('Contest storage cleanup:', e); }
  await deleteDoc(doc(db, 'contests', contestId));
}

export function subscribeToEntries(contestId, callback) {
  const q = query(collection(db, 'contests', contestId, 'entries'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function submitEntry(contestId, imageBlob, uploaderUid, uploaderName, editToken) {
  // 이미 출품했는지 확인 (로그인 유저: uid, 비로그인: editToken으로 localStorage 기반)
  if (uploaderUid) {
    const q = query(
      collection(db, 'contests', contestId, 'entries'),
      where('uploaderUid', '==', uploaderUid)
    );
    const existing = await getDocs(q);
    if (!existing.empty) throw new Error('이미 이 콘테스트에 출품하셨습니다.');
  }

  // 엔트리 문서 생성
  const entryRef = doc(collection(db, 'contests', contestId, 'entries'));
  const entryId = entryRef.id;

  // Storage에 이미지 업로드
  const storageRef = ref(storage, `contests/${contestId}/${entryId}.jpg`);
  await uploadBytes(storageRef, imageBlob, { contentType: 'image/jpeg' });
  const imageUrl = await getDownloadURL(storageRef);

  const entryData = {
    imageUrl,
    uploaderUid: uploaderUid || '',
    uploaderName,
    votes: [],
    voteCount: 0,
    createdAt: serverTimestamp(),
  };
  // 비로그인 유저: editToken 저장
  if (editToken) entryData.editToken = editToken;

  await setDoc(entryRef, entryData);

  // 콘테스트 entryCount 증가
  const contestRef = doc(db, 'contests', contestId);
  const contestSnap = await getDoc(contestRef);
  if (contestSnap.exists()) {
    await updateDoc(contestRef, {
      entryCount: (contestSnap.data().entryCount || 0) + 1,
    });
  }

  return entryId;
}

// 출품작 사진 교체 (접수 단계에서만)
export async function replaceEntry(contestId, entryId, newImageBlob) {
  // 기존 이미지 덮어쓰기
  const storageRef = ref(storage, `contests/${contestId}/${entryId}.jpg`);
  await uploadBytes(storageRef, newImageBlob, { contentType: 'image/jpeg' });
  const imageUrl = await getDownloadURL(storageRef);

  // 엔트리 문서 업데이트
  const entryRef = doc(db, 'contests', contestId, 'entries', entryId);
  await updateDoc(entryRef, { imageUrl, updatedAt: serverTimestamp() });
}

export async function voteEntry(contestId, entryId, voterUid) {
  const entryRef = doc(db, 'contests', contestId, 'entries', entryId);
  const entrySnap = await getDoc(entryRef);
  if (!entrySnap.exists()) return;
  const data = entrySnap.data();
  const votes = data.votes || [];

  if (votes.includes(voterUid)) {
    // 이미 투표함 → 취소
    const updated = votes.filter(v => v !== voterUid);
    await updateDoc(entryRef, { votes: updated, voteCount: updated.length });
  } else {
    // 다른 엔트리에 이미 투표했으면 먼저 취소 (1인 1표)
    const entriesSnap = await getDocs(collection(db, 'contests', contestId, 'entries'));
    for (const d of entriesSnap.docs) {
      if (d.id === entryId) continue;
      const v = d.data().votes || [];
      if (v.includes(voterUid)) {
        const cleaned = v.filter(uid => uid !== voterUid);
        await updateDoc(d.ref, { votes: cleaned, voteCount: cleaned.length });
      }
    }
    // 투표
    const updated = [...votes, voterUid];
    await updateDoc(entryRef, { votes: updated, voteCount: updated.length });
  }
}

export async function deleteEntry(contestId, entryId) {
  // Storage 삭제
  try {
    const storageRef = ref(storage, `contests/${contestId}/${entryId}.jpg`);
    await deleteObject(storageRef);
  } catch (e) { console.warn('Entry image cleanup:', e); }
  await deleteDoc(doc(db, 'contests', contestId, 'entries', entryId));
  // entryCount 감소
  const contestRef = doc(db, 'contests', contestId);
  const contestSnap = await getDoc(contestRef);
  if (contestSnap.exists()) {
    await updateDoc(contestRef, {
      entryCount: Math.max(0, (contestSnap.data().entryCount || 0) - 1),
    });
  }
}

// ===== 투표 관리자 권한 =====

export function subscribeToContestManagers(callback) {
  return onSnapshot(doc(db, 'settings', 'contestManagers'), (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data().uids || []);
    } else {
      callback([]);
    }
  });
}

export async function setContestManagers(uids) {
  await setDoc(doc(db, 'settings', 'contestManagers'), { uids });
}

// ===== Legacy (for sample data mode) =====

export async function addPhoto(photoData) {
  const docRef = await addDoc(collection(db, 'photos'), {
    ...photoData,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}
