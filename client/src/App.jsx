import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

// API 地址：默认使用当前页面域名（部署到Railway即Railway，部署到本地即本地）
// 也可以通过 ?api=xxx 临时指定（例如开发测试时）
function getApiUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('api');
    if (fromUrl) return fromUrl.replace(/\/$/, '');
  } catch (e) {}
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:3001';
    }
    return window.location.origin;
  }
  return 'http://localhost:3001';
}
const API_URL = getApiUrl();

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
  const [isDragOver, setIsDragOver] = useState(false);
  const [stampMode, setStampMode] = useState(null);
  const [stampCursor, setStampCursor] = useState({ x: 1000, y: 1000 });

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

  // ESC 键退出盖章模式
  useEffect(() => {
    if (!stampMode) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setStampMode(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stampMode]);

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

  // 通用：将图片文件处理成像素化数据
  const processImageFile = async (file) => {
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

    // 计算目标尺寸（保持比例，最大80像素）
    const maxPx = 80;
    let tw = imgInfo.width;
    let th = imgInfo.height;
    if (tw > maxPx || th > maxPx) {
      const s = Math.min(maxPx / tw, maxPx / th);
      tw = Math.max(1, Math.floor(tw * s));
      th = Math.max(1, Math.floor(th * s));
    }

    // 绘制到小 canvas
    const cv = document.createElement('canvas');
    cv.width = tw;
    cv.height = th;
    const cctx = cv.getContext('2d');
    const srcImg = new Image();
    srcImg.src = imgInfo.dataURL;
    await new Promise((res) => { srcImg.onload = res; srcImg.onerror = res; });
    cctx.drawImage(srcImg, 0, 0, tw, th);
    const smallDataURL = cv.toDataURL('image/jpeg', 0.8);

    // 从 canvas 提取每个像素的颜色（相对坐标）
    const imgData = cctx.getImageData(0, 0, tw, th);
    const pixels = [];
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const idx = (y * tw + x) * 4;
        const r = imgData.data[idx];
        const g = imgData.data[idx + 1];
        const b = imgData.data[idx + 2];
        const a = imgData.data[idx + 3];
        // 跳过接近白色或完全透明的像素（减少数据量）
        if (a < 50) continue;
        if (r > 250 && g > 250 && b > 250) continue;
        const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        pixels.push({ x, y, color: hex });
      }
    }

    const bytes = atob(smallDataURL.split(',')[1]);
    const blobSize = (bytes.length / 1024).toFixed(1);

    return {
      pixels,
      width: tw,
      height: th,
      preview: smallDataURL,
      origSize: (file.size / 1024).toFixed(1),
      newSize: blobSize,
    };
  };

  // 图片上传：像素化 -> 确认预览 -> 盖章模式
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert('图片大小不能超过10MB'); return; }
    if (uploadRemaining <= 0) { alert('今日上传次数已用完'); return; }
    e.target.value = '';

    const data = await processImageFile(file);
    setConfirmData(data);
    setShowConfirm(true);
  };

  // 确认上传 -> 进入盖章模式
  const confirmUpload = () => {
    if (!confirmData) return;
    setShowConfirm(false);
    setStampMode({
      pixels: confirmData.pixels,
      width: confirmData.width,
      height: confirmData.height,
    });
    setConfirmData(null);
    if (uploadRemaining > 0) {
      setUploadRemaining(uploadRemaining - 1);
    }
  };

  const cancelUpload = () => {
    setShowConfirm(false);
    setConfirmData(null);
  };

  // 拖拽上传 - 处理拖入
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  // 拖拽上传 - 处理拖离
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  // 拖拽上传 - 处理放下
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    if (uploadRemaining <= 0) { alert('今日上传次数已用完'); return; }

    const file = files[0];
    if (!file.type.startsWith('image/')) { alert('请拖入图片文件'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('图片大小不能超过10MB'); return; }

    const data = await processImageFile(file);
    setConfirmData(data);
    setShowConfirm(true);
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
    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (stampMode) {
      // 盖章模式：点击落下像素
      stampAt(coords.x, coords.y);
      return;
    }
    if (e.button === 1 || e.button === 2) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, offsetX: offset.x, offsetY: offset.y };
      return;
    }
    if (e.button !== 0) return;
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
    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (stampMode) {
      setStampCursor({ x: coords.x, y: coords.y });
      return;
    }
    if (isPanning) {
      setOffset({
        x: panStartRef.current.offsetX + e.clientX - panStartRef.current.x,
        y: panStartRef.current.offsetY + e.clientY - panStartRef.current.y
      });
      return;
    }
    if (!isDrawing && !dragImage) return;
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

  // 在画布上盖章 -> 画像素 + 上传服务器
  const stampAt = useCallback(async (cx, cy) => {
    if (!stampMode) return;
    const { pixels, width, height } = stampMode;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const startX = cx - Math.floor(width / 2);
    const startY = cy - Math.floor(height / 2);
    const toSend = [];

    for (const p of pixels) {
      const px = startX + p.x;
      const py = startY + p.y;
      if (px >= 0 && px < canvasSize && py >= 0 && py < canvasSize) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = p.color;
        ctx.fillRect(px, py, 1, 1);
        toSend.push({ x: px, y: py, color: p.color });
      }
    }

    // 发送到服务器（带每日上传限额检查）
    if (toSend.length > 0) {
      try {
        const resp = await fetch(API_URL + '/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pixels: toSend }),
        });
        const data = await resp.json();
        if (!data.success) {
          alert('上传失败: ' + (data.error || '未知错误'));
        }
      } catch (err) { console.error(err); }
    }

    setStampMode(null);
    fetchUploadStatus();
    setUploadMessage('盖章成功！');
    setTimeout(() => setUploadMessage(''), 2000);
  }, [stampMode, canvasSize]);

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
    const coords = getCanvasCoords(e.touches[0].clientX, e.touches[0].clientY);
    if (stampMode) {
      stampAt(coords.x, coords.y);
      return;
    }
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
    const coords = getCanvasCoords(e.touches[0].clientX, e.touches[0].clientY);
    if (stampMode) {
      setStampCursor({ x: coords.x, y: coords.y });
      return;
    }
    if (!isDrawing && !dragImage) return;
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
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
          background: isDragOver
            ? 'rgba(0, 212, 255, 0.15)'
            : 'linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px), #0a0a1a',
          backgroundSize: '50px 50px',
          border: isDragOver ? '3px dashed #00d4ff' : '3px solid transparent',
          transition: 'all 0.2s'
        }}
      >
        {isDragOver && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)', pointerEvents: 'none'
          }}>
            <div style={{
              background: 'rgba(0,212,255,0.2)', border: '2px dashed #00d4ff',
              borderRadius: 16, padding: '24px 40px', textAlign: 'center'
            }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>📥</div>
              <div style={{ color: '#00d4ff', fontSize: 18, fontWeight: 600 }}>松开以上传图片</div>
            </div>
          </div>
        )}
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
              style={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: stampMode ? 'copy' : (isPanning ? 'grabbing' : 'crosshair') }}
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

            {stampMode && (
              <div style={{
                position: 'absolute',
                left: stampCursor.x - Math.floor(stampMode.width / 2),
                top: stampCursor.y - Math.floor(stampMode.height / 2),
                width: stampMode.width,
                height: stampMode.height,
                pointerEvents: 'none',
                opacity: 0.75,
                imageRendering: 'pixelated',
              }}>
                {stampMode.pixels.map((p, i) => (
                  <div key={i} style={{
                    position: 'absolute',
                    left: p.x, top: p.y,
                    width: 1, height: 1,
                    background: p.color,
                  }} />
                ))}
              </div>
            )}

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
        {stampMode ? '🖱 点击画布任意位置盖章 | ESC 取消' : '左键画画 | 中键/右键移动 | 滚轮缩放 | 双击图片删除 | 拖动图片移动 | 手机单指画画/双指移动缩放'}
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
            <h3 style={{ color: '#00d4ff', fontSize: 18, marginBottom: 16 }}>将图片变为像素印章</h3>
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
            <div style={{ color: '#00d4ff', fontSize: 12, marginBottom: 20 }}>点击画布上的任意位置盖章</div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={confirmUpload} style={{
                background: 'rgba(0, 212, 255, 0.15)', border: '1px solid rgba(0,212,255,0.4)',
                color: '#00d4ff', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14
              }}>
                ✓ 进入盖章模式
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
