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

export default function Gallery({ photos, onPhotoClick }) {
  if (photos.length === 0) {
    return (
      <div style={{ padding: '60px 32px', textAlign: 'center', color: '#555' }}>
        <p style={{ fontSize: '16px' }}>해당 필터에 맞는 사진이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="gallery">
      {photos.map(photo => (
        <div key={photo.id} className="photo-card" onClick={() => onPhotoClick(photo)}>
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
