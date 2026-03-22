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
              {Object.entries(photo.scores).slice(0, 4).map(([key, val]) => (
                <div key={key} className="mini-score-item">
                  <span className="mini-score-label">{scoreLabels[key]?.ko}</span>
                  <span style={{ color: getScoreColor(val), fontWeight: 600 }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="photo-card-info">
            <div className="photo-card-title">{photo.title}</div>
            <div className="photo-card-meta">
              <span className="photo-card-category">{photo.category}</span>
              <span className={`photo-card-score ${getScoreClass(photo.totalScore)}`}>
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
