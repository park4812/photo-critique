import { useState } from 'react';

function getGrade(score) {
  if (score >= 9.0) return { grade: 'S', color: '#e2b340' };
  if (score >= 8.0) return { grade: 'A', color: '#4ade80' };
  if (score >= 7.0) return { grade: 'B', color: '#60a5fa' };
  if (score >= 5.0) return { grade: 'C', color: '#fbbf24' };
  if (score >= 3.0) return { grade: 'D', color: '#fb923c' };
  return { grade: 'F', color: '#f87171' };
}

export default function AlbumList({ albums, photos, onAlbumClick, onCreateAlbum, currentUser, isAdmin }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    onCreateAlbum({
      title: newTitle.trim(),
      description: newDesc.trim(),
      ownerUid: currentUser?.uid || '',
      ownerName: currentUser?.displayName || currentUser?.email || '익명',
    });
    setNewTitle('');
    setNewDesc('');
    setShowCreate(false);
  };

  // Get album stats
  const getAlbumStats = (album) => {
    const albumPhotos = (album.photoIds || [])
      .map(id => photos.find(p => p.id === id))
      .filter(Boolean);
    const avgScore = albumPhotos.length > 0
      ? albumPhotos.reduce((sum, p) => sum + (p.totalScore || 0), 0) / albumPhotos.length
      : 0;
    return { count: albumPhotos.length, avgScore, coverPhoto: albumPhotos[0] };
  };

  // Filter: show user's own albums + albums with public photos
  const myAlbums = albums.filter(a => a.ownerUid === currentUser?.uid);
  const otherAlbums = albums.filter(a => a.ownerUid !== currentUser?.uid);

  return (
    <div className="album-list-container">
      <div className="album-list-header">
        <h2 className="album-list-title">앨범</h2>
        {currentUser && (
          <button className="album-create-btn" onClick={() => setShowCreate(true)}>
            + 새 앨범
          </button>
        )}
      </div>

      {showCreate && (
        <div className="album-create-form">
          <input
            type="text"
            placeholder="앨범 제목"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            className="album-input"
            autoFocus
          />
          <textarea
            placeholder="앨범 설명 (선택)"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            className="album-textarea"
            rows={2}
          />
          <div className="album-create-actions">
            <button className="album-save-btn" onClick={handleCreate}>만들기</button>
            <button className="album-cancel-btn" onClick={() => setShowCreate(false)}>취소</button>
          </div>
        </div>
      )}

      {myAlbums.length > 0 && (
        <div className="album-section">
          <h3 className="album-section-title">내 앨범</h3>
          <div className="album-grid">
            {myAlbums.map(album => {
              const stats = getAlbumStats(album);
              const gradeInfo = stats.avgScore > 0 ? getGrade(stats.avgScore) : null;
              return (
                <div key={album.id} className="album-card" onClick={() => onAlbumClick(album)}>
                  <div className="album-cover">
                    {stats.coverPhoto ? (
                      <img src={stats.coverPhoto.thumbnailUrl || stats.coverPhoto.imageUrl} alt="" />
                    ) : (
                      <div className="album-cover-empty">📷</div>
                    )}
                    <div className="album-cover-overlay">
                      <span className="album-photo-count">{stats.count}장</span>
                      {gradeInfo && (
                        <span className="album-grade" style={{ color: gradeInfo.color }}>
                          {gradeInfo.grade}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="album-info">
                    <div className="album-card-title">{album.title}</div>
                    {album.description && (
                      <div className="album-card-desc">{album.description}</div>
                    )}
                    {stats.avgScore > 0 && (
                      <div className="album-card-score">
                        평균 {stats.avgScore.toFixed(1)}점
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {otherAlbums.length > 0 && (
        <div className="album-section">
          <h3 className="album-section-title">다른 사람의 앨범</h3>
          <div className="album-grid">
            {otherAlbums.map(album => {
              const stats = getAlbumStats(album);
              const gradeInfo = stats.avgScore > 0 ? getGrade(stats.avgScore) : null;
              return (
                <div key={album.id} className="album-card" onClick={() => onAlbumClick(album)}>
                  <div className="album-cover">
                    {stats.coverPhoto ? (
                      <img src={stats.coverPhoto.thumbnailUrl || stats.coverPhoto.imageUrl} alt="" />
                    ) : (
                      <div className="album-cover-empty">📷</div>
                    )}
                    <div className="album-cover-overlay">
                      <span className="album-photo-count">{stats.count}장</span>
                      {gradeInfo && (
                        <span className="album-grade" style={{ color: gradeInfo.color }}>
                          {gradeInfo.grade}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="album-info">
                    <div className="album-card-title">{album.title}</div>
                    <div className="album-card-owner">by {album.ownerName}</div>
                    {album.description && (
                      <div className="album-card-desc">{album.description}</div>
                    )}
                    {stats.avgScore > 0 && (
                      <div className="album-card-score">
                        평균 {stats.avgScore.toFixed(1)}점
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {albums.length === 0 && (
        <div className="album-empty">
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📸</div>
          <p>아직 앨범이 없습니다</p>
          {currentUser && <p style={{ fontSize: '13px', opacity: 0.6 }}>첫 번째 앨범을 만들어보세요!</p>}
        </div>
      )}
    </div>
  );
}
