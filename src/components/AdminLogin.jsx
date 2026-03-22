import { useState } from 'react';

export default function AdminLogin({ onLogin, onClose }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const success = onLogin(password);
    if (!success) {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPassword('');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal admin-login-modal ${shake ? 'shake' : ''}`}
        onClick={e => e.stopPropagation()}
        style={{ width: '380px' }}
      >
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%',
            background: 'rgba(200, 168, 110, 0.1)',
            border: '2px solid var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: '24px'
          }}>
            🔒
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>
            관리자 로그인
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            사진 업로드 및 삭제를 위해 비밀번호를 입력하세요
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="password"
              className="form-input"
              placeholder="비밀번호 입력"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(false); }}
              autoFocus
              style={{
                textAlign: 'center',
                fontSize: '18px',
                letterSpacing: '4px',
                borderColor: error ? '#f87171' : undefined
              }}
            />
            {error && (
              <p style={{
                fontSize: '12px', color: '#f87171',
                textAlign: 'center', marginTop: '8px'
              }}>
                비밀번호가 틀렸습니다
              </p>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn-secondary" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="modal-btn modal-btn-primary" disabled={!password}>
              로그인
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
