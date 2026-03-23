import { useState, useMemo, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Gallery from './components/Gallery';
import SidePanel from './components/SidePanel';
import UploadModal from './components/UploadModal';
import FilterBar from './components/FilterBar';
import AuthModal from './components/AuthModal';
import AdminPanel from './components/AdminPanel';
import AlbumList from './components/AlbumList';
import AlbumDetail from './components/AlbumDetail';
import TagManager from './components/TagManager';
import ContestList from './components/ContestList';
import ContestDetail from './components/ContestDetail';
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
  const [showTagManager, setShowTagManager] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  // URL hash에서 초기 뷰 상태 복원
  const getInitialView = () => {
    const hash = window.location.hash.replace('#', '');
    if (hash.startsWith('albums')) return 'albums';
    if (hash.startsWith('contests')) return 'contests';
    return 'gallery';
  };
  const getInitialAlbumId = () => {
    const hash = window.location.hash.replace('#', '');
    if (hash.startsWith('albums/')) return hash.split('/')[1];
    return null;
  };
  const getInitialContestId = () => {
    const hash = window.location.hash.replace('#', '');
    if (hash.startsWith('contests/')) return hash.split('/')[1];
    return null;
  };

  const [activeView, setActiveView] = useState(getInitialView);
  const [albums, setAlbums] = useState([]);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [initialAlbumId] = useState(getInitialAlbumId);
  const [contests, setContests] = useState([]);
  const [selectedContest, setSelectedContest] = useState(null);
  const [initialContestId] = useState(getInitialContestId);
  const [notifications, setNotifications] = useState([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [contestManagers, setContestManagers] = useState([]);
  const [highlightCommentId, setHighlightCommentId] = useState(null);

  // URL hash 동기화
  useEffect(() => {
    let newHash;
    if (selectedAlbum) newHash = `#albums/${selectedAlbum.id}`;
    else if (selectedContest) newHash = `#contests/${selectedContest.id}`;
    else if (activeView === 'albums') newHash = '#albums';
    else if (activeView === 'contests') newHash = '#contests';
    else newHash = '#gallery';
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, '', newHash);
    }
  }, [activeView, selectedAlbum, selectedContest]);

  // 브라우저 뒤로/앞으로 버튼 처리
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash.startsWith('contests/')) {
        const contestId = hash.split('/')[1];
        setActiveView('contests');
        setSelectedContest(prev => {
          if (prev?.id === contestId) return prev;
          return contests.find(c => c.id === contestId) || prev;
        });
        setSelectedAlbum(null);
      } else if (hash === 'contests') {
        setActiveView('contests');
        setSelectedContest(null);
        setSelectedAlbum(null);
      } else if (hash.startsWith('albums/')) {
        const albumId = hash.split('/')[1];
        setActiveView('albums');
        setSelectedAlbum(prev => {
          if (prev?.id === albumId) return prev;
          const found = albums.find(a => a.id === albumId);
          return found || prev;
        });
        setSelectedContest(null);
      } else if (hash === 'albums') {
        setActiveView('albums');
        setSelectedAlbum(null);
        setSelectedContest(null);
      } else {
        setActiveView('gallery');
        setSelectedAlbum(null);
        setSelectedContest(null);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [albums, contests]);

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

  // Firebase 앨범 실시간 구독
  useEffect(() => {
    if (!USE_FIREBASE) return;
    let unsubscribe;
    (async () => {
      const { subscribeToAlbums } = await import('./services/firebaseService');
      unsubscribe = subscribeToAlbums((firebaseAlbums) => {
        setAlbums(firebaseAlbums);
        setSelectedAlbum(prev => {
          // URL hash에서 복원된 초기 앨범 ID 처리
          if (!prev && initialAlbumId) {
            const found = firebaseAlbums.find(a => a.id === initialAlbumId);
            if (found) return found;
          }
          if (!prev) return prev;
          return firebaseAlbums.find(a => a.id === prev.id) || prev;
        });
      });
    })();
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  // Firebase 콘테스트 실시간 구독
  useEffect(() => {
    if (!USE_FIREBASE) return;
    let unsubscribe;
    (async () => {
      const { subscribeToContests } = await import('./services/firebaseService');
      unsubscribe = subscribeToContests((firebaseContests) => {
        setContests(firebaseContests);
        setSelectedContest(prev => {
          if (!prev && initialContestId) {
            const found = firebaseContests.find(c => c.id === initialContestId);
            if (found) return found;
          }
          if (!prev) return prev;
          return firebaseContests.find(c => c.id === prev.id) || prev;
        });
      });
    })();
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  // 투표 관리자 목록 구독
  useEffect(() => {
    let unsub;
    (async () => {
      const { subscribeToContestManagers } = await import('./services/firebaseService');
      unsub = subscribeToContestManagers(setContestManagers);
    })();
    return () => { if (unsub) unsub(); };
  }, []);

  const isContestManager = isAdmin || (currentUser && contestManagers.includes(currentUser.uid));

  // 내 사진 댓글 알림 구독
  useEffect(() => {
    if (!currentUser || !photos.length) { setNotifications([]); return; }
    const myPhotoIds = photos
      .filter(p => {
        if (p.uploaderUid && currentUser.uid) return p.uploaderUid === currentUser.uid;
        return p.uploaderName === (currentUser.displayName || currentUser.email);
      })
      .map(p => p.id);
    if (!myPhotoIds.length) { setNotifications([]); return; }

    const NOTIF_KEY = `notif_lastChecked_${currentUser.uid}`;
    const lastChecked = new Date(localStorage.getItem(NOTIF_KEY) || 0);

    let unsub;
    (async () => {
      const { subscribeToMyPhotoNotifications } = await import('./services/firebaseService');
      unsub = subscribeToMyPhotoNotifications(myPhotoIds, lastChecked, (newComments) => {
        // 본인이 쓴 댓글은 제외
        const filtered = newComments.filter(c => c.authorUid !== currentUser.uid && c.author !== (currentUser.displayName || currentUser.email));
        setNotifications(filtered);
      });
    })();
    return () => { if (unsub) unsub(); };
  }, [currentUser, photos]);

  const handleNotifClick = () => {
    setShowNotifPanel(prev => !prev);
  };

  const handleNotifClear = () => {
    if (!currentUser) return;
    const NOTIF_KEY = `notif_lastChecked_${currentUser.uid}`;
    localStorage.setItem(NOTIF_KEY, new Date().toISOString());
    setNotifications([]);
    setShowNotifPanel(false);
  };

  // 알림에서 사진 클릭 → 해당 사진으로 이동
  const handleNotifPhotoClick = (photoId, commentId) => {
    const photo = photos.find(p => p.id === photoId);
    if (photo) {
      setActiveView('gallery');
      setSelectedPhoto(photo);
      setPanelOpen(true);
      setHighlightCommentId(commentId || null);
      // 이 알림 하나만 읽음 처리 (notifications에서 제거)
      if (commentId) {
        setNotifications(prev => prev.filter(n => n.id !== commentId));
      }
    }
    setShowNotifPanel(false);
  };

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

  // ===== Album handlers =====
  const handleCreateAlbum = async (albumData) => {
    if (!USE_FIREBASE) return;
    const { createAlbum } = await import('./services/firebaseService');
    await createAlbum(albumData);
  };

  const handleDeleteAlbum = async (albumId) => {
    if (!USE_FIREBASE) return;
    const { deleteAlbum } = await import('./services/firebaseService');
    await deleteAlbum(albumId);
  };

  const handleEditAlbum = async (albumId, data) => {
    if (!USE_FIREBASE) return;
    const { updateAlbum } = await import('./services/firebaseService');
    await updateAlbum(albumId, data);
  };

  const handleSetAlbumCover = async (albumId, photoId) => {
    if (!USE_FIREBASE) return;
    const { updateAlbum } = await import('./services/firebaseService');
    await updateAlbum(albumId, { coverPhotoId: photoId });
  };

  const handleAddPhotosToAlbum = async (albumId, photoIds) => {
    if (!USE_FIREBASE) return;
    const { addPhotoToAlbum } = await import('./services/firebaseService');
    for (const pid of photoIds) {
      await addPhotoToAlbum(albumId, pid);
    }
  };

  const handleRemovePhotoFromAlbum = async (albumId, photoId) => {
    if (!USE_FIREBASE) return;
    const { removePhotoFromAlbum } = await import('./services/firebaseService');
    await removePhotoFromAlbum(albumId, photoId);
  };

  // ===== Contest handlers =====
  const handleCreateContest = async (data) => {
    if (!USE_FIREBASE) return;
    const { createContest } = await import('./services/firebaseService');
    await createContest(data);
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
              <button className="header-icon-btn notif-bell" onClick={handleNotifClick} title="알림">
                🔔
                {notifications.length > 0 && (
                  <span className="notif-badge">{notifications.length > 99 ? '99+' : notifications.length}</span>
                )}
              </button>
              <button className="header-icon-btn" onClick={handleAdminToggle} title={isAdmin ? '관리자 모드 해제' : '관리자 모드'}>
                {isAdmin ? '🔓' : '🔒'}
              </button>
              {isAdmin && (
                <button className="header-icon-btn" onClick={() => setShowTagManager(true)} title="태그 관리">
                  🏷
                </button>
              )}
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

      {/* 알림 패널 */}
      {showNotifPanel && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span>새 크리틱 알림</span>
            {notifications.length > 0 && (
              <button className="notif-clear-btn" onClick={handleNotifClear}>모두 읽음</button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="notif-empty">새로운 알림이 없습니다</div>
          ) : (
            <div className="notif-list">
              {notifications.slice(0, 20).map((n, i) => {
                const photoTitle = photos.find(p => p.id === n.photoId)?.title || '사진';
                const timeStr = n.createdAt?.toDate
                  ? n.createdAt.toDate().toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : '';
                return (
                  <div key={n.id || i} className="notif-item" onClick={() => handleNotifPhotoClick(n.photoId, n.id)}>
                    <div className="notif-item-text">
                      <strong>{n.author || '누군가'}</strong>님이 <em>{photoTitle}</em>에 크리틱을 남겼습니다
                    </div>
                    <div className="notif-item-time">{timeStr}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {showNotifPanel && <div className="notif-overlay" onClick={() => setShowNotifPanel(false)} />}

      {/* View Tabs */}
      <div className="view-tabs">
        <button
          className={`view-tab ${activeView === 'gallery' ? 'active' : ''}`}
          onClick={() => { setActiveView('gallery'); setSelectedAlbum(null); setSelectedContest(null); }}
        >갤러리</button>
        <button
          className={`view-tab ${activeView === 'albums' ? 'active' : ''}`}
          onClick={() => { setActiveView('albums'); setSelectedAlbum(null); setSelectedContest(null); }}
        >앨범</button>
        <button
          className={`view-tab ${activeView === 'contests' ? 'active' : ''}`}
          onClick={() => { setActiveView('contests'); setSelectedAlbum(null); setSelectedContest(null); }}
        >투표</button>
      </div>

      {activeView === 'gallery' && (
        <>
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
        </>
      )}

      {activeView === 'albums' && !selectedAlbum && (
        <AlbumList
          albums={albums}
          photos={photos}
          onAlbumClick={(album) => setSelectedAlbum(album)}
          onCreateAlbum={handleCreateAlbum}
          currentUser={currentUser}
          isAdmin={isAdmin}
        />
      )}

      {activeView === 'albums' && selectedAlbum && (
        <AlbumDetail
          album={selectedAlbum}
          photos={photos}
          allPhotos={photos}
          onBack={() => setSelectedAlbum(null)}
          onPhotoClick={handlePhotoClick}
          onRemovePhoto={handleRemovePhotoFromAlbum}
          onAddPhotos={handleAddPhotosToAlbum}
          onDeleteAlbum={handleDeleteAlbum}
          onEditAlbum={handleEditAlbum}
          onSetCover={handleSetAlbumCover}
          currentUser={currentUser}
          isAdmin={isAdmin}
        />
      )}

      {activeView === 'contests' && !selectedContest && (
        <ContestList
          contests={contests}
          onContestClick={(c) => setSelectedContest(c)}
          onCreateContest={handleCreateContest}
          isAdmin={isAdmin}
          isContestManager={isContestManager}
          currentUser={currentUser}
        />
      )}

      {activeView === 'contests' && selectedContest && (
        <ContestDetail
          contest={selectedContest}
          onBack={() => setSelectedContest(null)}
          currentUser={currentUser}
          isAdmin={isAdmin}
          isContestManager={isContestManager}
        />
      )}

      <SidePanel
        photo={selectedPhoto}
        isOpen={panelOpen}
        onClose={handleClosePanel}
        onAddComment={handleAddComment}
        onReEvaluate={USE_FIREBASE ? handleReEvaluate : null}
        onDebateEvaluate={USE_FIREBASE ? handleDebateEvaluate : null}
        isAdmin={isAdmin}
        onDeletePhoto={handleDeletePhoto}
        currentUser={currentUser}
        highlightCommentId={highlightCommentId}
        onHighlightDone={() => setHighlightCommentId(null)}
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

      {showTagManager && isAdmin && (
        <TagManager photos={photos} onClose={() => setShowTagManager(false)} />
      )}
    </div>
  );
}

export default App;
