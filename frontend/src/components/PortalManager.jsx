import React, { useCallback, useEffect, useState } from 'react';
import { portalChangePassword, portalCreateFolder, portalCreateShareLink, portalDownloadFileUrl, portalGetFiles, portalGetFolders, portalGetSettings, portalGetStorageSummary, portalGetUploadProgress, portalMe, portalUploadFile, portalUploadFileChunk, publicShareUrl } from '../api';
import { ChevronRight, Download, Eye, File as FileIcon, Folder, HardDrive, Home, KeyRound, Link, Loader, LogOut, Moon, Plus, Sun, Upload, User, X } from 'lucide-react';

const PortalManager = ({ onLogout, theme, onToggleTheme }) => {
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [path, setPath] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadFileObj, setUploadFileObj] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadTasks, setUploadTasks] = useState([]);
  const [driveName, setDriveName] = useState('My Drive');
  const [previewFile, setPreviewFile] = useState(null);
  const [previewText, setPreviewText] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [storageSummary, setStorageSummary] = useState({
    drive_name: 'My Drive',
    drive_size: 0,
    current_name: 'My Drive',
    current_size: 0,
    folder_sizes: {},
  });

  const CHUNK_SIZE = 25 * 1024 * 1024;
  const CHUNKED_UPLOAD_THRESHOLD = 50 * 1024 * 1024;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [foldersRes, filesRes] = await Promise.all([
        portalGetFolders(currentFolderId),
        portalGetFiles(currentFolderId),
      ]);
      setFolders(foldersRes.data);
      setFiles(filesRes.data);
      const summaryRes = await portalGetStorageSummary(currentFolderId);
      setStorageSummary(summaryRes.data);
      setDriveName(summaryRes.data.drive_name);
    } finally {
      setLoading(false);
    }
  }, [currentFolderId]);

  useEffect(() => {
    Promise.all([portalMe(), portalGetSettings()])
      .then(([profileRes, settingsRes]) => {
        setProfile(profileRes.data);
        setDriveName(settingsRes.data.drive_name);
      })
      .catch(onLogout);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enterFolder = (folder) => {
    setCurrentFolderId(folder.id);
    setPath(prev => [...prev, { id: folder.id, name: folder.name }]);
  };

  const goToBreadcrumb = (index) => {
    if (index === -1) {
      setCurrentFolderId(null);
      setPath([]);
      return;
    }
    const nextPath = path.slice(0, index + 1);
    setCurrentFolderId(nextPath[nextPath.length - 1].id);
    setPath(nextPath);
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const formData = new FormData();
    formData.append('name', newFolderName);
    if (currentFolderId) formData.append('parent_id', currentFolderId);
    await portalCreateFolder(formData);
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
    setUploadTasks(prev => [...prev, {
      id: uploadId,
      name: fileToUpload.name,
      size: fileToUpload.size,
      percent: 0,
      stage: 'Preparing',
      bytesDone: 0,
      speed: 0,
      status: 'uploading',
    }]);
    setUploadFileObj(null);
    setShowUpload(false);
    startBackgroundUpload(uploadId, fileToUpload, folderId);
  };

  const updateUploadTask = (id, patch) => {
    setUploadTasks(prev => prev.map(task => task.id === id ? { ...task, ...patch } : task));
  };

  const applyServerUploadProgress = (uploadId, progress, fallbackSize) => {
    setUploadTasks(prev => prev.map(task => {
      if (task.id !== uploadId) return task;
      if (progress.stage === 'Waiting' && (task.bytesDone > 0 || task.stage !== 'Preparing')) {
        return task;
      }
      return {
        ...task,
        percent: Math.max(task.percent || 0, progress.percent || 0),
        stage: progress.stage || task.stage,
        bytesDone: progress.bytes_done ?? task.bytesDone,
        size: progress.bytes_total || task.size || fallbackSize,
        speed: progress.speed_bps ?? task.speed,
      };
    }));
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
          const res = await portalGetUploadProgress(uploadId);
          applyServerUploadProgress(uploadId, res.data, fileToUpload.size);
        } catch (err) {}
      }, 800);

      if (fileToUpload.size > CHUNKED_UPLOAD_THRESHOLD) {
        await uploadFileInChunks(uploadId, fileToUpload, folderId);
      } else {
        await portalUploadFile(formData, (progressEvent) => {
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
      }
      await waitForUploadCompletion(uploadId, fileToUpload.size);
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

  const uploadFileInChunks = async (uploadId, fileToUpload, folderId) => {
    const totalChunks = Math.ceil(fileToUpload.size / CHUNK_SIZE);
    let uploadedBytes = 0;
    let lastLoaded = 0;
    let lastTime = performance.now();
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileToUpload.size);
      const chunk = fileToUpload.slice(start, end);
      const formData = new FormData();
      formData.append('chunk', chunk, fileToUpload.name);
      formData.append('upload_id', uploadId);
      formData.append('chunk_index', chunkIndex);
      formData.append('total_chunks', totalChunks);
      formData.append('filename', fileToUpload.name);
      formData.append('total_size', fileToUpload.size);
      formData.append('mime_type', fileToUpload.type || 'application/octet-stream');
      if (folderId) formData.append('folder_id', folderId);

      await portalUploadFileChunk(formData, (progressEvent) => {
        const now = performance.now();
        const elapsed = Math.max((now - lastTime) / 1000, 0.1);
        const currentLoaded = uploadedBytes + progressEvent.loaded;
        const delta = currentLoaded - lastLoaded;
        lastLoaded = currentLoaded;
        lastTime = now;
        updateUploadTask(uploadId, {
          percent: Math.min(10, Math.round((currentLoaded / fileToUpload.size) * 10)),
          stage: `Sending chunk ${chunkIndex + 1} of ${totalChunks}`,
          bytesDone: currentLoaded,
          size: fileToUpload.size,
          speed: delta / elapsed,
        });
      });
      uploadedBytes = end;
    }
  };

  const waitForUploadCompletion = async (uploadId, fallbackSize) => {
    while (true) {
      const res = await portalGetUploadProgress(uploadId);
      applyServerUploadProgress(uploadId, res.data, fallbackSize);
      if (res.data.error) throw new Error(res.data.error);
      if (res.data.done) return;
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  };

  const handleShareFile = async (id) => {
    const res = await portalCreateShareLink(id);
    const url = publicShareUrl(res.data.url);
    try {
      await navigator.clipboard.writeText(url);
      alert('Share link copied to clipboard');
    } catch (err) {
      prompt('Share link', url);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileMessage('');
    try {
      const formData = new FormData();
      formData.append('current_password', currentPassword);
      formData.append('new_password', newPassword);
      await portalChangePassword(formData);
      setCurrentPassword('');
      setNewPassword('');
      setProfileMessage('Password updated');
    } catch (err) {
      setProfileError(err.response?.data?.detail || err.message);
    }
  };

  const fileExtension = (name = '') => name.split('.').pop()?.toLowerCase() || '';
  const isPdfFile = (file) => file.mime_type === 'application/pdf' || fileExtension(file.name) === 'pdf';
  const isTextFile = (file) => {
    const ext = fileExtension(file.name);
    return file.mime_type?.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'xml', 'log', 'yaml', 'yml', 'ini', 'env'].includes(ext);
  };
  const canPreviewFile = (file) => isPdfFile(file) || isTextFile(file) || ['doc', 'docx', 'rtf'].includes(fileExtension(file.name));

  const openPreviewFile = async (file) => {
    setPreviewFile(file);
    setPreviewText('');
    setPreviewError('');
    if (!isTextFile(file)) return;
    if (file.size > 5 * 1024 * 1024) {
      setPreviewError('Text preview is limited to 5 MB. Download the file to view it locally.');
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await fetch(portalDownloadFileUrl(file.id));
      if (!res.ok) throw new Error('Preview failed');
      setPreviewText(await res.text());
    } catch (err) {
      setPreviewError(err.message || 'Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatSpeed = (bytesPerSecond) => {
    if (!bytesPerSecond) return '0 B/s';
    return `${formatSize(bytesPerSecond)}/s`;
  };

  const uploadStatusLabel = (task) => {
    if (task.status === 'error') return 'Failed';
    if (task.status === 'done') return 'Completed';
    if (task.stage === 'Uploading to Telegram') return 'Uploading to Telegram';
    return 'Uploading';
  };

  const folderSize = (folderId) => storageSummary.folder_sizes?.[folderId] || 0;
  const storagePanelName = currentFolderId ? storageSummary.current_name : driveName;
  const storagePanelSize = storageSummary.current_size || 0;

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Folder className="w-6 h-6 text-blue-600 mr-2" />
              <span className="font-bold text-gray-800">{driveName}</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setShowProfile(true)} className="p-1 text-gray-500 hover:text-blue-600" title="Profile">
                <User className="w-4 h-4" />
              </button>
              <button onClick={onToggleTheme} className="p-1 text-gray-500 hover:text-blue-600" title="Toggle theme">
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button onClick={onLogout} className="p-1 text-gray-500 hover:text-red-600" title="Logout">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
          {profile && <p className="mt-2 text-xs text-gray-500 truncate">{profile.username}</p>}
        </div>
        <button
          onClick={() => { setCurrentFolderId(null); setPath([]); }}
          className={`m-2 flex items-center py-2 px-2 rounded-lg text-left transition ${currentFolderId === null ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
        >
          <Home className="w-4 h-4 mr-2" />
          <span className="text-sm font-medium">{driveName}</span>
        </button>
        <div className="mt-auto border-t border-gray-200 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <HardDrive className="h-4 w-4 text-blue-600" /> {storagePanelName}
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-blue-600" style={{ width: storagePanelSize ? '32%' : '8%' }} />
          </div>
          <p className="mt-2 text-xs text-gray-500">{formatSize(storagePanelSize)} / ∞</p>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <div className="flex items-center text-sm text-gray-600">
            <span onClick={() => goToBreadcrumb(-1)} className="cursor-pointer hover:text-blue-600 font-medium">{driveName}</span>
            {path.map((p, i) => (
              <React.Fragment key={p.id}>
                <ChevronRight className="w-4 h-4 mx-1 text-gray-400" />
                <span onClick={() => goToBreadcrumb(i)} className="cursor-pointer hover:text-blue-600">{p.name}</span>
              </React.Fragment>
            ))}
          </div>
          {profile?.can_upload && (
            <div className="flex gap-3">
              <button onClick={() => setShowNewFolder(true)} className="flex items-center px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium">
                <Plus className="w-4 h-4 mr-1" /> New Folder
              </button>
              <button onClick={() => setShowUpload(true)} className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                <Upload className="w-4 h-4 mr-1" /> Upload
              </button>
            </div>
          )}
        </header>

        <div className="flex-1 p-6 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {folders.map(folder => (
                <div key={folder.id} className="group relative bg-white p-4 rounded-xl border border-gray-200 hover:shadow-md transition cursor-pointer" onClick={() => enterFolder(folder)}>
                  <Folder className="w-10 h-10 text-yellow-500 mb-2" />
                  <p className="text-sm font-medium text-gray-800 truncate">{folder.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatSize(folderSize(folder.id))}</p>
                </div>
              ))}
              {files.map(file => (
                <div key={file.id} className="group relative bg-white p-4 rounded-xl border border-gray-200 hover:shadow-md transition cursor-pointer" onClick={() => canPreviewFile(file) ? openPreviewFile(file) : window.open(portalDownloadFileUrl(file.id), '_blank')}>
                  <div className="flex items-center justify-between mb-2">
                    <FileIcon className="w-10 h-10 text-blue-500" />
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      {canPreviewFile(file) && (
                        <button onClick={(e) => { e.stopPropagation(); openPreviewFile(file); }} className="p-1 text-gray-600 hover:bg-gray-100 rounded" title="Preview">
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); handleShareFile(file.id); }} className="p-1 text-blue-500 hover:bg-blue-50 rounded" title="Copy share link">
                        <Link className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatSize(file.size)}</p>
                  <p className="text-xs text-gray-500 mt-1 truncate">Uploaded by {file.uploaded_by || 'Owner'}</p>
                </div>
              ))}
              {folders.length === 0 && files.length === 0 && (
                <div className="col-span-full text-center text-gray-400 py-20">
                  <p>This folder is empty.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Upload File</h3>
              <button onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleUpload}>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition">
                <input type="file" onChange={e => setUploadFileObj(e.target.files[0])} className="hidden" id="portalFileInput" />
                <label htmlFor="portalFileInput" className="cursor-pointer block">
                  <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">{uploadFileObj ? uploadFileObj.name : 'Click to select a file'}</p>
                </label>
              </div>
              {uploading && (
                <div className="mt-4">
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p className="text-xs text-center mt-1 text-gray-500">{uploadStage || 'Uploading'} · {uploadProgress}%</p>
                </div>
              )}
              <button type="submit" disabled={!uploadFileObj || uploading} className="w-full mt-4 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
                {uploading ? 'Uploading...' : 'Upload'}
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
                    <p className="mt-1 text-xs font-medium text-gray-600">{uploadStatusLabel(task)}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{task.stage} · {formatSize(task.bytesDone || 0)} / {formatSize(task.size || 0)} · {formatSpeed(task.speed)}</p>
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

      {previewFile && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-bold text-gray-900">{previewFile.name}</h3>
                <p className="text-xs text-gray-500">{formatSize(previewFile.size)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => window.open(portalDownloadFileUrl(previewFile.id), '_blank')} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100" title="Download">
                  <Download className="h-5 w-5" />
                </button>
                <button onClick={() => setPreviewFile(null)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-gray-50">
              {isPdfFile(previewFile) ? (
                <iframe title={previewFile.name} src={portalDownloadFileUrl(previewFile.id)} className="h-full w-full" />
              ) : isTextFile(previewFile) ? (
                <div className="h-full overflow-auto p-5">
                  {previewLoading ? (
                    <div className="flex h-full items-center justify-center"><Loader className="h-8 w-8 animate-spin text-blue-600" /></div>
                  ) : previewError ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{previewError}</div>
                  ) : (
                    <pre className="whitespace-pre-wrap break-words rounded-lg bg-white p-4 text-sm leading-6 text-gray-800">{previewText}</pre>
                  )}
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                  <FileIcon className="mb-4 h-12 w-12 text-blue-500" />
                  <h4 className="text-lg font-semibold text-gray-900">Preview is not available for this document type</h4>
                  <p className="mt-2 max-w-md text-sm text-gray-500">Download the file to view it in the app that supports this format.</p>
                  <button onClick={() => window.open(portalDownloadFileUrl(previewFile.id), '_blank')} className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Download</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Profile</h3>
              <button onClick={() => setShowProfile(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                  <User className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{profile?.username}</p>
                  <p className="text-xs text-gray-500">{profile?.can_upload ? 'Can upload files' : 'Download only'}</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="mt-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <KeyRound className="h-4 w-4 text-blue-600" /> Change password
              </div>
              {profileError && <div className="rounded-lg bg-red-100 p-3 text-sm text-red-700">{profileError}</div>}
              {profileMessage && <div className="rounded-lg bg-green-100 p-3 text-sm text-green-700">{profileMessage}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700">Current password</label>
                <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">New password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <button type="submit" className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700">Update password</button>
            </form>

            <button onClick={onLogout} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </div>
      )}

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
    </div>
  );
};

export default PortalManager;
