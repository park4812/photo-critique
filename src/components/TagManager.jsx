import { useState, useMemo } from 'react';

export default function TagManager({ photos, onClose }) {
  const [selectedTags, setSelectedTags] = useState(new Set());
  const [mergeTarget, setMergeTarget] = useState('');
  const [renameFrom, setRenameFrom] = useState(null);
  const [renameTo, setRenameTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  // AI 정리 관련
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplying, setAiApplying] = useState(new Set()); // 적용 중인 그룹 인덱스
  const [aiApplied, setAiApplied] = useState(new Set()); // 적용 완료된 그룹 인덱스

  // 모든 태그와 사용 횟수 집계
  const tagStats = useMemo(() => {
    const map = new Map();
    photos.forEach(p => {
      if (p.aiTags && Array.isArray(p.aiTags)) {
        p.aiTags.forEach(t => {
          map.set(t, (map.get(t) || 0) + 1);
        });
      }
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [photos]);

  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return tagStats;
    const q = searchQuery.toLowerCase();
    return tagStats.filter(t => t.name.toLowerCase().includes(q));
  }, [tagStats, searchQuery]);

  const toggleTag = (name) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const showResult = (msg, isError = false) => {
    setResult({ msg, isError });
    setTimeout(() => setResult(null), 4000);
  };

  // 태그 삭제
  const handleDelete = async () => {
    if (selectedTags.size === 0) return;
    const tagList = Array.from(selectedTags);
    if (!window.confirm(`선택한 ${tagList.length}개 태그를 삭제하시겠습니까?\n${tagList.join(', ')}\n\n해당 태그가 모든 사진에서 제거됩니다.`)) return;
    setLoading(true);
    try {
      const { deleteTag } = await import('../services/firebaseService');
      let total = 0;
      for (const tag of tagList) {
        total += await deleteTag(tag);
      }
      setSelectedTags(new Set());
      showResult(`${tagList.length}개 태그 삭제 완료 (${total}장 사진 수정)`);
    } catch (err) {
      showResult('삭제 실패: ' + err.message, true);
    } finally {
      setLoading(false);
    }
  };

  // 태그 병합
  const handleMerge = async () => {
    if (selectedTags.size < 2 && !mergeTarget.trim()) return;
    const target = mergeTarget.trim();
    if (!target) {
      showResult('병합할 대상 태그명을 입력하세요', true);
      return;
    }
    const sourceTags = Array.from(selectedTags);
    if (!window.confirm(`선택한 ${sourceTags.length}개 태그를 "${target}"(으)로 병합하시겠습니까?\n\n${sourceTags.join(', ')} → ${target}`)) return;
    setLoading(true);
    try {
      const { mergeTags } = await import('../services/firebaseService');
      const count = await mergeTags(sourceTags, target);
      setSelectedTags(new Set());
      setMergeTarget('');
      showResult(`"${target}"(으)로 병합 완료 (${count}장 사진 수정)`);
    } catch (err) {
      showResult('병합 실패: ' + err.message, true);
    } finally {
      setLoading(false);
    }
  };

  // 태그 이름 변경
  const handleRename = async () => {
    if (!renameFrom || !renameTo.trim()) return;
    const newName = renameTo.trim();
    if (renameFrom === newName) { setRenameFrom(null); return; }
    if (!window.confirm(`"${renameFrom}" → "${newName}"(으)로 이름을 변경하시겠습니까?`)) return;
    setLoading(true);
    try {
      const { renameTag } = await import('../services/firebaseService');
      const count = await renameTag(renameFrom, newName);
      setRenameFrom(null);
      setRenameTo('');
      showResult(`"${newName}"(으)로 변경 완료 (${count}장 사진 수정)`);
    } catch (err) {
      showResult('변경 실패: ' + err.message, true);
    } finally {
      setLoading(false);
    }
  };

  // AI 태그 분석
  const handleAiAnalyze = async () => {
    if (tagStats.length < 2) {
      showResult('분석할 태그가 2개 이상이어야 합니다', true);
      return;
    }
    setAiLoading(true);
    setAiSuggestions(null);
    setAiApplied(new Set());
    setAiApplying(new Set());
    try {
      const { analyzeTagsForMerge } = await import('../services/firebaseService');
      const data = await analyzeTagsForMerge(tagStats);
      if (data.mergeGroups && data.mergeGroups.length > 0) {
        setAiSuggestions(data.mergeGroups);
      } else {
        showResult('AI 분석 결과: 병합이 필요한 태그가 없습니다');
      }
    } catch (err) {
      showResult('AI 분석 실패: ' + err.message, true);
    } finally {
      setAiLoading(false);
    }
  };

  // AI 제안 개별 적용
  const handleApplySuggestion = async (idx) => {
    const group = aiSuggestions[idx];
    setAiApplying(prev => new Set([...prev, idx]));
    try {
      const { mergeTags } = await import('../services/firebaseService');
      await mergeTags(group.sources, group.target);
      setAiApplied(prev => new Set([...prev, idx]));
      showResult(`"${group.target}"(으)로 병합 완료`);
    } catch (err) {
      showResult('병합 실패: ' + err.message, true);
    } finally {
      setAiApplying(prev => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }
  };

  // AI 제안 전체 적용
  const handleApplyAll = async () => {
    if (!aiSuggestions) return;
    const unapplied = aiSuggestions.map((_, i) => i).filter(i => !aiApplied.has(i));
    if (unapplied.length === 0) return;
    if (!window.confirm(`${unapplied.length}개 병합을 모두 적용하시겠습니까?`)) return;
    for (const idx of unapplied) {
      await handleApplySuggestion(idx);
    }
  };

  // 현재 뷰: AI 제안이 있으면 AI 뷰, 없으면 태그 목록
  const showAiView = aiSuggestions && aiSuggestions.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal tag-manager-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          태그 관리
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '8px' }}>
            {tagStats.length}개 태그
          </span>
        </div>

        {/* 결과 메시지 */}
        {result && (
          <div className={`tag-mgr-result ${result.isError ? 'error' : 'success'}`}>
            {result.msg}
          </div>
        )}

        {/* AI 정리 버튼 */}
        <div className="tag-mgr-ai-bar">
          <button
            className="tag-mgr-btn ai"
            onClick={handleAiAnalyze}
            disabled={aiLoading || loading}
          >
            {aiLoading ? '🤖 AI 분석 중...' : '🤖 AI 태그 정리'}
          </button>
          {showAiView && (
            <button className="tag-mgr-btn" onClick={() => setAiSuggestions(null)}>
              태그 목록으로
            </button>
          )}
        </div>

        {/* AI 제안 뷰 */}
        {showAiView ? (
          <div className="tag-mgr-ai-suggestions">
            <div className="tag-mgr-ai-header">
              <span>AI 병합 제안 ({aiSuggestions.length}건)</span>
              {aiSuggestions.some((_, i) => !aiApplied.has(i)) && (
                <button
                  className="tag-mgr-btn merge"
                  onClick={handleApplyAll}
                  disabled={loading || aiApplying.size > 0}
                  style={{ padding: '4px 12px', fontSize: '11px' }}
                >
                  전체 적용
                </button>
              )}
            </div>
            <div className="tag-mgr-list">
              {aiSuggestions.map((group, idx) => {
                const applied = aiApplied.has(idx);
                const applying = aiApplying.has(idx);
                return (
                  <div key={idx} className={`tag-mgr-ai-group ${applied ? 'applied' : ''}`}>
                    <div className="tag-mgr-ai-group-top">
                      <div className="tag-mgr-ai-sources">
                        {group.sources.map(s => (
                          <span key={s} className="tag-mgr-ai-tag source">{s}</span>
                        ))}
                        <span className="tag-mgr-ai-arrow">→</span>
                        <span className="tag-mgr-ai-tag target">{group.target}</span>
                      </div>
                      {!applied ? (
                        <button
                          className="tag-mgr-btn merge"
                          onClick={() => handleApplySuggestion(idx)}
                          disabled={applying || loading}
                          style={{ padding: '4px 12px', fontSize: '11px', flexShrink: 0 }}
                        >
                          {applying ? '...' : '적용'}
                        </button>
                      ) : (
                        <span className="tag-mgr-ai-done">완료</span>
                      )}
                    </div>
                    <div className="tag-mgr-ai-reason">{group.reason}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            {/* 검색 */}
            <div className="tag-mgr-search">
              <input
                type="text"
                placeholder="태그 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="tag-mgr-input"
              />
              {selectedTags.size > 0 && (
                <span className="tag-mgr-selected-count">{selectedTags.size}개 선택</span>
              )}
            </div>

            {/* 태그 목록 */}
            <div className="tag-mgr-list">
              {filteredTags.map(({ name, count }) => (
                <div
                  key={name}
                  className={`tag-mgr-item ${selectedTags.has(name) ? 'selected' : ''}`}
                  onClick={() => !renameFrom && toggleTag(name)}
                >
                  <div className="tag-mgr-item-check">
                    {selectedTags.has(name) ? '✓' : ''}
                  </div>
                  {renameFrom === name ? (
                    <div className="tag-mgr-rename-row">
                      <input
                        value={renameTo}
                        onChange={e => setRenameTo(e.target.value)}
                        className="tag-mgr-input tag-mgr-rename-input"
                        autoFocus
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename();
                          if (e.key === 'Escape') { setRenameFrom(null); setRenameTo(''); }
                        }}
                        placeholder="새 이름"
                      />
                      <button className="tag-mgr-btn-sm" onClick={(e) => { e.stopPropagation(); handleRename(); }} disabled={loading}>확인</button>
                      <button className="tag-mgr-btn-sm cancel" onClick={(e) => { e.stopPropagation(); setRenameFrom(null); }}>취소</button>
                    </div>
                  ) : (
                    <>
                      <span className="tag-mgr-item-name">{name}</span>
                      <span className="tag-mgr-item-count">{count}장</span>
                      <button
                        className="tag-mgr-btn-rename"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameFrom(name);
                          setRenameTo(name);
                        }}
                        title="이름 변경"
                      >✏️</button>
                    </>
                  )}
                </div>
              ))}
              {filteredTags.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  {searchQuery ? '검색 결과가 없습니다' : '태그가 없습니다'}
                </div>
              )}
            </div>
          </>
        )}

        {/* 액션 바 */}
        {!showAiView && (
          <div className="tag-mgr-actions">
            {selectedTags.size >= 2 && (
              <div className="tag-mgr-merge-row">
                <span className="tag-mgr-merge-label">병합 대상:</span>
                <input
                  type="text"
                  value={mergeTarget}
                  onChange={e => setMergeTarget(e.target.value)}
                  placeholder="병합할 태그명 입력"
                  className="tag-mgr-input"
                  onKeyDown={e => { if (e.key === 'Enter') handleMerge(); }}
                />
                <button className="tag-mgr-btn merge" onClick={handleMerge} disabled={loading || !mergeTarget.trim()}>
                  {loading ? '...' : `${selectedTags.size}개 → 병합`}
                </button>
              </div>
            )}
            <div className="tag-mgr-bottom-row">
              {selectedTags.size > 0 && (
                <>
                  <button className="tag-mgr-btn delete" onClick={handleDelete} disabled={loading}>
                    {loading ? '처리 중...' : `${selectedTags.size}개 삭제`}
                  </button>
                  <button className="tag-mgr-btn" onClick={() => setSelectedTags(new Set())} disabled={loading}>
                    선택 해제
                  </button>
                </>
              )}
              <button className="tag-mgr-btn close" onClick={onClose} style={{ marginLeft: 'auto' }}>닫기</button>
            </div>
          </div>
        )}

        {showAiView && (
          <div className="tag-mgr-actions">
            <div className="tag-mgr-bottom-row">
              <button className="tag-mgr-btn close" onClick={onClose} style={{ marginLeft: 'auto' }}>닫기</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
