import { useState, useRef } from 'react';
import { categories } from '../sampleData';

function resizeImage(file, maxWidth = 1080) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          resolve({
            blob,
            dataUrl: canvas.toDataURL('image/jpeg', 0.85),
            width,
            height
          });
        }, 'image/jpeg', 0.85);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * UploadModal
 *
 * Cloud Function 방식:
 *   - 클라이언트는 메타데이터 + 이미지만 업로드
 *   - AI 평가는 서버(Cloud Function)에서 자동 실행
 *   - API 키가 클라이언트에 노출되지 않음
 *
 * props.useFirebase: true면 Firebase에 직접 업로드, false면 로컬 샘플 모드
 */
export default function UploadModal({ onUpload, onClose, useFirebase = false, uploaderName: fixedUploaderName = '' }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categories[1]);
  const [tagsInput, setTagsInput] = useState('');
  const [preview, setPreview] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const resized = await resizeImage(file);
    setPreview(resized.dataUrl);
    setImageData(resized);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !preview || !imageData) return;

    setIsUploading(true);

    if (useFirebase) {
      // ===== Firebase Mode =====
      // 1. Upload to Firestore + Storage
      // 2. Cloud Function auto-triggers AI evaluation
      // 3. UI gets real-time update via onSnapshot
      try {
        const { uploadPhoto } = await import('../services/firebaseService');

        setUploadStatus('Firebase에 업로드 중...');

        const photoData = {
          title: title.trim(),
          description: description.trim(),
          uploaderName: fixedUploaderName || '익명',
          category,
          location: '',
          date: new Date().toISOString().split('T')[0],
          tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
        };

        const photoId = await uploadPhoto(photoData, imageData.blob);

        setUploadStatus('업로드 완료! AI가 자동으로 평가합니다...');
        await new Promise(r => setTimeout(r, 1000));

        // Close modal — real-time listener will update the gallery
        onUpload({ id: photoId, ...photoData, imageUrl: preview, thumbnailUrl: preview,
          scores: { composition: 0, lighting: 0, color: 0, focus: 0,
            storytelling: 0, timing: 0, postProcessing: 0 },
          totalScore: 0, critique: null, aiEvaluated: false, aiStatus: 'pending',
          comments: []
        });
      } catch (err) {
        console.error('Upload failed:', err);
        setUploadStatus('업로드 실패: ' + err.message);
        setIsUploading(false);
        return;
      }
    } else {
      // ===== Sample Mode (로컬) =====
      const newPhoto = {
        id: Date.now().toString(),
        title: title.trim(),
        description: description.trim(),
        uploaderName: uploaderName.trim() || '익명',
        category,
        location: '',
        date: new Date().toISOString().split('T')[0],
        imageUrl: preview,
        thumbnailUrl: preview,
        scores: {
          composition: 0, lighting: 0, color: 0, focus: 0,
          storytelling: 0, timing: 0, postProcessing: 0
        },
        totalScore: 0,
        critique: null,
        tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
        comments: [],
        aiEvaluated: false,
        aiStatus: 'none'
      };
      onUpload(newPhoto);
    }

    setIsUploading(false);
    setUploadStatus('');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">사진 업로드</div>

        <div className="form-group">
          <label className="form-label">사진</label>
          <div
            className="upload-dropzone"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
          >
            {preview ? (
              <div className="upload-preview">
                <img src={preview} alt="preview" />
              </div>
            ) : (
              <>
                <div className="upload-dropzone-text">클릭하거나 파일을 드래그하세요</div>
                <div className="upload-dropzone-hint">최대 1080px로 리사이즈됩니다</div>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={e => handleFile(e.target.files[0])}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">사진명</label>
          <input className="form-input" placeholder="사진 제목"
            value={title} onChange={e => setTitle(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">업로더</label>
          <input className="form-input" value={fixedUploaderName || '익명'} disabled
            style={{ opacity: 0.7, cursor: 'not-allowed' }} />
        </div>

        <div className="form-group">
          <label className="form-label">설명</label>
          <textarea className="form-textarea" placeholder="사진에 대한 설명, 촬영 의도 등"
            value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">카테고리</label>
          <select className="form-select" value={category}
            onChange={e => setCategory(e.target.value)}>
            {categories.filter(c => c !== '전체').map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">태그 (쉼표로 구분)</label>
          <input className="form-input" placeholder="야간, 스트릿, 도쿄"
            value={tagsInput} onChange={e => setTagsInput(e.target.value)} />
        </div>

        {/* AI Info Banner */}
        <div style={{
          padding: '12px 14px',
          background: 'rgba(200, 168, 110, 0.08)',
          border: '1px solid rgba(200, 168, 110, 0.2)',
          borderRadius: '8px',
          marginBottom: '4px'
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: 'var(--accent)' }}>
            AI 자동 평가
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {useFirebase
              ? '업로드 후 서버에서 자동으로 7항목 점수 + 크리틱이 생성됩니다. API 키는 서버에만 저장되어 안전합니다.'
              : '샘플 모드에서는 AI 평가가 비활성화됩니다. Firebase를 연동하면 자동 평가가 활성화됩니다.'
            }
          </div>
        </div>

        {uploadStatus && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(200, 168, 110, 0.1)',
            borderRadius: '6px',
            fontSize: '13px',
            color: 'var(--accent)',
            textAlign: 'center',
            marginTop: '8px'
          }}>
            {uploadStatus}
          </div>
        )}

        <div className="modal-actions">
          <button className="modal-btn modal-btn-secondary" onClick={onClose}
            disabled={isUploading}>취소</button>
          <button
            className="modal-btn modal-btn-primary"
            onClick={handleSubmit}
            disabled={!title.trim() || !preview || isUploading}
          >
            {isUploading ? '업로드 중...' : '업로드'}
          </button>
        </div>
      </div>
    </div>
  );
}
