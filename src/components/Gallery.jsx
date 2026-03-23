import { scoreLabels } from '../sampleData';

function getScoreClass(score) {
  if (score >= 7) return 'score-high';
  if (score >= 5) return 'score-mid';
  return 'score-low';
}

function getScoreColor(score) {
  if (score >= 7) return '#4ade80';
  if (score >= 5) return '#fbbf24';
  return '#f87171';
}

function getGrade(score) {
  if (score >= 9.0) return { grade: 'S', color: '#e2b340' };
  if (score >= 8.0) return { grade: 'A', color: '#4ade80' };
  if (score >= 7.0) return { grade: 'B', color: '#60a5fa' };
  if (score >= 5.0) return { grade: 'C', color: '#fbbf24' };
  if (score >= 3.0) return { grade: 'D', color: '#fb923c' };
  return { grade: 'F', color: '#f87171' };
}

export default function Gallery({ photos, onPhotoClick, isAdmin, onDeletePhoto }) {
  if (photos.length === 0) {
    return (
      <div className="empty-gallery">
        <div className="empty-icon">📷</div>
        <p className="empty-title">사진이 없습니다</p>
        <p className="empty-subtitle">
          {isAdmin
            ? '상단의 "사진 업로드" 버튼으로 사진을 추가하세요'
            : '관리자가 사진을 업로드하면 여기에 표시됩니다'}
        </p>
      </div>
    );
  }

  const handleDelete = (e, photoId) => {
    e.stopPropagation();
    if (window.confirm('이 사진을 삭제하시겠습니까?')) {
      onDeletePhoto(photoId);
    }
  };

  return (
    <div className="gallery">
      {photos.map(photo => (
        <div key={photo.id} className="photo-card" onClick={() => onPhotoClick(photo)}>
          {isAdmin && (
            <button
              className="delete-btn-card"
              onClick={(e) => handleDelete(e, photo.id)}
              title="사진 삭제"
            >
              ✕
            </button>
          )}
          <img
            className="photo-card-img"
            src={photo.thumbnailUrl || photo.imageUrl}
            alt={photo.title}
            loading="lazy"
          />
          <div className="photo-card-overlay">
            <div className="mini-scores">
              {Object.keys(scoreLabels).slice(0, 4).map(key => {
                const val = photo.scores[key];
                if (val == null) return null;
                return (
                  <div key={key} className="mini-score-item">
                    <span className="mini-score-label">{scoreLabels[key]?.ko}</span>
                    <span style={{ color: getScoreColor(val), fontWeight: 600 }}>{val}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="photo-card-info">
            <div className="photo-card-title">{photo.title}</div>
            <div className="photo-card-meta">
              <span className="photo-card-tags">
                {photo.aiTags && photo.aiTags.length > 0
                  ? photo.aiTags.map((tag, i) => (
                      <span key={i} className="photo-card-tag">{tag}</span>
                    ))
                  : <span className="photo-card-category">{photo.category}</span>
                }
              </span>
              <span className={`photo-card-score ${getScoreClass(photo.totalScore)}`}>
                {photo.aiModel === 'multi-ai-debate' && (
                  <span style={{
                    fontSize: '9px', padding: '1px 4px',
                    background: 'rgba(162, 155, 254, 0.2)',
                    borderRadius: '3px', color: '#a29bfe',
                    marginRight: '4px', fontWeight: 600
                  }}>3-AI</span>
                )}
                {photo.totalScore > 0 && (() => {
                  const g = getGrade(photo.totalScore);
                  return (
                    <span style={{
                      fontSize: '10px', fontWeight: 700, color: g.color,
                      marginRight: '3px'
                    }}>{g.grade}</span>
                  );
                })()}
                <span className="score-dot"></span>
                {photo.totalScore.toFixed(1)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
