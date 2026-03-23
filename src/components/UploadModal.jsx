import { useState, useRef } from 'react';
import heic2any from 'heic2any';

const HEIC_TYPES = ['image/heic', 'image/heif'];
const HEIC_EXTENSIONS = ['.heic', '.heif'];

/**
 * HEIC/HEIF 등 비표준 포맷을 JPEG Blob으로 변환
 * 일반 이미지(jpg, png, webp, bmp, gif, tiff 등)는 그대로 반환
 */
async function ensureJpegCompatible(file) {
  const name = file.name.toLowerCase();
  const isHeic = HEIC_TYPES.includes(file.type) || HEIC_EXTENSIONS.some(ext => name.endsWith(ext));

  if (isHeic) {
    const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    // heic2any can return array for multi-frame, take first
    const result = Array.isArray(blob) ? blob[0] : blob;
    return new File([result], file.name.replace(/\.heic|\.heif/i, '.jpg'), { type: 'image/jpeg' });
  }

  return file;
}

function resizeImage(file, maxWidth = 2048) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('이미지를 불러올 수 없습니다. 지원되지 않는 형식일 수 있습니다.'));
    };
    img.onload = () => {
      try {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;

        // 모바일 Safari 캔버스 제한 (~16MP) 대응
        const MAX_PIXELS = 16000000;
        const pixels = width * height;
        if (pixels > MAX_PIXELS) {
          const scale = Math.sqrt(MAX_PIXELS / pixels);
          width = Math.floor(width * scale);
          height = Math.floor(height * scale);
        }

        if (width > maxWidth) {
          height = Math.floor((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('캔버스를 생성할 수 없습니다.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('이미지 변환에 실패했습니다.'));
            return;
          }
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve({ blob, dataUrl, width, height });
        }, 'image/jpeg', 0.85);
      } catch (err) {
        reject(new Error('이미지 리사이즈 실패: ' + err.message));
      }
    };
    img.src = objectUrl;
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
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;

    // 이미지 타입 또는 HEIC 확장자 확인
    const name = file.name.toLowerCase();
    const isImage = file.type.startsWith('image/');
    const isHeic = HEIC_EXTENSIONS.some(ext => name.endsWith(ext));
    if (!isImage && !isHeic) return;

    setFileError('');
    setIsProcessing(true);

    try {
      // 1단계: HEIC 등 비표준 포맷 → JPEG 변환
      const compatible = await ensureJpegCompatible(file);

      // 2단계: 리사이즈 + 압축
      const resized = await resizeImage(compatible);
      setPreview(resized.dataUrl);
      setImageData(resized);
    } catch (err) {
      console.error('Image processing error:', err);
      setFileError(err.message);
      setPreview(null);
      setImageData(null);
    } finally {
      setIsProcessing(false);
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
            {isProcessing ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{
                  width: '24px', height: '24px', border: '2px solid var(--accent)',
                  borderTopColor: 'transparent', borderRadius: '50%',
                  animation: 'spin 1s linear infinite', margin: '0 auto 8px'
                }} />
                <div className="upload-dropzone-text">이미지 변환 중...</div>
              </div>
            ) : preview ? (
              <div className="upload-preview">
                <img src={preview} alt="preview" />
              </div>
            ) : (
              <>
                <div className="upload-dropzone-text">클릭하거나 파일을 드래그하세요</div>
                <div className="upload-dropzone-hint">JPG, PNG, WebP, HEIC 등 (자동 변환)</div>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.heic,.heif"
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
            disabled={!title.trim() || !preview || isUploading || isProcessing}
          >
            {isUploading ? '업로드 중...' : '업로드'}
          </button>
        </div>
      </div>
    </div>
  );
}
