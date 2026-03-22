import { useState, useRef } from 'react';

const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

function resizeImage(file, maxWidth = 2048) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_SIZE) {
      reject(new Error(`파일 크기가 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). 최대 30MB까지 가능합니다.`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다. 지원되지 않는 형식일 수 있습니다.'));
      img.onload = () => {
        try {
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
            if (!blob) {
              reject(new Error('이미지 변환에 실패했습니다.'));
              return;
            }
            resolve({
              blob,
              dataUrl: canvas.toDataURL('image/jpeg', 0.85),
              width,
              height
            });
          }, 'image/jpeg', 0.85);
        } catch (err) {
          reject(new Error('이미지 리사이즈 실패: ' + err.message));
        }
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
  const [preview, setPreview] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const fileRef = useRef(null);

  const [fileError, setFileError] = useState('');

  const handleFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setFileError('');
    try {
      const resized = await resizeImage(file);
      setPreview(resized.dataUrl);
      setImageData(resized);
    } catch (err) {
      setFileError(err.message);
      setPreview(null);
      setImageData(null);
    }
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
          category: 'AI 분류 중...',
          aiTags: [],
          location: '',
          date: new Date().toISOString().split('T')[0],
          tags: [],
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
        uploaderName: fixedUploaderName || '익명',
        category: '미분류',
        aiTags: [],
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
        tags: [],
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
                <div className="upload-dropzone-hint">최대 2048px로 리사이즈 (30MB 이하)</div>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={e => handleFile(e.target.files[0])}
            />
          </div>
          {fileError && (
            <div style={{
              marginTop: '8px', padding: '8px 12px',
              background: 'rgba(248, 113, 113, 0.1)',
              border: '1px solid rgba(248, 113, 113, 0.3)',
              borderRadius: '6px', fontSize: '12px', color: '#f87171'
            }}>
              {fileError}
            </div>
          )}
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
              ? 'AI가 자동으로 사진을 분석하여 카테고리 태그, 7항목 점수, 크리틱을 생성합니다.'
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
