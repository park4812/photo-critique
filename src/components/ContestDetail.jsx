import { useState, useEffect, useMemo, useRef } from 'react';

const RANK_STYLES = {
  1: { emoji: '🥇', frame: 'contest-frame-gold', label: '1위' },
  2: { emoji: '🥈', frame: 'contest-frame-silver', label: '2위' },
  3: { emoji: '🥉', frame: 'contest-frame-bronze', label: '3위' },
};

const STATUS_INFO = {
  submitting: { label: '접수 중', color: '#60a5fa', desc: '사진을 등록하세요. 등록 기간이 끝나면 투표가 시작됩니다.' },
  voting: { label: '투표 중', color: '#fbbf24', desc: '마음에 드는 사진에 투표하세요!' },
  runoff: { label: '결선 투표', color: '#f97316', desc: '동점자 결선 투표 중입니다!' },
  closed: { label: '종료', color: '#888', desc: '투표가 종료되었습니다.' },
};

// localStorage 기반 토큰 관리
function getEditToken(contestId) {
  try { return localStorage.getItem(`contest_token_${contestId}`) || ''; } catch { return ''; }
}
function setEditToken(contestId, token) {
  try { localStorage.setItem(`contest_token_${contestId}`, token); } catch {}
}
function getAnonEntryId(contestId) {
  try { return localStorage.getItem(`contest_entry_${contestId}`) || ''; } catch { return ''; }
}
function setAnonEntryId(contestId, entryId) {
  try { localStorage.setItem(`contest_entry_${contestId}`, entryId); } catch {}
}
function clearAnonData(contestId) {
  try {
    localStorage.removeItem(`contest_token_${contestId}`);
    localStorage.removeItem(`contest_entry_${contestId}`);
  } catch {}
}
function generateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// 비로그인 투표용 영구 고유 ID (브라우저당 1개)
function getAnonVoterId() {
  try {
    let id = localStorage.getItem('anon_voter_id');
    if (!id) {
      id = 'anon_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('anon_voter_id', id);
    }
    return id;
  } catch { return ''; }
}

// 동점 감지: 1위 득표수가 같은 엔트리들 반환
function findTiedWinners(entries) {
  if (entries.length === 0) return [];
  const sorted = [...entries].sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
  const topVotes = sorted[0].voteCount || 0;
  if (topVotes === 0) return []; // 0표면 동점 처리 안함
  const tied = sorted.filter(e => (e.voteCount || 0) === topVotes);
  return tied.length > 1 ? tied : [];
}

export default function ContestDetail({ contest, onBack, currentUser, isAdmin, isContestManager }) {
  const [entries, setEntries] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [imageBlob, setImageBlob] = useState(null);
  const [votingId, setVotingId] = useState(null);
  const [viewImage, setViewImage] = useState(null);
  const [replacing, setReplacing] = useState(false);
  const [replacePreview, setReplacePreview] = useState(null);
  const [replaceBlob, setReplaceBlob] = useState(null);
  const [anonName, setAnonName] = useState('');
  const [anonToken, setAnonToken] = useState(() => getEditToken(contest.id));
  const [anonEntryId, setAnonEntryIdState] = useState(() => getAnonEntryId(contest.id));
  const [justSubmitted, setJustSubmitted] = useState(false);
  // 동점 처리 상태
  const [showTieModal, setShowTieModal] = useState(false);
  const [tiedEntries, setTiedEntries] = useState([]);
  const [pickingWinner, setPickingWinner] = useState(false); // 관리자 직접 선택 모드
  const fileRef = useRef(null);
  const replaceFileRef = useRef(null);

  const status = contest.status || 'submitting';
  const isSubmitting = status === 'submitting';
  const isVoting = status === 'voting';
  const isRunoff = status === 'runoff';
  const isClosed = status === 'closed';
  const statusInfo = STATUS_INFO[status] || STATUS_INFO.submitting;

  const runoffEntryIds = contest.runoffEntryIds || [];
  const winnerId = contest.winnerId || null;

  // 내 출품작 찾기
  const myEntry = useMemo(() => {
    if (currentUser?.uid) {
      return entries.find(e => e.uploaderUid === currentUser.uid);
    }
    if (anonToken && anonEntryId) {
      return entries.find(e => e.id === anonEntryId && e.editToken === anonToken);
    }
    return null;
  }, [entries, currentUser, anonToken, anonEntryId]);

  useEffect(() => {
    if (myEntry && justSubmitted) setJustSubmitted(false);
  }, [myEntry, justSubmitted]);

  const hasSubmitted = !!myEntry || justSubmitted;

  // 엔트리 실시간 구독
  useEffect(() => {
    let unsub;
    (async () => {
      const { subscribeToEntries } = await import('../services/firebaseService');
      unsub = subscribeToEntries(contest.id, setEntries);
    })();
    return () => { if (unsub) unsub(); };
  }, [contest.id]);

  // 정렬: closed면 투표순 (동점 시 출품순), runoff면 결선 대상만 상단
  const sortedEntries = useMemo(() => {
    if (isClosed) {
      return [...entries].sort((a, b) => {
        const diff = (b.voteCount || 0) - (a.voteCount || 0);
        if (diff !== 0) return diff;
        // 동점이면 출품순 (createdAt 빠른 순)
        const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds || 0) * 1000;
        const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds || 0) * 1000;
        return ta - tb;
      });
    }
    if (isRunoff) {
      // 결선 대상 먼저, 나머지 뒤에
      const runoff = entries.filter(e => runoffEntryIds.includes(e.id));
      const rest = entries.filter(e => !runoffEntryIds.includes(e.id));
      return [...runoff, ...rest];
    }
    return entries;
  }, [entries, isClosed, isRunoff, runoffEntryIds]);

  // winnerId가 있으면 그 엔트리를 맨 위로 (관리자 직접 선택 결과)
  const finalSortedEntries = useMemo(() => {
    if (isClosed && winnerId) {
      const winner = sortedEntries.find(e => e.id === winnerId);
      const rest = sortedEntries.filter(e => e.id !== winnerId);
      return winner ? [winner, ...rest] : sortedEntries;
    }
    return sortedEntries;
  }, [sortedEntries, isClosed, winnerId]);

  // 이미지 선택
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1600;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          setImageBlob(blob);
          setPreview(canvas.toDataURL('image/jpeg', 0.9));
        }, 'image/jpeg', 0.9);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // 출품
  const handleSubmit = async () => {
    if (!imageBlob) return;
    const uploaderUid = currentUser?.uid || '';
    const uploaderName = currentUser
      ? (currentUser.displayName || currentUser.email || '익명')
      : (anonName.trim() || '익명');
    if (!currentUser && !anonName.trim()) {
      alert('이름을 입력해주세요.');
      return;
    }
    setUploading(true);
    try {
      const { submitEntry } = await import('../services/firebaseService');
      const token = currentUser ? '' : generateToken();
      const entryId = await submitEntry(contest.id, imageBlob, uploaderUid, uploaderName, token);
      if (!currentUser && token) {
        setEditToken(contest.id, token);
        setAnonEntryId(contest.id, entryId);
        setAnonToken(token);
        setAnonEntryIdState(entryId);
      }
      setJustSubmitted(true);
      setPreview(null);
      setImageBlob(null);
      setAnonName('');
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  // 투표
  const voterId = getAnonVoterId();

  const handleVote = async (entryId) => {
    if (!voterId) return;
    setVotingId(entryId);
    try {
      const { voteEntry } = await import('../services/firebaseService');
      await voteEntry(contest.id, entryId, voterId);
    } catch (err) {
      console.error('Vote failed:', err);
    } finally {
      setVotingId(null);
    }
  };

  // 단계 진행 (동점 감지 포함)
  const handleAdvance = async () => {
    if (isSubmitting) {
      if (!window.confirm('접수를 마감하고 투표를 시작하시겠습니까?\n등록된 사진이 모두에게 공개됩니다.')) return;
      const { advanceContest } = await import('../services/firebaseService');
      await advanceContest(contest.id, 'voting');
      return;
    }

    if (isVoting || isRunoff) {
      // 투표 종료 전 동점 확인
      const tied = findTiedWinners(isRunoff ? entries.filter(e => runoffEntryIds.includes(e.id)) : entries);
      if (tied.length > 0) {
        setTiedEntries(tied);
        setShowTieModal(true);
        return;
      }
      // 동점 없으면 바로 종료
      if (!window.confirm('투표를 종료하시겠습니까?\n결과와 출품자 이름이 공개됩니다.')) return;
      const { advanceContest } = await import('../services/firebaseService');
      await advanceContest(contest.id, 'closed');
    }
  };

  // 동점 처리: 재투표
  const handleRunoff = async () => {
    const ids = tiedEntries.map(e => e.id);
    const { startRunoff } = await import('../services/firebaseService');
    await startRunoff(contest.id, ids);
    setShowTieModal(false);
    setTiedEntries([]);
  };

  // 동점 처리: 출품순 (빨리 출품한 사람 우선)
  const handleResolveByTime = async () => {
    if (!window.confirm('먼저 출품한 사람이 1위가 됩니다. 종료하시겠습니까?')) return;
    const { advanceContest } = await import('../services/firebaseService');
    await advanceContest(contest.id, 'closed');
    setShowTieModal(false);
    setTiedEntries([]);
  };

  // 동점 처리: 관리자 직접 선택 모드 진입
  const handleStartPicking = () => {
    setShowTieModal(false);
    setPickingWinner(true);
  };

  // 관리자가 1위를 직접 클릭으로 선택
  const handlePickWinner = async (entryId) => {
    const entry = entries.find(e => e.id === entryId);
    if (!window.confirm(`"${entry?.uploaderName || '이 출품작'}"을(를) 1위로 선택하시겠습니까?`)) return;
    const { setContestWinner } = await import('../services/firebaseService');
    await setContestWinner(contest.id, entryId);
    setPickingWinner(false);
  };

  // 삭제
  const handleDelete = async () => {
    if (!window.confirm('이 투표를 완전히 삭제하시겠습니까?')) return;
    const { deleteContest } = await import('../services/firebaseService');
    await deleteContest(contest.id);
    onBack();
  };

  // 내 출품작 삭제
  const handleDeleteMyEntry = async (entryId) => {
    if (!window.confirm('출품을 취소하시겠습니까?')) return;
    const { deleteEntry } = await import('../services/firebaseService');
    await deleteEntry(contest.id, entryId);
    clearAnonData(contest.id);
    setAnonToken('');
    setAnonEntryIdState('');
    setJustSubmitted(false);
  };

  // 사진 교체
  const handleReplaceFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1600;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          setReplaceBlob(blob);
          setReplacePreview(canvas.toDataURL('image/jpeg', 0.9));
        }, 'image/jpeg', 0.9);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleReplace = async (entryId) => {
    if (!replaceBlob) return;
    setReplacing(true);
    try {
      const { replaceEntry } = await import('../services/firebaseService');
      await replaceEntry(contest.id, entryId, replaceBlob);
      setReplacePreview(null);
      setReplaceBlob(null);
    } catch (err) {
      alert('사진 교체 실패: ' + err.message);
    } finally {
      setReplacing(false);
    }
  };

  const canSubmit = isSubmitting && !hasSubmitted;
  const isVotingPhase = isVoting || isRunoff;

  return (
    <div className="contest-detail-container">
      {/* 헤더 */}
      <div className="contest-detail-header">
        <button className="album-back-btn" onClick={onBack}>← 투표 목록</button>
        <div className="contest-detail-title-row">
          <h2 className="album-detail-name">{contest.title}</h2>
          <span className="contest-status-badge" style={{ background: `${statusInfo.color}22`, color: statusInfo.color }}>
            {statusInfo.label}
          </span>
          {isContestManager && (
            <div className="album-detail-actions">
              {!isClosed && (
                <button className="album-action-btn" onClick={handleAdvance} title={isSubmitting ? '투표 시작' : '투표 종료'}>
                  {isSubmitting ? '🗳️' : '🏁'}
                </button>
              )}
              <button className="album-action-btn album-delete" onClick={handleDelete} title="삭제">🗑</button>
            </div>
          )}
        </div>
        {contest.description && <p className="album-detail-desc">{contest.description}</p>}
        <div className="album-detail-meta">
          <span>{entries.length}명 참가</span>
          <span>·</span>
          <span style={{ color: statusInfo.color }}>{statusInfo.desc}</span>
        </div>
        {/* 관리자용 단계 진행 가이드 */}
        {isContestManager && !isClosed && (
          <div className="contest-admin-guide">
            <div className="contest-phase-bar">
              <div className={`contest-phase ${isSubmitting ? 'active' : 'done'}`}>① 접수</div>
              <div className="contest-phase-arrow">→</div>
              <div className={`contest-phase ${isVoting ? 'active' : (isRunoff || isClosed) ? 'done' : ''}`}>② 투표</div>
              <div className="contest-phase-arrow">→</div>
              {isRunoff && (
                <>
                  <div className="contest-phase active" style={{ color: '#f97316' }}>⚡ 결선</div>
                  <div className="contest-phase-arrow">→</div>
                </>
              )}
              <div className={`contest-phase ${isClosed ? 'active' : ''}`}>③ 결과</div>
            </div>
          </div>
        )}
      </div>

      {/* 관리자 직접 선택 모드 안내 */}
      {pickingWinner && (
        <div className="contest-picking-banner">
          <span>👆 1위로 선택할 사진을 클릭하세요</span>
          <button className="album-cancel-btn" onClick={() => setPickingWinner(false)} style={{ marginLeft: '12px' }}>취소</button>
        </div>
      )}

      {/* 접수 단계: 출품 영역 */}
      {canSubmit && (
        <div className="contest-submit-area">
          {!currentUser && (
            <div className="contest-anon-name">
              <input
                type="text"
                placeholder="이름을 입력하세요"
                value={anonName}
                onChange={(e) => setAnonName(e.target.value)}
                maxLength={20}
                className="contest-anon-input"
              />
            </div>
          )}
          {!preview ? (
            <div className="contest-drop-zone" onClick={() => fileRef.current?.click()}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>📸</div>
              <div>사진을 선택하여 출품하세요</div>
              <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '4px' }}>1인 1장만 가능</div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
            </div>
          ) : (
            <div className="contest-preview-area">
              <img src={preview} alt="미리보기" className="contest-preview-img" />
              <div className="contest-preview-actions">
                <button className="album-save-btn" onClick={handleSubmit} disabled={uploading}>
                  {uploading ? '출품 중...' : '출품하기'}
                </button>
                <button className="album-cancel-btn" onClick={() => { setPreview(null); setImageBlob(null); }}>취소</button>
              </div>
            </div>
          )}
        </div>
      )}
      {isSubmitting && hasSubmitted && (
        <div className="contest-submitted-badge">출품 완료! 접수 마감 후 투표가 시작됩니다.</div>
      )}

      {/* 접수 단계: 사진은 숨기고 참가자 수만 표시 */}
      {isSubmitting && (
        <div className="contest-waiting">
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
          <p>{entries.length}명이 출품했습니다</p>
          <p style={{ fontSize: '12px', opacity: 0.5 }}>접수 마감 후 사진이 공개됩니다</p>
          {myEntry && (
            <div className="contest-my-preview">
              <p style={{ fontSize: '12px', marginBottom: '8px', opacity: 0.7 }}>내 출품작:</p>
              {replacePreview ? (
                <div className="contest-replace-area">
                  <div className="contest-replace-compare">
                    <div className="contest-replace-col">
                      <span style={{ fontSize: '11px', opacity: 0.5 }}>현재</span>
                      <img src={myEntry.imageUrl} alt="" className="contest-my-thumb" />
                    </div>
                    <span style={{ fontSize: '20px', opacity: 0.4 }}>→</span>
                    <div className="contest-replace-col">
                      <span style={{ fontSize: '11px', opacity: 0.5 }}>변경</span>
                      <img src={replacePreview} alt="" className="contest-my-thumb" />
                    </div>
                  </div>
                  <div className="contest-preview-actions" style={{ marginTop: '8px' }}>
                    <button className="album-save-btn" onClick={() => handleReplace(myEntry.id)} disabled={replacing}>
                      {replacing ? '교체 중...' : '교체하기'}
                    </button>
                    <button className="album-cancel-btn" onClick={() => { setReplacePreview(null); setReplaceBlob(null); }}>취소</button>
                  </div>
                </div>
              ) : (
                <>
                  <img src={myEntry.imageUrl} alt="" className="contest-my-thumb" onClick={() => setViewImage(myEntry.imageUrl)} />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button className="contest-my-badge change" onClick={() => replaceFileRef.current?.click()}>📷 사진 변경</button>
                    <button className="contest-my-badge" onClick={() => handleDeleteMyEntry(myEntry.id)}>출품 취소</button>
                  </div>
                  <input ref={replaceFileRef} type="file" accept="image/*" onChange={handleReplaceFileSelect} style={{ display: 'none' }} />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* 결선 안내 배너 */}
      {isRunoff && (
        <div className="contest-runoff-banner">
          ⚡ 동점자 결선 투표 — {runoffEntryIds.length}명의 동점자 중 1위를 가려주세요!
        </div>
      )}

      {/* 투표/결선/종료 단계: 사진 그리드 */}
      {(isVotingPhase || isClosed) && finalSortedEntries.length > 0 && (
        <div className={`contest-entries-grid ${isClosed ? 'results' : ''}`}>
          {finalSortedEntries.map((entry, idx) => {
            const isRunoffEntry = isRunoff && runoffEntryIds.includes(entry.id);
            const isNonRunoffEntry = isRunoff && !runoffEntryIds.includes(entry.id);
            const rank = isClosed ? idx + 1 : null;
            const isAdminPicked = isClosed && winnerId && entry.id === winnerId;
            const displayRank = isAdminPicked ? 1 : rank;
            const rankStyle = displayRank && RANK_STYLES[displayRank];
            const voted = entry.votes?.includes(voterId);

            return (
              <div
                key={entry.id}
                className={`contest-entry ${rankStyle?.frame || ''} ${isClosed && displayRank > 3 ? 'contest-frame-normal' : ''} ${isNonRunoffEntry ? 'contest-entry-dimmed' : ''} ${pickingWinner && tiedEntries.some(t => t.id === entry.id) ? 'contest-entry-pickable' : ''}`}
                onClick={pickingWinner && tiedEntries.some(t => t.id === entry.id) ? () => handlePickWinner(entry.id) : undefined}
                style={pickingWinner && tiedEntries.some(t => t.id === entry.id) ? { cursor: 'pointer' } : undefined}
              >
                {/* 순위 뱃지 */}
                {rankStyle && (
                  <div className="contest-rank-badge">
                    <span className="contest-rank-emoji">{rankStyle.emoji}</span>
                    <span className="contest-rank-label">{rankStyle.label}</span>
                    {isAdminPicked && <span className="contest-admin-pick-tag">관리자 선정</span>}
                  </div>
                )}
                {isClosed && displayRank > 3 && (
                  <div className="contest-rank-badge normal">
                    <span className="contest-rank-label">{displayRank}위</span>
                  </div>
                )}

                {/* 결선 마크 */}
                {isRunoffEntry && (
                  <div className="contest-runoff-mark">⚡ 결선</div>
                )}

                {/* 사진 */}
                <div className="contest-entry-img-wrap" onClick={!pickingWinner ? () => setViewImage(entry.imageUrl) : undefined}>
                  <img src={entry.imageUrl} alt="" className="contest-entry-img" />
                </div>

                {/* 하단 정보 */}
                <div className="contest-entry-info">
                  {isClosed && (
                    <div className="contest-entry-name">{entry.uploaderName}</div>
                  )}

                  <div className="contest-entry-vote-row">
                    {isVotingPhase && voterId && !isNonRunoffEntry && !pickingWinner && (
                      <button
                        className={`contest-vote-btn ${voted ? 'voted' : ''}`}
                        onClick={(e) => { e.stopPropagation(); handleVote(entry.id); }}
                        disabled={votingId === entry.id}
                      >
                        {voted ? '❤️' : '🤍'} {entry.voteCount || 0}
                      </button>
                    )}
                    {isNonRunoffEntry && (
                      <span className="contest-entry-votes" style={{ opacity: 0.4 }}>결선 제외</span>
                    )}
                    {isClosed && (
                      <span className="contest-entry-votes">❤️ {entry.voteCount || 0}표</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(isVotingPhase || isClosed) && finalSortedEntries.length === 0 && (
        <div className="album-empty">
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏆</div>
          <p>출품작이 없습니다</p>
        </div>
      )}

      {/* 동점 처리 모달 */}
      {showTieModal && (
        <div className="modal-overlay" onClick={() => setShowTieModal(false)}>
          <div className="contest-tie-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="contest-tie-title">⚖️ 동점 발생!</h3>
            <p className="contest-tie-desc">
              {tiedEntries.length}명이 {tiedEntries[0]?.voteCount || 0}표로 동점입니다.
            </p>
            <div className="contest-tie-entries">
              {tiedEntries.map(entry => (
                <div key={entry.id} className="contest-tie-entry">
                  <img src={entry.imageUrl} alt="" className="contest-tie-thumb" />
                  <span className="contest-tie-name">{entry.uploaderName}</span>
                  <span className="contest-tie-votes">❤️ {entry.voteCount || 0}</span>
                </div>
              ))}
            </div>
            <div className="contest-tie-actions">
              <button className="contest-tie-btn runoff" onClick={handleRunoff}>
                🔄 재투표
                <span className="contest-tie-btn-desc">동점자만 다시 투표</span>
              </button>
              <button className="contest-tie-btn pick" onClick={handleStartPicking}>
                👆 직접 선택
                <span className="contest-tie-btn-desc">관리자가 1위 결정</span>
              </button>
              <button className="contest-tie-btn time" onClick={handleResolveByTime}>
                ⏱ 출품순
                <span className="contest-tie-btn-desc">먼저 출품한 사람 우선</span>
              </button>
            </div>
            <button className="contest-tie-close" onClick={() => setShowTieModal(false)}>닫기</button>
          </div>
        </div>
      )}

      {/* 이미지 확대 */}
      {viewImage && !pickingWinner && (
        <div className="modal-overlay" onClick={() => setViewImage(null)}>
          <img src={viewImage} alt="" style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: '12px' }} />
        </div>
      )}
    </div>
  );
}
