import { useState } from 'react';
import { auth } from '../firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';

export default function AuthModal({ onClose, onAuthSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setError('');
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    resetForm();
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!email || !password || !displayName.trim()) {
      setError('모든 항목을 입력해주세요');
      return;
    }
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: displayName.trim() });
      onAuthSuccess(cred.user);
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setError('이미 사용 중인 이메일입니다');
      } else if (err.code === 'auth/invalid-email') {
        setError('유효하지 않은 이메일입니다');
      } else if (err.code === 'auth/weak-password') {
        setError('비밀번호가 너무 약합니다');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('이메일과 비밀번호를 입력해주세요');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      onAuthSuccess(cred.user);
    } catch (err) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('이메일 또는 비밀번호가 틀렸습니다');
      } else if (err.code === 'auth/invalid-email') {
        setError('유효하지 않은 이메일입니다');
      } else if (err.code === 'auth/too-many-requests') {
        setError('너무 많은 시도입니다. 잠시 후 다시 시도해주세요');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal auth-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* Tab switcher */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
          >
            로그인
          </button>
          <button
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => switchMode('signup')}
          >
            회원가입
          </button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label className="form-label">이메일</label>
              <input
                className="form-input"
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                autoFocus
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label className="form-label">비밀번호</label>
              <input
                className="form-input"
                type="password"
                placeholder="비밀번호"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                autoComplete="current-password"
              />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading || !email || !password}
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup} className="auth-form">
            <div className="form-group">
              <label className="form-label">이름 (닉네임)</label>
              <input
                className="form-input"
                type="text"
                placeholder="사진가 이름"
                value={displayName}
                onChange={e => { setDisplayName(e.target.value); setError(''); }}
                autoFocus
                autoComplete="name"
              />
            </div>
            <div className="form-group">
              <label className="form-label">이메일</label>
              <input
                className="form-input"
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label className="form-label">비밀번호</label>
              <input
                className="form-input"
                type="password"
                placeholder="6자 이상"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                autoComplete="new-password"
              />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading || !email || !password || !displayName.trim()}
            >
              {loading ? '가입 중...' : '회원가입'}
            </button>
          </form>
        )}

        <button className="auth-close-btn" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
