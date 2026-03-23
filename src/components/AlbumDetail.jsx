import { useState, useMemo } from 'react';

function getGrade(score) {
  if (score >= 9.0) return { grade: 'S', color: '#e2b340' };
  if (score >= 8.0) return { grade: 'A', color: '#4ade80' };
  if (score >= 7.0) return { grade: 'B', color: '#60a5fa' };
  if (score >= 5.0) return { grade: 'C', color: '#fbbf24' };
  if (score >= 3.0) return { grade: 'D', color: '#fb923c' };
  return { grade: 'F', color: '#f87171' };
}

export default function AlbumDetail({
  album, photos, allPhotos, onBack, onPhotoClick,
  onRemovePhoto, onAddPhotos, onDeleteAlbum, onEditAlbum,
  currentUser, isAdmin,
}) {
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState(new Set());
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(album.title);
  const [editDesc, setEditDesc] = useState(album.description || '');
  const [sortBy, setSortBy] = useState('added'); // added | score

  const isOwner = currentUser?.uid === album.ownerUid;
  const canEdit = isOwner || isAdmin;

  // Photos in this album
  const albumPhotos = useMemo(() => {
    const result = (album.photoIds || [])
      .map(id => photos.find(p => p.id === id))
      .filter(Boolean);
    if (sortBy === 'score') {
      return [...result].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
    }
    return result;
  }, [album.photoIds, photos, sortBy]);

  // Stats
  const stats = useMemo(() => {
    if (albumPhotos.length === 0) return { avg: 0, best: 0, count: 0 };
    const scores = albumPhotos.map(p => p.totalScore || 0);
    return {
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      best: Math.max(...scores),
      count: albumPhotos.length,
    };
  }, [albumPhotos]);

  // Photos not yet in album (for add picker)
  // 관리자: 모든 사진 / 일반 유저: 자기 사진만
  const availablePhotos = useMemo(() => {
    const inAlbum = new Set(album.photoIds || []);
    return allPhotos.filter(p => {
      if (inAlbum.has(p.id)) return false;
      if (isAdmin) return true;
      // 일반 유저는 자기 사진만 추가 가능
      return p.uploaderUid === currentUser?.uid;
    });
  }, [allPhotos, album.photoIds, isAdmin, currentUser]);

  const handleSaveEdit = () => {
    onEditAlbum(album.id, { title: editTitle.trim(), description: editDesc.trim() });
    setEditing(false);
  };

  const handleAddSelected = () => {
    if (selectedToAdd.size > 0) {
      onAddPhotos(album.id, Array.from(selectedToAdd));
      setSelectedToAdd(new Set());
      setShowAddPicker(false);
    }
  };

  const toggleSelect = (photoId) => {
    setSelectedToAdd(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const gradeInfo = stats.avg > 0 ? getGrade(stats.avg) : null;

  return (
    <div className="album-detail-container">
      {/* Header */}
      <div className="album-detail-header">
        <button className="album-back-btn" onClick={onBack}>← 앨범 목록</button>
        <div className="album-detail-title-row">
          {editing ? (
            <div className="album-edit-form">
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="album-input"
                autoFocus
              />
              <textarea
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                className="album-textarea"
                rows={2}
                placeholder="앨범 설명"
              />
              <div className="album-create-actions">
                <button className="album-save-btn" onClick={handleSaveEdit}>저장</button>
                <button className="album-cancel-btn" onClick={() => setEditing(false)}>취소</button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="album-detail-name">{album.title}</h2>
              {canEdit && (
                <div className="album-detail-actions">
                  <button className="album-action-btn" onClick={() => setEditing(true)} title="수정">✏️</button>
                  <button className="album-action-btn" onClick={() => setShowAddPicker(true)} title="사진 추가">➕</button>
                  <button className="album-action-btn album-delete" onClick={() => {
                    if (window.confirm('이 앨범을 삭제하시겠습니까? (사진은 삭제되지 않습니다)')) {
                      onDeleteAlbum(album.id);
                      onBack();
                    }
                  }} title="앨범 삭제">🗑</button>
                </div>
              )}
            </>
          )}
        </div>
        {!editing && album.description && (
          <p className="album-detail-desc">{album.description}</p>
        )}
        <div className="album-detail-meta">
          <span>by {album.ownerName}</span>
          <span>·</span>
          <span>{stats.count}장</span>
          {stats.avg > 0 && (
            <>
              <span>·</span>
              <span>평균 {stats.avg.toFixed(1)}점</span>
              {gradeInfo && (
                <span className="album-meta-grade" style={{ color: gradeInfo.color }}>
                  {gradeInfo.grade}
                </span>
              )}
              <span>·</span>
              <span>최고 {stats.best.toFixed(1)}점</span>
            </>
          )}
        </div>
        <div className="album-detail-sort">
          <button
            className={`sort-btn ${sortBy === 'added' ? 'active' : ''}`}
            onClick={() => setSortBy('added')}
          >추가순</button>
          <button
            className={`sort-btn ${sortBy === 'score' ? 'active' : ''}`}
            onClick={() => setSortBy('score')}
          >점수순</button>
        </div>
      </div>

      {/* Photo Grid */}
      {albumPhotos.length > 0 ? (
        <div className="album-photo-grid">
          {albumPhotos.map(photo => {
            const g = photo.totalScore > 0 ? getGrade(photo.totalScore) : null;
            return (
              <div key={photo.id} className="album-photo-card" onClick={() => onPhotoClick(photo)}>
                <img src={photo.thumbnailUrl || photo.imageUrl} alt={photo.title} />
                <div className="album-photo-overlay">
                  <span className="album-photo-title">{photo.title}</span>
                  {photo.totalScore > 0 && (
                    <span className="album-photo-score">
                      {photo.totalScore.toFixed(1)}
                      {g && <span style={{ color: g.color, marginLeft: '4px', fontWeight: 700 }}>{g.grade}</span>}
                    </span>
                  )}
                </div>
                {canEdit && (isAdmin || photo.uploaderUid === currentUser?.uid) && (
                  <button
                    className="album-photo-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemovePhoto(album.id, photo.id);
                    }}
                    title="앨범에서 제거"
                  >✕</button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="album-empty">
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📷</div>
          <p>앨범에 사진이 없습니다</p>
          {canEdit && (
            <button className="album-create-btn" onClick={() => setShowAddPicker(true)} style={{ marginTop: '12px' }}>
              + 사진 추가
            </button>
          )}
        </div>
      )}

      {/* Add Photo Picker Modal */}
      {showAddPicker && (
        <div className="modal-overlay" onClick={() => setShowAddPicker(false)}>
          <div className="album-picker-modal" onClick={e => e.stopPropagation()}>
            <div className="album-picker-header">
              <h3>사진 추가</h3>
              <button className="panel-close" onClick={() => setShowAddPicker(false)}>&times;</button>
            </div>
            {availablePhotos.length > 0 ? (
              <>
                <div className="album-picker-grid">
                  {availablePhotos.map(photo => (
                    <div
                      key={photo.id}
                      className={`album-picker-item ${selectedToAdd.has(photo.id) ? 'selected' : ''}`}
                      onClick={() => toggleSelect(photo.id)}
                    >
                      <img src={photo.thumbnailUrl || photo.imageUrl} alt={photo.title} />
                      <div className="album-picker-check">{selectedToAdd.has(photo.id) ? '✓' : ''}</div>
                      <div className="album-picker-title">{photo.title}</div>
                      {isAdmin && photo.uploaderName && (
                        <div className="album-picker-owner">👤 {photo.uploaderName}</div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="album-picker-footer">
                  <span>{selectedToAdd.size}장 선택됨</span>
                  <button
                    className="album-save-btn"
                    onClick={handleAddSelected}
                    disabled={selectedToAdd.size === 0}
                  >추가</button>
                </div>
              </>
            ) : (
              <div className="album-empty" style={{ padding: '40px' }}>
                <p>추가할 수 있는 사진이 없습니다</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
