import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const API_URL = 'https://infinite-canvas-production-b078.up.railway.app';

function App() {
  // 画布尺寸 - 改小以提升性能
  const canvasSize = 2000;

  // 状态
  const [images, setImages] = useState([]);
  const [pixels, setPixels] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(3);
  const [brushSoftness, setBrushSoftness] = useState(0);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [uploadRemaining, setUploadRemaining] = useState(2);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  const [dragImage, setDragImage] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [lastSaveTime, setLastSaveTime] = useState(Date.now());
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [showDonation, setShowDonation] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  // refs
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const pendingPixels = useRef([]);
  const panStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const touchStartRef = useRef({
    distance: 0, scale: 1, centerX: 0, centerY: 0,
    offsetX: 0, offsetY: 0, twoFinger: false
  });

  // 初始化
  useEffect(() => {
    fetchImages();
    fetchPixels();
    fetchUploadStatus();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    pixels.forEach(p => {
      ctx.globalAlpha = (p.opacity || 100) / 100;
      ctx.fillStyle = p.color || '#000000';
      ctx.fillRect(p.x, p.y, 1, 1);
    });
    ctx.globalAlpha = 1;
  }, [pixels, canvasSize]);

  // API
  const fetchImages = async () => {
    try {
      const res = await fetch(API_URL + '/api/images');
      setImages(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchPixels = async () => {
    try {
      const res = await fetch(API_URL + '/api/pixels');
      setPixels(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchUploadStatus = async () => {
    try {
      const res = await fetch(API_URL + '/api/upload/status', { credentials: 'include' });
      const data = await res.json();
      setUploadRemaining(data.remaining);
    } catch (err) { console.error(err); }
  };

  // 图片上传：检测尺寸 -> 压缩到 50x50 以内 -> 确认后上传
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert('图片大小不能超过10MB'); return; }
    if (uploadRemaining <= 0) { alert('今日上传次数已用完'); return; }
    e.target.value = '';

    // 读取图片原始尺寸
    const imgInfo = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, dataURL: ev.target.result });
        img.onerror = () => resolve({ width: 400, height: 400, dataURL: '' });
        img.src = ev.target.result;
      };
      reader.onerror = () => resolve({ width: 400, height: 400, dataURL: '' });
      reader.readAsDataURL(file);
    });

    // 计算目标尺寸（保持比例，最大50像素）
    const maxPx = 50;
    let tw = imgInfo.width;
    let th = imgInfo.height;
    if (tw > maxPx || th > maxPx) {
      const s = Math.min(maxPx / tw, maxPx / th);
      tw = Math.max(1, Math.floor(tw * s));
      th = Math.max(1, Math.floor(th * s));
    }

    // 绘制并压缩为 JPG blob
    const cv = document.createElement('canvas');
    cv.width = tw;
    cv.height = th;
    const cctx = cv.getContext('2d');
    const srcImg = new Image();
    srcImg.src = imgInfo.dataURL;
    await new Promise((res) => { srcImg.onload = res; srcImg.onerror = res; });
    cctx.drawImage(srcImg, 0, 0, tw, th);
    const smallDataURL = cv.toDataURL('image/jpeg', 0.8);

    // 转 blob
    const bytes = atob(smallDataURL.split(',')[1]);
    const byteArray = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) byteArray[i] = bytes.charCodeAt(i);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });
    const smallFile = new File([blob], 'image.jpg', { type: 'image/jpeg' });

    setConfirmData({
      file: smallFile,
      preview: smallDataURL,
      width: tw,
      height: th,
      origSize: (file.size / 1024).toFixed(1),
      newSize: (blob.size / 1024).toFixed(1)
    });
    setShowConfirm(true);
  };

  // 确认上传
  const confirmUpload = async () => {
    if (!confirmData) return;
    setShowConfirm(false);
    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('image', confirmData.file);
    formData.append('width', String(confirmData.width));
    formData.append('height', String(confirmData.height));

    try {
      const xhr = new XMLHttpRequest();
      xhr.timeout = 60000;
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.success) {
              setUploadProgress(100);
              setTimeout(() => {
                setIsUploading(false);
                fetchImages();
                fetchUploadStatus();
                setUploadMessage('上传成功！');
                setTimeout(() => setUploadMessage(''), 2000);
              }, 200);
            } else {
              setIsUploading(false);
              alert(data.error || '上传失败');
            }
          } catch (err) {
            setIsUploading(false);
            alert('上传失败');
          }
        } else {
          setIsUploading(false);
          alert('上传失败（错误 ' + xhr.status + '）');
        }
      };
      xhr.onerror = () => { setIsUploading(false); alert('上传失败，请检查网络'); };
      xhr.ontimeout = () => { setIsUploading(false); alert('上传超时，请重试'); };
      xhr.onabort = () => { setIsUploading(false); };
      xhr.open('POST', API_URL + '/api/upload');
      xhr.withCredentials = true;
      xhr.send(formData);
    } catch (err) {
      setIsUploading(false);
      alert('上传失败');
    }
    setConfirmData(null);
  };

  const cancelUpload = () => {
    setShowConfirm(false);
    setConfirmData(null);
  };

  // 坐标转换
  const getCanvasCoords = useCallback((clientX, clientY) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.floor((clientX - rect.left) / scale),
      y: Math.floor((clientY - rect.top) / scale)
    };
  }, [scale]);

  // 画画
  const drawPixel = useCallback((x, y) => {
    if (x < 0 || x >= canvasSize || y < 0 || y >= canvasSize) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const halfSize = Math.floor(brushSize / 2);
    const softHalf = Math.floor((brushSize * brushSoftness) / 200);
    for (let i = -halfSize; i <= halfSize; i++) {
      for (let j = -halfSize; j <= halfSize; j++) {
        const px = x + i;
        const py = y + j;
        if (px >= 0 && px < canvasSize && py >= 0 && py < canvasSize) {
          let alpha = brushOpacity / 100;
          if (softHalf > 0) {
            const dist = Math.sqrt(i * i + j * j);
            const coreDist = halfSize - softHalf;
            if (dist > coreDist) alpha *= Math.max(0, 1 - (dist - coreDist) / softHalf);
          }
          if (alpha > 0) {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = brushColor;
            ctx.fillRect(px, py, 1, 1);
            pendingPixels.current.push({ x: px, y: py, color: brushColor, opacity: Math.round(alpha * 100) });
          }
        }
      }
    }
    ctx.globalAlpha = 1;
    const now = Date.now();
    if (now - lastSaveTime > 500) {
      setLastSaveTime(now);
      flushPixels();
    }
  }, [brushColor, brushSize, brushSoftness, brushOpacity, canvasSize, lastSaveTime]);

  const flushPixels = async () => {
    if (pendingPixels.current.length === 0) return;
    const toSend = [...pendingPixels.current];
    pendingPixels.current = [];
    try {
      await fetch(API_URL + '/api/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pixels: toSend })
      });
    } catch (err) { console.error(err); }
  };

  // 鼠标事件
  const handleMouseDown = (e) => {
    if (e.button === 1 || e.button === 2) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, offsetX: offset.x, offsetY: offset.y };
      return;
    }
    if (e.button !== 0) return;
    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (dragImage) {
      const nx = Math.max(0, Math.min(canvasSize - dragImage.width, coords.x - dragOffset.x));
      const ny = Math.max(0, Math.min(canvasSize - dragImage.height, coords.y - dragOffset.y));
      setImages(prev => prev.map(img => img.id === dragImage.id ? { ...img, x: nx, y: ny } : img));
    } else {
      setIsDrawing(true);
      drawPixel(coords.x, coords.y);
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      setOffset({
        x: panStartRef.current.offsetX + e.clientX - panStartRef.current.x,
        y: panStartRef.current.offsetY + e.clientY - panStartRef.current.y
      });
      return;
    }
    if (!isDrawing && !dragImage) return;
    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (isDrawing) drawPixel(coords.x, coords.y);
    else if (dragImage) {
      const nx = Math.max(0, Math.min(canvasSize - dragImage.width, coords.x - dragOffset.x));
      const ny = Math.max(0, Math.min(canvasSize - dragImage.height, coords.y - dragOffset.y));
      setImages(prev => prev.map(img => img.id === dragImage.id ? { ...img, x: nx, y: ny } : img));
    }
  };

  const handleMouseUp = () => {
    if (isDrawing) flushPixels();
    setIsDrawing(false);
    setIsPanning(false);
    setDragImage(null);
  };

  // 滚轮缩放
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, scale * delta));
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const ratio = newScale / scale;
    setOffset({ x: offset.x - mx * (ratio - 1), y: offset.y - my * (ratio - 1) });
    setScale(newScale);
  };

  // 触屏
  const getTouchDistance = (t1, t2) => Math.sqrt((t1.clientX - t2.clientX) ** 2 + (t1.clientY - t2.clientY) ** 2);
  const getTouchCenter = (t1, t2) => ({ x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 });

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const center = getTouchCenter(t1, t2);
      const rect = canvasRef.current.getBoundingClientRect();
      touchStartRef.current = {
        distance: getTouchDistance(t1, t2),
        scale: scale,
        centerX: center.x - rect.left,
        centerY: center.y - rect.top,
        offsetX: offset.x, offsetY: offset.y, twoFinger: true
      };
      setIsPanning(true);
      setIsDrawing(false);
      setDragImage(null);
    } else if (e.touches.length === 1 && !touchStartRef.current.twoFinger) {
      const coords = getCanvasCoords(e.touches[0].clientX, e.touches[0].clientY);
      if (dragImage) {
        const nx = Math.max(0, Math.min(canvasSize - dragImage.width, coords.x - dragOffset.x));
        const ny = Math.max(0, Math.min(canvasSize - dragImage.height, coords.y - dragOffset.y));
        setImages(prev => prev.map(img => img.id === dragImage.id ? { ...img, x: nx, y: ny } : img));
      } else {
        setIsDrawing(true);
        drawPixel(coords.x, coords.y);
      }
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 || touchStartRef.current.twoFinger) {
      if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const newDist = getTouchDistance(t1, t2);
        const ratio = newDist / touchStartRef.current.distance;
        const newScale = Math.max(0.1, Math.min(5, touchStartRef.current.scale * ratio));
        const center = getTouchCenter(t1, t2);
        const rect = canvasRef.current.getBoundingClientRect();
        const cx = center.x - rect.left;
        const cy = center.y - rect.top;
        const realRatio = newScale / touchStartRef.current.scale;
        const sx = touchStartRef.current.centerX * (1 - realRatio);
        const sy = touchStartRef.current.centerY * (1 - realRatio);
        const dx = cx - touchStartRef.current.centerX;
        const dy = cy - touchStartRef.current.centerY;
        setScale(newScale);
        setOffset({ x: touchStartRef.current.offsetX + sx + dx, y: touchStartRef.current.offsetY + sy + dy });
      }
      return;
    }
    if (!isDrawing && !dragImage) return;
    const coords = getCanvasCoords(e.touches[0].clientX, e.touches[0].clientY);
    if (isDrawing) drawPixel(coords.x, coords.y);
    else if (dragImage) {
      const nx = Math.max(0, Math.min(canvasSize - dragImage.width, coords.x - dragOffset.x));
      const ny = Math.max(0, Math.min(canvasSize - dragImage.height, coords.y - dragOffset.y));
      setImages(prev => prev.map(img => img.id === dragImage.id ? { ...img, x: nx, y: ny } : img));
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length === 0) {
      if (isDrawing) flushPixels();
      setIsDrawing(false);
      setIsPanning(false);
      setDragImage(null);
      touchStartRef.current.twoFinger = false;
    } else if (e.touches.length === 1) {
      touchStartRef.current.twoFinger = false;
      setIsPanning(false);
    }
  };

  // 图片交互
  const handleImageMouseDown = (e, image) => {
    e.stopPropagation(); e.preventDefault();
    if (isAdmin) {
      if (selectedImages.includes(image.id)) setSelectedImages(prev => prev.filter(id => id !== image.id));
      else setSelectedImages(prev => [...prev, image.id]);
      return;
    }
    const coords = getCanvasCoords(e.clientX, e.clientY);
    setDragImage(image);
    setDragOffset({ x: coords.x - image.x, y: coords.y - image.y });
  };

  const handleImageMouseMove = (e, image) => {
    if (!dragImage || dragImage.id !== image.id) return;
    e.stopPropagation(); e.preventDefault();
    const coords = getCanvasCoords(e.clientX, e.clientY);
    const nx = Math.max(0, Math.min(canvasSize - image.width, coords.x - dragOffset.x));
    const ny = Math.max(0, Math.min(canvasSize - image.height, coords.y - dragOffset.y));
    setImages(prev => prev.map(img => img.id === image.id ? { ...img, x: nx, y: ny } : img));
  };

  const handleImageMouseUp = (e) => { e.stopPropagation(); setDragImage(null); };

  const handleImageTouchStart = (e, image) => {
    e.stopPropagation(); e.preventDefault();
    if (isAdmin) {
      if (selectedImages.includes(image.id)) setSelectedImages(prev => prev.filter(id => id !== image.id));
      else setSelectedImages(prev => [...prev, image.id]);
      return;
    }
    const t = e.touches[0];
    const coords = getCanvasCoords(t.clientX, t.clientY);
    setDragImage(image);
    setDragOffset({ x: coords.x - image.x, y: coords.y - image.y });
  };

  const handleImageTouchMove = (e, image) => {
    if (!dragImage || dragImage.id !== image.id) return;
    if (e.touches.length !== 1) return;
    e.stopPropagation(); e.preventDefault();
    const coords = getCanvasCoords(e.touches[0].clientX, e.touches[0].clientY);
    const nx = Math.max(0, Math.min(canvasSize - image.width, coords.x - dragOffset.x));
    const ny = Math.max(0, Math.min(canvasSize - image.height, coords.y - dragOffset.y));
    setImages(prev => prev.map(img => img.id === image.id ? { ...img, x: nx, y: ny } : img));
  };

  const handleImageTouchEnd = (e) => { e.stopPropagation(); setDragImage(null); };

  const copyDouyin = async () => {
    try {
      await navigator.clipboard.writeText('70745340154');
      alert('抖音号已复制：70745340154');
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = '70745340154';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); alert('抖音号已复制：70745340154'); }
      catch (e) { alert('复制失败，请手动复制'); }
      document.body.removeChild(ta);
    }
  };

  const handleDeleteImage = async (imageId) => {
    if (!confirm('确定要删除这张图片吗？')) return;
    try {
      const res = await fetch(API_URL + '/api/images/' + imageId, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) fetchImages();
    } catch (err) { console.error(err); }
  };

  // 管理员功能
  const handleAdminLogin = async () => {
    try {
      const res = await fetch(API_URL + '/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ password: adminPassword })
      });
      const data = await res.json();
      if (data.success) {
        setIsAdmin(true);
        setShowAdminLogin(false);
        setAdminPassword('');
        setAdminError('');
      } else setAdminError(data.error || '密码错误');
    } catch (err) { setAdminError('登录失败'); }
  };

  const handleAdminLogout = async () => {
    await fetch(API_URL + '/api/admin/logout', { credentials: 'include' });
    setIsAdmin(false); setSelectedImages([]);
  };

  const handleDeleteSelected = async () => {
    if (selectedImages.length === 0) return;
    try {
      const res = await fetch(API_URL + '/api/admin/images', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ ids: selectedImages })
      });
      const data = await res.json();
      if (data.success) { fetchImages(); setSelectedImages([]); }
    } catch (err) { console.error(err); }
  };

  const handleDeleteAllImages = async () => {
    if (!confirm('确定要删除所有图片吗？')) return;
    try {
      const res = await fetch(API_URL + '/api/admin/images', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success) { fetchImages(); setSelectedImages([]); }
    } catch (err) { console.error(err); }
  };

  const handleClearCanvas = async () => {
    if (!confirm('确定要清空画布上的所有涂鸦吗？')) return;
    try {
      const res = await fetch(API_URL + '/api/admin/pixels', { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setPixels([]);
        const cv = canvasRef.current;
        if (cv) cv.getContext('2d').clearRect(0, 0, canvasSize, canvasSize);
      }
    } catch (err) { console.error(err); }
  };

  const getImageUrl = (filename) => API_URL + '/uploads/' + filename;
  const resetView = () => { setScale(1); setOffset({ x: 0, y: 0 }); };

  return (
    <div className="relative w-full h-full touch-none select-none" style={{ overflow: 'hidden' }}>
      <div
        ref={containerRef}
        style={{
          width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px), #0a0a1a',
          backgroundSize: '50px 50px'
        }}
      >
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0', width: canvasSize, height: canvasSize, position: 'absolute',
            willChange: 'transform'
          }}
        >
          <div style={{ width: canvasSize, height: canvasSize, background: '#ffffff', position: 'relative' }}>
            <canvas
              ref={canvasRef}
              width={canvasSize}
              height={canvasSize}
              style={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: isPanning ? 'grabbing' : 'crosshair' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onWheel={handleWheel}
              onContextMenu={(e) => e.preventDefault()}
            />

            {images.map(img => (
              <div
                key={img.id}
                style={{
                  position: 'absolute', left: img.x, top: img.y,
                  width: img.width, height: img.height, touchAction: 'none',
                  border: selectedImages.includes(img.id) ? '2px solid #ef4444' : '2px solid transparent',
                  cursor: 'move'
                }}
                onMouseDown={(e) => handleImageMouseDown(e, img)}
                onMouseMove={(e) => handleImageMouseMove(e, img)}
                onMouseUp={handleImageMouseUp}
                onMouseLeave={handleImageMouseUp}
                onTouchStart={(e) => handleImageTouchStart(e, img)}
                onTouchMove={(e) => handleImageTouchMove(e, img)}
                onTouchEnd={handleImageTouchEnd}
                onDoubleClick={(e) => { e.stopPropagation(); handleDeleteImage(img.id); }}
              >
                <img
                  src={getImageUrl(img.filename)}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                  draggable={false}
                />
                <button
                  style={{
                    position: 'absolute', top: -12, right: -12, width: 28, height: 28,
                    background: '#ef4444', color: '#fff', fontSize: 14,
                    borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', zIndex: 10
                  }}
                  onClick={(e) => { e.stopPropagation(); handleDeleteImage(img.id); }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  ✕
                </button>
                {isAdmin && (
                  <div style={{ position: 'absolute', top: 0, left: 0, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11, padding: '2px 4px' }}>
                    {new Date(img.upload_date).toLocaleString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 左上角：上传按钮 */}
      <div style={{ position: 'fixed', top: 16, left: 16, zIndex: 50, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{
          background: 'rgba(0, 212, 255, 0.15)', border: '1px solid rgba(0, 212, 255, 0.4)',
          color: '#00d4ff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14
        }}>
          <label htmlFor="upload-btn">
            {isUploading ? '上传中...' : '📤 上传图片'}
          </label>
          <input
            type="file" accept="image/jpeg,image/png,image/gif"
            onChange={handleImageUpload} style={{ display: 'none' }}
            id="upload-btn" disabled={isUploading}
          />
        </div>
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, background: 'rgba(0,0,0,0.4)', padding: '4px 12px', borderRadius: 8, textAlign: 'center' }}>
          今日剩余: {uploadRemaining}/2
        </div>
        <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 8, padding: 8, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
          <div>缩放: {Math.round(scale * 100)}%</div>
          <button onClick={resetView} style={{ marginTop: 4, width: '100%', padding: '4px 8px', background: 'rgba(0,212,255,0.2)', color: '#00d4ff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
            重置视图
          </button>
        </div>
      </div>

      {/* 右上角：画笔 + 管理 */}
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 50, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 220 }}>
        <div style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 12, padding: 12 }}>
          <h3 style={{ color: '#00d4ff', fontSize: 13, marginBottom: 8 }}>画笔</h3>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>颜色</div>
          <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} style={{ width: '100%', height: 30, borderRadius: 4, marginTop: 2, marginBottom: 8, cursor: 'pointer' }} />
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>粗细: {brushSize}px</div>
          <input type="range" min="1" max="50" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} style={{ width: '100%', marginBottom: 8 }} />
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>硬度: {100 - brushSoftness}%</div>
          <input type="range" min="0" max="100" value={brushSoftness} onChange={(e) => setBrushSoftness(Number(e.target.value))} style={{ width: '100%', marginBottom: 8 }} />
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>透明度: {brushOpacity}%</div>
          <input type="range" min="1" max="100" value={brushOpacity} onChange={(e) => setBrushOpacity(Number(e.target.value))} style={{ width: '100%' }} />
        </div>

        {!isAdmin ? (
          <button style={{
            background: 'rgba(0, 212, 255, 0.15)', border: '1px solid rgba(0, 212, 255, 0.4)',
            color: '#00d4ff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13
          }} onClick={() => setShowAdminLogin(true)}>
            🔑 管理后台
          </button>
        ) : (
          <div style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(239,68,68,0.5)', borderRadius: 12, padding: 12 }}>
            <h3 style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>管理员</h3>
            <button onClick={handleDeleteSelected} style={{ width: '100%', padding: '6px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, cursor: 'pointer', fontSize: 12, marginBottom: 6 }}>
              删除选中 ({selectedImages.length})
            </button>
            <button onClick={handleDeleteAllImages} style={{ width: '100%', padding: '6px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, cursor: 'pointer', fontSize: 12, marginBottom: 6 }}>
              清空图片
            </button>
            <button onClick={handleClearCanvas} style={{ width: '100%', padding: '6px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, cursor: 'pointer', fontSize: 12, marginBottom: 6 }}>
              清空涂鸦
            </button>
            <button onClick={handleAdminLogout} style={{ width: '100%', padding: '6px', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
              退出
            </button>
          </div>
        )}
      </div>

      {/* 左下角：捐款按钮 */}
      <div style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 50 }}>
        <button onClick={() => setShowDonation(true)} style={{
          background: 'rgba(0, 212, 255, 0.15)', border: '1px solid rgba(0, 212, 255, 0.4)',
          color: '#00d4ff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14
        }}>
          💖 支持我们
        </button>
      </div>

      {/* 右下角：操作提示 */}
      <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 50, fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'rgba(0,0,0,0.4)', padding: '4px 8px', borderRadius: 6, maxWidth: 320, textAlign: 'right' }}>
        左键画画 | 中键/右键移动 | 滚轮缩放 | 双击图片删除 | 拖动图片移动 | 手机单指画画/双指移动缩放
      </div>

      {/* 上传进度 */}
      {isUploading && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90 }}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(0,212,255,0.5)', borderRadius: 12, padding: 24, width: 320, textAlign: 'center' }}>
            <h3 style={{ color: '#00d4ff', fontSize: 16, marginBottom: 16 }}>正在上传...</h3>
            <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', borderRadius: 999, height: 12, overflow: 'hidden' }}>
              <div style={{ width: `${uploadProgress}%`, height: '100%', background: '#00d4ff', transition: 'width 0.2s' }} />
            </div>
            <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: 12, fontSize: 13 }}>{uploadProgress}%</p>
          </div>
        </div>
      )}

      {/* 上传成功提示 */}
      {uploadMessage && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 95, background: '#16a34a', color: '#fff', padding: '12px 24px', borderRadius: 12, fontSize: 16, fontWeight: 600 }}>
          {uploadMessage}
        </div>
      )}

      {/* 上传确认弹窗 */}
      {showConfirm && confirmData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={cancelUpload}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#1a1a2e', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 12, padding: 24, textAlign: 'center', maxWidth: 400 }}>
            <h3 style={{ color: '#00d4ff', fontSize: 18, marginBottom: 16 }}>确认上传</h3>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
              <img src={confirmData.preview} alt="预览" style={{
                imageRendering: 'pixelated',
                width: Math.min(200, Math.max(80, confirmData.width * 4)),
                height: 'auto', maxHeight: 200, borderRadius: 8,
                border: '1px solid #555', background: '#fff'
              }} />
            </div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 4 }}>
              尺寸: {confirmData.width} × {confirmData.height} 像素
            </div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 4 }}>
              原大小: {confirmData.origSize} KB → {confirmData.newSize} KB
            </div>
            <div style={{ color: '#00d4ff', fontSize: 12, marginBottom: 20 }}>（已自动缩小到 ≤ 50 × 50 像素以内）</div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={confirmUpload} style={{
                background: 'rgba(0, 212, 255, 0.15)', border: '1px solid rgba(0, 212, 255, 0.4)',
                color: '#00d4ff', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14
              }}>
                ✓ 确认上传
              </button>
              <button onClick={cancelUpload} style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.7)', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14
              }}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 捐款弹窗 - 传奇风格抖音号 */}
      {showDonation && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, overflow: 'hidden' }} onClick={() => setShowDonation(false)}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 50%, rgba(255,200,0,0.15) 0%, rgba(255,100,0,0.05) 40%, transparent 70%)', animation: 'legendPulse 2s ease-in-out infinite' }} />
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'linear-gradient(180deg, #3a1c00 0%, #1a0800 100%)',
            border: '4px solid #ffcc00', borderRadius: 12, padding: '40px 50px', textAlign: 'center',
            boxShadow: '0 0 40px rgba(255,170,0,0.8), 0 0 80px rgba(255,80,0,0.5), inset 0 0 30px rgba(255,200,0,0.1)',
            animation: 'legendShake 0.15s ease-in-out infinite', position: 'relative'
          }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#ffdd44', textShadow: '0 0 10px #ff6600, 2px 2px 0 #660000, 4px 4px 0 #330000', letterSpacing: 4, marginBottom: 20 }}>
              ⚔️ 支持我们 ⚔️
            </div>
            <div style={{ fontSize: 18, color: '#ffaa00', textShadow: '1px 1px 0 #330000', marginBottom: 15, fontWeight: 700 }}>抖音号</div>
            <div style={{
              fontSize: 64, fontWeight: 900, color: '#fff',
              textShadow: '0 0 20px #ffcc00, 0 0 40px #ff6600, 3px 3px 0 #660000, 6px 6px 0 #330000',
              letterSpacing: 6, fontFamily: 'Impact, sans-serif', padding: '15px 30px',
              background: 'linear-gradient(180deg, rgba(255,200,0,0.2) 0%, rgba(255,100,0,0.1) 100%)',
              border: '2px dashed #ffaa00', borderRadius: 8, marginBottom: 25,
              animation: 'legendGlow 1.5s ease-in-out infinite alternate'
            }}>
              70745340154
            </div>
            <button onClick={copyDouyin} style={{
              background: 'linear-gradient(180deg, #ffaa00 0%, #cc5500 100%)',
              color: '#fff', fontSize: 20, fontWeight: 900, padding: '12px 40px',
              border: '3px solid #ffcc00', borderRadius: 8, cursor: 'pointer',
              textShadow: '1px 1px 0 #660000',
              boxShadow: '0 4px 0 #663300, 0 0 20px rgba(255,170,0,0.6)', letterSpacing: 2
            }}>
              📋 一键复制
            </button>
            <div style={{ marginTop: 20, fontSize: 14, color: '#ffaa00', opacity: 0.7 }}>点击空白处关闭</div>
          </div>
        </div>
      )}

      {/* 管理员登录 */}
      {showAdminLogin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 12, padding: 24, width: 320 }}>
            <h3 style={{ color: '#00d4ff', fontSize: 20, marginBottom: 16, textAlign: 'center' }}>管理员登录</h3>
            {adminError && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{adminError}</p>}
            <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="输入管理员密码" onKeyDown={(e) => { if (e.key === 'Enter') handleAdminLogin(); }} style={{
              width: '100%', padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(0,212,255,0.3)',
              borderRadius: 8, color: '#fff', marginBottom: 16, outline: 'none', boxSizing: 'border-box'
            }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleAdminLogin} style={{
                flex: 1, background: 'rgba(0, 212, 255, 0.15)', border: '1px solid rgba(0, 212, 255, 0.4)',
                color: '#00d4ff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14
              }}>登录</button>
              <button onClick={() => setShowAdminLogin(false)} style={{
                flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.7)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14
              }}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
