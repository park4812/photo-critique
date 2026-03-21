import { useState, useMemo } from 'react';
import { samplePhotos, categories } from './sampleData';
import Gallery from './components/Gallery';
import SidePanel from './components/SidePanel';
import UploadModal from './components/UploadModal';
import FilterBar from './components/FilterBar';
import './App.css';

// Set to true when Firebase is configured
const USE_FIREBASE = false;

function App() {
  const [photos, setPhotos] = useState(samplePhotos);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("전체");
  const [sortBy, setSortBy] = useState("date");
  const [scoreFilter, setScoreFilter] = useState([0, 10]);

  // TODO: When USE_FIREBASE is true, use subscribeToPhotos() for real-time updates
  // useEffect(() => {
  //   if (!USE_FIREBASE) return;
  //   const unsubscribe = subscribeToPhotos(setPhotos);
  //   return unsubscribe;
  // }, []);

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
    // Real-time listener will update the photo automatically
  };

  return (
    <div className={`app ${panelOpen ? 'panel-open' : ''}`}>
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">Photo Critique</h1>
          <span className="app-subtitle">사진 크리틱 & 리뷰</span>
        </div>
        <button className="upload-btn" onClick={() => setUploadOpen(true)}>
          + 사진 업로드
        </button>
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

      <Gallery photos={filteredPhotos} onPhotoClick={handlePhotoClick} />

      <SidePanel
        photo={selectedPhoto}
        isOpen={panelOpen}
        onClose={handleClosePanel}
        onAddComment={handleAddComment}
        onReEvaluate={USE_FIREBASE ? handleReEvaluate : null}
      />

      {uploadOpen && (
        <UploadModal
          onUpload={handleUpload}
          onClose={() => setUploadOpen(false)}
          useFirebase={USE_FIREBASE}
        />
      )}
    </div>
  );
}

export default App;
