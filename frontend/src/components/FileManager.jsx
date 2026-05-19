import React, { useState, useEffect, useCallback } from 'react';
import { createPortalUser, getPortalUsers, getFolders, getAllFolders, getFiles, deleteFolder, deleteFile, createFolder, uploadFile, downloadFileUrl, deletePortalUser, updatePortalUser, getUploadProgress, createShareLink, publicShareUrl, moveFile, getSettings, updateSettings, getStorageSummary } from '../api';
import { Folder, File as FileIcon, Trash2, Upload, Plus, ChevronRight, Home, Loader, X, Users, Link, MoveRight, Pencil, Search, Grid3X3, List, HardDrive, LogOut, Cloud, Moon, Sun } from 'lucide-react';

const FolderTree = ({ parentId = null, level = 0, selectedId, onSelect }) => {
  const [folders, setFolders] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(false);

  const fetchFolders = async () => {
    setLoading(true);
    try {
      const res = await getFolders(parentId);
      setFolders(res.data);
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => {
    fetchFolders();
  }, [parentId]);

  const toggleExpand = (e, id) => {
    e.stopPropagation();
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div>
      {folders.map(folder => (
        <div key={folder.id}>
          <div
            onClick={() => onSelect(folder.id, folder.name)}
            className={`flex items-center py-1 px-2 cursor-pointer rounded-lg transition ${selectedId === folder.id ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
            style={{ paddingLeft: `${level * 16 + 8}px` }}
          >
            <ChevronRight
              className={`w-4 h-4 mr-1 transition-transform ${expanded[folder.id] ? 'rotate-90' : ''}`}
              onClick={(e) => toggleExpand(e, folder.id)}
            />
            <Folder className="w-4 h-4 mr-2 text-yellow-500" />
            <span className="text-sm truncate">{folder.name}</span>
          </div>
          {expanded[folder.id] && (
            <FolderTree parentId={folder.id} level={level + 1} selectedId={selectedId} onSelect={onSelect} />
          )}
        </div>
      ))}
    </div>
  );
};

const FileManager = ({ onLogout, theme, onToggleTheme }) => {
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [path, setPath] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadFileObj, setUploadFileObj] = useState(null);
  const [uploadTasks, setUploadTasks] = useState([]);
  const [showUsers, setShowUsers] = useState(false);
  const [portalUsers, setPortalUsers] = useState([]);
  const [portalUsername, setPortalUsername] = useState('');
  const [portalPassword, setPortalPassword] = useState('');
  const [portalCanUpload, setPortalCanUpload] = useState(false);
  const [portalError, setPortalError] = useState('');
  const [editingPortalUser, setEditingPortalUser] = useState(null);
  const [editPortalUsername, setEditPortalUsername] = useState('');
  const [editPortalPassword, setEditPortalPassword] = useState('');
  const [editPortalCanUpload, setEditPortalCanUpload] = useState(false);
  const [showMoveFile, setShowMoveFile] = useState(false);
  const [movingFile, setMovingFile] = useState(null);
  const [moveFolderId, setMoveFolderId] = useState('');
  const [allFolders, setAllFolders] = useState([]);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [driveName, setDriveName] = useState('My Drive');
  const [driveNameDraft, setDriveNameDraft] = useState('My Drive');
  const [showDriveSettings, setShowDriveSettings] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [storageSummary, setStorageSummary] = useState({
    drive_name: 'My Drive',
    drive_size: 0,
    current_name: 'My Drive',
    current_size: 0,
    folder_sizes: {},
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, flRes] = await Promise.all([
        getFolders(currentFolderId),
        getFiles(currentFolderId)
      ]);
      setFolders(fRes.data);
      setFiles(flRes.data);
      const summaryRes = await getStorageSummary(currentFolderId);
      setStorageSummary(summaryRes.data);
      setDriveName(summaryRes.data.drive_name);
      setDriveNameDraft(summaryRes.data.drive_name);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [currentFolderId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    getSettings().then(res => {
      setDriveName(res.data.drive_name);
      setDriveNameDraft(res.data.drive_name);
    }).catch(() => {});
  }, []);

  const enterFolder = (folder) => {
    setCurrentFolderId(folder.id);
    setPath(prev => [...prev, { id: folder.id, name: folder.name }]);
  };

  const goToBreadcrumb = (index) => {
    if (index === -1) {
      setCurrentFolderId(null);
      setPath([]);
    } else {
      const newPath = path.slice(0, index + 1);
      setCurrentFolderId(newPath[newPath.length - 1].id);
      setPath(newPath);
    }
  };

  const handleDeleteFolder = async (id) => {
    if (!confirm('Delete this folder and all its contents?')) return;
    await deleteFolder(id);
    refresh();
  };

  const handleDeleteFile = async (id) => {
    if (!confirm('Delete this file?')) return;
    await deleteFile(id);
    refresh();
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    await createFolder({ name: newFolderName, parent_id: currentFolderId });
    setNewFolderName('');
    setShowNewFolder(false);
    refresh();
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadFileObj) return;
    const fileToUpload = uploadFileObj;
    const uploadId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const folderId = currentFolderId;
    setUploadTasks(prev => [
      ...prev,
      {
        id: uploadId,
        name: fileToUpload.name,
        size: fileToUpload.size,
        percent: 0,
        stage: 'Preparing',
        bytesDone: 0,
        speed: 0,
        status: 'uploading',
      }
    ]);
    setUploadFileObj(null);
    setShowUpload(false);
    startBackgroundUpload(uploadId, fileToUpload, folderId);
  };

  const updateUploadTask = (id, patch) => {
    setUploadTasks(prev => prev.map(task => task.id === id ? { ...task, ...patch } : task));
  };

  const startBackgroundUpload = async (uploadId, fileToUpload, folderId) => {
    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('upload_id', uploadId);
    if (folderId) formData.append('folder_id', folderId);

    let poller = null;
    let lastLoaded = 0;
    let lastTime = performance.now();
    try {
      poller = setInterval(async () => {
        try {
          const res = await getUploadProgress(uploadId);
          updateUploadTask(uploadId, {
            percent: res.data.percent,
            stage: res.data.stage,
            bytesDone: res.data.bytes_done ?? undefined,
            size: res.data.bytes_total || fileToUpload.size,
            speed: res.data.speed_bps ?? 0,
          });
        } catch (err) {}
      }, 800);

      await uploadFile(formData, (progressEvent) => {
        const now = performance.now();
        const elapsed = Math.max((now - lastTime) / 1000, 0.1);
        const delta = progressEvent.loaded - lastLoaded;
        lastLoaded = progressEvent.loaded;
        lastTime = now;
        updateUploadTask(uploadId, {
          percent: Math.min(10, Math.round((progressEvent.loaded / progressEvent.total) * 10)),
          stage: 'Sending to server',
          bytesDone: progressEvent.loaded,
          size: progressEvent.total || fileToUpload.size,
          speed: delta / elapsed,
        });
      });
      updateUploadTask(uploadId, { percent: 100, stage: 'Done', bytesDone: fileToUpload.size, speed: 0, status: 'done' });
      refresh();
      setTimeout(() => {
        setUploadTasks(prev => prev.filter(task => task.id !== uploadId));
      }, 5000);
    } catch (err) {
      updateUploadTask(uploadId, { stage: err.response?.data?.detail || 'Upload failed', status: 'error', speed: 0 });
    } finally {
      if (poller) clearInterval(poller);
    }
  };

  const handleShareFile = async (id) => {
    const res = await createShareLink(id);
    const url = publicShareUrl(res.data.url);
    try {
      await navigator.clipboard.writeText(url);
      alert('Share link copied to clipboard');
    } catch (err) {
      prompt('Share link', url);
    }
  };

  const openMoveFile = async (file) => {
    setMovingFile(file);
    setMoveFolderId(file.folder_id || '');
    const res = await getAllFolders();
    setAllFolders(res.data);
    setShowMoveFile(true);
  };

  const handleMoveFile = async (e) => {
    e.preventDefault();
    if (!movingFile) return;
    const formData = new FormData();
    if (moveFolderId) formData.append('folder_id', moveFolderId);
    await moveFile(movingFile.id, formData);
    setShowMoveFile(false);
    setMovingFile(null);
    setMoveFolderId('');
    refresh();
  };

  const loadPortalUsers = async () => {
    const res = await getPortalUsers();
    setPortalUsers(res.data);
  };

  const openUsers = async () => {
    setPortalError('');
    setShowUsers(true);
    await loadPortalUsers();
  };

  const handleCreatePortalUser = async (e) => {
    e.preventDefault();
    setPortalError('');
    try {
      const formData = new FormData();
      formData.append('username', portalUsername);
      formData.append('password', portalPassword);
      formData.append('can_upload', portalCanUpload);
      await createPortalUser(formData);
      setPortalUsername('');
      setPortalPassword('');
      setPortalCanUpload(false);
      await loadPortalUsers();
    } catch (err) {
      setPortalError(err.response?.data?.detail || err.message);
    }
  };

  const handleDeletePortalUser = async (id) => {
    if (!confirm('Delete this friend account?')) return;
    await deletePortalUser(id);
    await loadPortalUsers();
  };

  const startEditPortalUser = (user) => {
    setPortalError('');
    setEditingPortalUser(user);
    setEditPortalUsername(user.username);
    setEditPortalPassword('');
    setEditPortalCanUpload(Boolean(user.can_upload));
  };

  const cancelEditPortalUser = () => {
    setEditingPortalUser(null);
    setEditPortalUsername('');
    setEditPortalPassword('');
    setEditPortalCanUpload(false);
  };

  const handleUpdatePortalUser = async (e) => {
    e.preventDefault();
    if (!editingPortalUser) return;
    setPortalError('');
    try {
      const formData = new FormData();
      formData.append('username', editPortalUsername);
      formData.append('can_upload', editPortalCanUpload);
      if (editPortalPassword) formData.append('password', editPortalPassword);
      await updatePortalUser(editingPortalUser.id, formData);
      cancelEditPortalUser();
      await loadPortalUsers();
    } catch (err) {
      setPortalError(err.response?.data?.detail || err.message);
    }
  };

  const openDriveSettings = () => {
    setSettingsError('');
    setDriveNameDraft(driveName);
    setShowDriveSettings(true);
  };

  const handleRenameDrive = async (e) => {
    e.preventDefault();
    setSettingsError('');
    try {
      const formData = new FormData();
      formData.append('drive_name', driveNameDraft);
      const res = await updateSettings(formData);
      setDriveName(res.data.drive_name);
      setDriveNameDraft(res.data.drive_name);
      setShowDriveSettings(false);
    } catch (err) {
      setSettingsError(err.response?.data?.detail || err.message);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond) => {
    if (!bytesPerSecond) return '0 B/s';
    return `${formatSize(bytesPerSecond)}/s`;
  };

  const folderSize = (folderId) => storageSummary.folder_sizes?.[folderId] || 0;

  const visibleFolders = folders.filter(folder => folder.name.toLowerCase().includes(query.toLowerCase()));
  const visibleFiles = files.filter(file => file.name.toLowerCase().includes(query.toLowerCase()));
  const storagePanelName = currentFolderId ? storageSummary.current_name : driveName;
  const storagePanelSize = storageSummary.current_size || 0;
  const currentLocation = currentFolderId ? storageSummary.current_name : driveName;

  return (
    <div className="flex h-screen bg-[#f8fafc] text-gray-900">
      {/* Sidebar */}
      <aside className="hidden w-72 flex-col border-r border-gray-200 bg-white md:flex">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center">
            <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <span className="block font-semibold text-gray-900">Telegram Drive</span>
              <span className="text-xs text-gray-500">Owner workspace</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onToggleTheme} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="Toggle theme">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button onClick={onLogout} className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600" title="Logout">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <button onClick={() => setShowUpload(true)} className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">
            <Upload className="h-4 w-4" /> Upload
          </button>
          <div
            onClick={() => { setCurrentFolderId(null); setPath([]); }}
            className={`flex items-center py-2 px-3 cursor-pointer rounded-lg transition ${currentFolderId === null ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100'}`}
          >
            <Home className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">{driveName}</span>
          </div>
          <div className="mt-2">
            <FolderTree selectedId={currentFolderId} onSelect={(id, name) => {
              // Rebuild path based on selected folder? Hard without full tree path.
              // Simplified: just navigate to folder and clear breadcrumbs for now
              setCurrentFolderId(id);
              setPath([]);
            }} />
          </div>
        </div>
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <HardDrive className="h-4 w-4 text-blue-600" /> {storagePanelName}
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-blue-600" style={{ width: storagePanelSize ? '32%' : '8%' }} />
          </div>
          <p className="mt-2 text-xs text-gray-500">{formatSize(storagePanelSize)} / ∞</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col">
        {/* Toolbar */}
        <header className="border-b border-gray-200 bg-white px-4 py-3 lg:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center text-sm text-gray-600">
                <span onClick={() => goToBreadcrumb(-1)} className="cursor-pointer hover:text-blue-600 font-medium">{driveName}</span>
                {path.map((p, i) => (
                  <React.Fragment key={p.id}>
                    <ChevronRight className="w-4 h-4 mx-1 text-gray-400" />
                    <span onClick={() => goToBreadcrumb(i)} className="cursor-pointer hover:text-blue-600">{p.name}</span>
                  </React.Fragment>
                ))}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-normal text-gray-900">{currentLocation}</h1>
                {!path.length && (
                  <button onClick={openDriveSettings} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600" title="Rename drive">
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search in this folder" className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100" />
              </div>
              <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1">
                <button onClick={() => setViewMode('grid')} className={`rounded-lg p-2 ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`} title="Grid view">
                  <Grid3X3 className="h-4 w-4" />
                </button>
                <button onClick={() => setViewMode('list')} className={`rounded-lg p-2 ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`} title="List view">
                  <List className="h-4 w-4" />
                </button>
              </div>
              <button onClick={openUsers} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50">
                <Users className="w-4 h-4" /> Friends
              </button>
              <button onClick={() => setShowNewFolder(true)} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50">
                <Plus className="w-4 h-4" /> New
              </button>
              <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                <Upload className="w-4 h-4" /> Upload
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : viewMode === 'list' ? (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="grid grid-cols-[1fr_110px_120px] border-b border-gray-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <span>Name</span><span>Size</span><span className="text-right">Actions</span>
              </div>
              {[...visibleFolders.map(item => ({ ...item, kind: 'folder' })), ...visibleFiles.map(item => ({ ...item, kind: 'file' }))].map(item => (
                <div key={`${item.kind}-${item.id}`} onClick={() => item.kind === 'folder' ? enterFolder(item) : window.open(downloadFileUrl(item.id), '_blank')} className="grid cursor-pointer grid-cols-[1fr_110px_120px] items-center border-b border-gray-50 px-4 py-3 last:border-0 hover:bg-blue-50/60">
                  <div className="flex min-w-0 items-center gap-3">
                    {item.kind === 'folder' ? <Folder className="h-5 w-5 shrink-0 text-amber-500" /> : <FileIcon className="h-5 w-5 shrink-0 text-blue-500" />}
                    <span className="truncate text-sm font-medium text-gray-800">{item.name}</span>
                  </div>
                  <span className="text-sm text-gray-500">{item.kind === 'folder' ? formatSize(folderSize(item.id)) : formatSize(item.size)}</span>
                  <div className="flex justify-end gap-1">
                    {item.kind === 'file' && <button onClick={(e) => { e.stopPropagation(); handleShareFile(item.id); }} className="rounded-lg p-2 text-blue-600 hover:bg-blue-100" title="Copy share link"><Link className="h-4 w-4" /></button>}
                    {item.kind === 'file' && <button onClick={(e) => { e.stopPropagation(); openMoveFile(item); }} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100" title="Move"><MoveRight className="h-4 w-4" /></button>}
                    <button onClick={(e) => { e.stopPropagation(); item.kind === 'folder' ? handleDeleteFolder(item.id) : handleDeleteFile(item.id); }} className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Delete"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
              {visibleFolders.length === 0 && visibleFiles.length === 0 && <div className="py-16 text-center text-sm text-gray-400">Nothing here yet.</div>}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {visibleFolders.map(folder => (
                <div key={folder.id} className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-sm" onClick={() => enterFolder(folder)}>
                  <div className="flex items-center justify-between mb-2">
                    <Folder className="w-10 h-10 text-yellow-500" />
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }} className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 rounded transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm font-medium text-gray-800 truncate">{folder.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatSize(folderSize(folder.id))}</p>
                </div>
              ))}
              {visibleFiles.map(file => (
                <div key={file.id} className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-sm" onClick={() => window.open(downloadFileUrl(file.id), '_blank')}>
                  <div className="flex items-center justify-between mb-2">
                    <FileIcon className="w-10 h-10 text-blue-500" />
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={(e) => { e.stopPropagation(); handleShareFile(file.id); }} className="p-1 text-blue-500 hover:bg-blue-50 rounded" title="Copy share link">
                        <Link className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); openMoveFile(file); }} className="p-1 text-gray-600 hover:bg-gray-100 rounded" title="Move">
                        <MoveRight className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id); }} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatSize(file.size)}</p>
                </div>
              ))}
              {visibleFolders.length === 0 && visibleFiles.length === 0 && (
                <div className="col-span-full text-center text-gray-400 py-20">
                  <Folder className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                  <p>{query ? 'No matching files or folders.' : 'This folder is empty.'}</p>
                  {!query && <p className="text-sm mt-1">Upload files or create folders to get started.</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Upload File</h3>
              <button onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleUpload}>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition">
                <input type="file" onChange={e => setUploadFileObj(e.target.files[0])} className="hidden" id="fileInput" />
                <label htmlFor="fileInput" className="cursor-pointer block">
                  <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">{uploadFileObj ? uploadFileObj.name : 'Click to select a file'}</p>
                </label>
              </div>
              <button type="submit" disabled={!uploadFileObj} className="w-full mt-4 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
                Start upload
              </button>
            </form>
          </div>
        </div>
      )}

      {uploadTasks.length > 0 && (
        <div className="fixed bottom-5 right-5 z-40 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Uploads</p>
              <p className="text-xs text-gray-500">{uploadTasks.filter(task => task.status === 'uploading').length} active</p>
            </div>
            <button onClick={() => setUploadTasks(prev => prev.filter(task => task.status === 'uploading'))} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Clear completed uploads">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {uploadTasks.map(task => (
              <div key={task.id} className="border-b border-gray-100 px-4 py-3 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">{task.name}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {task.stage} · {formatSize(task.bytesDone || 0)} / {formatSize(task.size || 0)} · {formatSpeed(task.speed)}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold ${task.status === 'error' ? 'text-red-500' : 'text-blue-600'}`}>
                    {task.status === 'error' ? 'Failed' : `${task.percent || 0}%`}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-full rounded-full transition-all ${task.status === 'error' ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${Math.max(2, task.percent || 0)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {showNewFolder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">New Folder</h3>
              <button onClick={() => setShowNewFolder(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateFolder}>
              <input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Folder name" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
              <button type="submit" className="w-full mt-4 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition">Create</button>
            </form>
          </div>
        </div>
      )}

      {showMoveFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Move File</h3>
              <button onClick={() => setShowMoveFile(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleMoveFile} className="space-y-4">
              <p className="text-sm text-gray-600 truncate">{movingFile?.name}</p>
              <div>
                <label className="block text-sm font-medium text-gray-700">Destination</label>
                <select value={moveFolderId} onChange={e => setMoveFolderId(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">{driveName}</option>
                  {allFolders.map(folder => (
                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition">Move</button>
            </form>
          </div>
        </div>
      )}

      {showUsers && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Friend Accounts</h3>
              <button onClick={() => setShowUsers(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            {portalError && <div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4 text-sm">{portalError}</div>}
            <form onSubmit={handleCreatePortalUser} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end border-b border-gray-200 pb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Username</label>
                <input type="text" value={portalUsername} onChange={e => setPortalUsername(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <input type="password" value={portalPassword} onChange={e => setPortalPassword(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Create</button>
              <label className="md:col-span-3 flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={portalCanUpload} onChange={e => setPortalCanUpload(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Allow this friend to upload files and create folders
              </label>
            </form>
            {editingPortalUser && (
              <form onSubmit={handleUpdatePortalUser} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end border-b border-gray-200 py-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Edit Username</label>
                  <input type="text" value={editPortalUsername} onChange={e => setEditPortalUsername(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">New Password</label>
                  <input type="password" value={editPortalPassword} onChange={e => setEditPortalPassword(e.target.value)} placeholder="Leave blank to keep" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Save</button>
                  <button type="button" onClick={cancelEditPortalUser} className="bg-white border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50">Cancel</button>
                </div>
                <label className="md:col-span-3 flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={editPortalCanUpload} onChange={e => setEditPortalCanUpload(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  Allow this friend to upload files and create folders
                </label>
              </form>
            )}
            <div className="mt-4 max-h-72 overflow-y-auto">
              {portalUsers.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">No friend accounts yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {portalUsers.map(user => (
                    <div key={user.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium text-gray-800">{user.username}</p>
                        <p className="text-xs text-gray-500">{user.can_upload ? 'Can upload' : 'Download only'}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => startEditPortalUser(user)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg" title="Edit">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeletePortalUser(user.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showDriveSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Rename Drive</h3>
              <button onClick={() => setShowDriveSettings(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            {settingsError && <div className="mb-4 rounded-lg bg-red-100 p-3 text-sm text-red-700">{settingsError}</div>}
            <form onSubmit={handleRenameDrive}>
              <label className="block text-sm font-medium text-gray-700">Drive name</label>
              <input type="text" value={driveNameDraft} onChange={e => setDriveNameDraft(e.target.value)} maxLength={40} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
              <button type="submit" className="w-full mt-4 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition">Save</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileManager;
