import { useState, useMemo, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Gallery from './components/Gallery';
import SidePanel from './components/SidePanel';
import UploadModal from './components/UploadModal';
import FilterBar from './components/FilterBar';
import AuthModal from './components/AuthModal';
import AdminPanel from './components/AdminPanel';
import './App.css';

// Firebase is configured
const USE_FIREBASE = true;

// Admin password for admin-only features (delete etc.)
const ADMIN_PASSWORD = '283456';

function App() {
  const [photos, setPhotos] = useState([]);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeTag, setActiveTag] = useState("전체");
  const [sortBy, setSortBy] = useState("date");
  const [scoreFilter, setScoreFilter] = useState([0, 10]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Firebase Auth 상태 감시
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsubAuth();
  }, []);

  // Firebase 실시간 구독: Firestore에서 사진 목록을 실시간으로 불러옴
  useEffect(() => {
    if (!USE_FIREBASE) return;
    let unsubscribe;
    (async () => {
      const { subscribeToPhotos } = await import('./services/firebaseService');
      unsubscribe = subscribeToPhotos((firebasePhotos) => {
        setPhotos(firebasePhotos);
        setSelectedPhoto(prev => {
          if (!prev) return prev;
          const updated = firebasePhotos.find(p => p.id === prev.id);
          return updated || prev;
        });
      });
    })();
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  // Collect all unique AI tags from photos
  const allTags = useMemo(() => {
    const tagSet = new Set();
    photos.forEach(p => {
      if (p.aiTags && Array.isArray(p.aiTags)) {
        p.aiTags.forEach(t => tagSet.add(t));
      }
    });
    return ["전체", ...Array.from(tagSet).sort()];
  }, [photos]);

  const filteredPhotos = useMemo(() => {
    let result = photos;
    if (activeTag !== "전체") {
      result = result.filter(p =>
        (p.aiTags && Array.isArray(p.aiTags) && p.aiTags.includes(activeTag))
      );
    }
    result = result.filter(p => p.totalScore >= scoreFilter[0] && p.totalScore <= scoreFilter[1]);
    if (sortBy === "totalScore") {
      result = [...result].sort((a, b) => b.totalScore - a.totalScore);
    } else if (sortBy === "date") {
      result = [...result].sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    return result;
  }, [photos, activeTag, sortBy, scoreFilter]);

  const handlePhotoClick = (photo) => {
    setSelectedPhoto(photo);
    setPanelOpen(true);
  };

  const handleClosePanel = () => {
    setPanelOpen(false);
    setTimeout(() => setSelectedPhoto(null), 300);
  };

  const handleUpload = (newPhoto) => {
    if (!USE_FIREBASE) {
      setPhotos(prev => [newPhoto, ...prev]);
    }
    setUploadOpen(false);
  };

  const handleDeletePhoto = async (photoId) => {
    if (!isAdmin) return;
    if (selectedPhoto && selectedPhoto.id === photoId) {
      handleClosePanel();
    }
    if (USE_FIREBASE) {
      try {
        const { deletePhoto } = await import('./services/firebaseService');
        await deletePhoto(photoId);
      } catch (err) {
        console.error('Delete failed:', err);
        alert('삭제 실패: ' + err.message);
      }
    } else {
      setPhotos(prev => prev.filter(p => p.id !== photoId));
    }
  };

  const handleAddComment = async (photoId, comment) => {
    if (USE_FIREBASE) {
      try {
        const { addComment } = await import('./services/firebaseService');
        await addComment(photoId, comment);
      } catch (err) {
        console.error('Comment failed:', err);
      }
    }
    setPhotos(prev => prev.map(p => {
      if (p.id === photoId) {
        return { ...p, comments: [...(p.comments || []), comment] };
      }
      return p;
    }));
    if (selectedPhoto && selectedPhoto.id === photoId) {
      setSelectedPhoto(prev => ({
        ...prev,
        comments: [...(prev.comments || []), comment]
      }));
    }
  };

  const handleReEvaluate = async (photoId) => {
    if (!USE_FIREBASE) return;
    const { reEvaluatePhoto } = await import('./services/firebaseService');
    await reEvaluatePhoto(photoId);
  };

  const handleDebateEvaluate = async (photoId) => {
    if (!USE_FIREBASE) return;
    const { debateEvaluatePhoto } = await import('./services/firebaseService');
    await debateEvaluatePhoto(photoId);
  };

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    setShowAuth(false);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setCurrentUser(null);
      setIsAdmin(false);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleAdminToggle = () => {
    if (isAdmin) {
      setIsAdmin(false);
    } else {
      const pw = prompt('관리자 비밀번호를 입력하세요');
      if (pw === ADMIN_PASSWORD) {
        setIsAdmin(true);
      } else if (pw !== null) {
        alert('비밀번호가 틀렸습니다');
      }
    }
  };

  return (
    <div className={`app ${panelOpen ? 'panel-open' : ''}`}>
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">Photo Critique</h1>
          <span className="app-subtitle">사진 크리틱 & 리뷰</span>
        </div>
        <div className="header-right">
          {authLoading ? null : currentUser ? (
            <>
              <span className="user-name">{currentUser.displayName || currentUser.email}</span>
              {isAdmin && <span className="admin-badge">Admin</span>}
              <button className="upload-btn" onClick={() => setUploadOpen(true)}>
                + 업로드
              </button>
              <button className="header-icon-btn" onClick={handleAdminToggle} title={isAdmin ? '관리자 모드 해제' : '관리자 모드'}>
                {isAdmin ? '🔓' : '🔒'}
              </button>
              {isAdmin && (
                <button className="header-icon-btn" onClick={() => setShowAdminPanel(true)} title="가입자 관리">
                  👥
                </button>
              )}
              <button className="logout-btn" onClick={handleLogout}>
                로그아웃
              </button>
            </>
          ) : (
            <button className="login-btn" onClick={() => setShowAuth(true)}>
              로그인 / 회원가입
            </button>
          )}
        </div>
      </header>

      <FilterBar
        categories={allTags}
        activeCategory={activeTag}
        onCategoryChange={setActiveTag}
        sortBy={sortBy}
        onSortChange={setSortBy}
        scoreFilter={scoreFilter}
        onScoreFilterChange={setScoreFilter}
        photoCount={filteredPhotos.length}
      />

      <Gallery
        photos={filteredPhotos}
        onPhotoClick={handlePhotoClick}
        isAdmin={isAdmin}
        onDeletePhoto={handleDeletePhoto}
      />

      <SidePanel
        photo={selectedPhoto}
        isOpen={panelOpen}
        onClose={handleClosePanel}
        onAddComment={handleAddComment}
        onReEvaluate={USE_FIREBASE ? handleReEvaluate : null}
        onDebateEvaluate={USE_FIREBASE ? handleDebateEvaluate : null}
        isAdmin={isAdmin}
        onDeletePhoto={handleDeletePhoto}
      />

      {uploadOpen && currentUser && (
        <UploadModal
          onUpload={handleUpload}
          onClose={() => setUploadOpen(false)}
          useFirebase={USE_FIREBASE}
          uploaderName={currentUser.displayName || currentUser.email}
        />
      )}

      {showAuth && (
        <AuthModal
          onAuthSuccess={handleAuthSuccess}
          onClose={() => setShowAuth(false)}
        />
      )}

      {showAdminPanel && isAdmin && (
        <AdminPanel onClose={() => setShowAdminPanel(false)} />
      )}
    </div>
  );
}

export default App;
