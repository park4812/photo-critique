import { useState, useMemo, useEffect } from 'react';
import { categories } from './sampleData';
import Gallery from './components/Gallery';
import SidePanel from './components/SidePanel';
import UploadModal from './components/UploadModal';
import FilterBar from './components/FilterBar';
import AdminLogin from './components/AdminLogin';
import './App.css';

// Firebase is configured
const USE_FIREBASE = true;

// Admin password hash (SHA-256 of "283456")
const ADMIN_PASSWORD = '283456';

function App() {
  const [photos, setPhotos] = useState([]);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("전체");
  const [sortBy, setSortBy] = useState("date");
  const [scoreFilter, setScoreFilter] = useState([0, 10]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  // Firebase 실시간 구독: Firestore에서 사진 목록을 실시간으로 불러옴
  useEffect(() => {
    if (!USE_FIREBASE) return;
    let unsubscribe;
    (async () => {
      const { subscribeToPhotos } = await import('./services/firebaseService');
      unsubscribe = subscribeToPhotos((firebasePhotos) => {
        setPhotos(firebasePhotos);
        // 선택된 사진도 실시간 업데이트
        setSelectedPhoto(prev => {
          if (!prev) return prev;
          const updated = firebasePhotos.find(p => p.id === prev.id);
          return updated || prev;
        });
      });
    })();
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const filteredPhotos = useMemo(() => {
    let result = photos;
    if (activeCategory !== "전체") {
      result = result.filter(p => p.category === activeCategory);
    }
    result = result.filter(p => p.totalScore >= scoreFilter[0] && p.totalScore <= scoreFilter[1]);
    if (sortBy === "totalScore") {
      result = [...result].sort((a, b) => b.totalScore - a.totalScore);
    } else if (sortBy === "date") {
      result = [...result].sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    return result;
  }, [photos, activeCategory, sortBy, scoreFilter]);

  const handlePhotoClick = (photo) => {
    setSelectedPhoto(photo);
    setPanelOpen(true);
  };

  const handleClosePanel = () => {
    setPanelOpen(false);
    setTimeout(() => setSelectedPhoto(null), 300);
  };

  const handleUpload = (newPhoto) => {
    setPhotos(prev => [newPhoto, ...prev]);
    setUploadOpen(false);
  };

  const handleDeletePhoto = (photoId) => {
    if (!isAdmin) return;
    setPhotos(prev => prev.filter(p => p.id !== photoId));
    if (selectedPhoto && selectedPhoto.id === photoId) {
      handleClosePanel();
    }
  };

  const handleAddComment = (photoId, comment) => {
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

  const handleLogin = (password) => {
    if (password === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setShowLogin(false);
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    setIsAdmin(false);
  };

  return (
    <div className={`app ${panelOpen ? 'panel-open' : ''}`}>
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">Photo Critique</h1>
          <span className="app-subtitle">사진 크리틱 & 리뷰</span>
        </div>
        <div className="header-right">
          {isAdmin ? (
            <>
              <span className="admin-badge">Admin</span>
              <button className="upload-btn" onClick={() => setUploadOpen(true)}>
                + 사진 업로드
              </button>
              <button className="logout-btn" onClick={handleLogout}>
                로그아웃
              </button>
            </>
          ) : (
            <button className="login-btn" onClick={() => setShowLogin(true)}>
              관리자 로그인
            </button>
          )}
        </div>
      </header>

      <FilterBar
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
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
        isAdmin={isAdmin}
        onDeletePhoto={handleDeletePhoto}
      />

      {uploadOpen && isAdmin && (
        <UploadModal
          onUpload={handleUpload}
          onClose={() => setUploadOpen(false)}
          useFirebase={USE_FIREBASE}
        />
      )}

      {showLogin && (
        <AdminLogin
          onLogin={handleLogin}
          onClose={() => setShowLogin(false)}
        />
      )}
    </div>
  );
}

export default App;
