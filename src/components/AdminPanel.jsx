import { useState, useEffect } from 'react';

export default function AdminPanel({ onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingUid, setDeletingUid] = useState(null);
  const [reTagging, setReTagging] = useState(false);
  const [reTagResult, setReTagResult] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const { listUsers } = await import('../services/firebaseService');
      const userList = await listUsers();
      setUsers(userList);
    } catch (err) {
      console.error('Failed to load users:', err);
      setError('사용자 목록을 불러오지 못했습니다: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (uid, email) => {
    if (!window.confirm(`정말로 "${email}" 계정을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

    setDeletingUid(uid);
    try {
      const { deleteAuthUser } = await import('../services/firebaseService');
      await deleteAuthUser(uid);
      setUsers(prev => prev.filter(u => u.uid !== uid));
    } catch (err) {
      console.error('Failed to delete user:', err);
      alert('삭제 실패: ' + err.message);
    } finally {
      setDeletingUid(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal admin-panel-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          가입자 관리
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '8px' }}>
            {!loading && `${users.length}명`}
          </span>
        </div>

        {error && (
          <div style={{ padding: '10px', background: 'rgba(248,113,113,0.1)', borderRadius: '6px', color: '#f87171', fontSize: '13px', marginBottom: '12px' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
            불러오는 중...
          </div>
        ) : (
          <div className="admin-user-list">
            {users.map(user => (
              <div key={user.uid} className="admin-user-item">
                <div className="admin-user-info">
                  <div className="admin-user-name">
                    {user.displayName || '(이름 없음)'}
                    {user.disabled && <span className="admin-user-disabled">비활성</span>}
                  </div>
                  <div className="admin-user-email">{user.email}</div>
                  <div className="admin-user-dates">
                    가입: {formatDate(user.createdAt)} · 마지막 로그인: {formatDate(user.lastSignIn)}
                  </div>
                </div>
                <button
                  className="admin-user-delete-btn"
                  onClick={() => handleDelete(user.uid, user.email)}
                  disabled={deletingUid === user.uid}
                >
                  {deletingUid === user.uid ? '삭제 중...' : '삭제'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Re-tag all photos */}
        <div style={{
          padding: '12px 14px',
          background: 'rgba(200, 168, 110, 0.08)',
          border: '1px solid rgba(200, 168, 110, 0.2)',
          borderRadius: '8px',
          marginBottom: '12px'
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--accent)' }}>
            AI 태그 재생성
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            모든 사진의 카테고리 태그를 AI가 다시 분석합니다. 시간이 걸릴 수 있습니다.
          </div>
          <button
            className="modal-btn modal-btn-primary"
            style={{ fontSize: '12px', padding: '6px 14px' }}
            onClick={async () => {
              if (!window.confirm('모든 사진을 AI가 다시 분석합니다. 진행하시겠습니까?')) return;
              setReTagging(true);
              setReTagResult(null);
              try {
                const { reTagAllPhotos } = await import('../services/firebaseService');
                const result = await reTagAllPhotos();
                setReTagResult(result);
              } catch (err) {
                setReTagResult({ error: err.message });
              } finally {
                setReTagging(false);
              }
            }}
            disabled={reTagging}
          >
            {reTagging ? 'AI 분석 중...' : '전체 재태그'}
          </button>
          {reTagResult && (
            <div style={{ fontSize: '12px', marginTop: '6px', color: reTagResult.error ? '#f87171' : '#4ade80' }}>
              {reTagResult.error
                ? `오류: ${reTagResult.error}`
                : `완료! 성공: ${reTagResult.success}건, 실패: ${reTagResult.failed}건 (총 ${reTagResult.total}건)`
              }
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="modal-btn modal-btn-secondary" onClick={loadUsers} disabled={loading}>
            새로고침
          </button>
          <button className="modal-btn modal-btn-primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
