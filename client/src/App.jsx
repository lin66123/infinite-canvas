import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const API_URL = 'https://infinite-canvas-production-b078.up.railway.app';

function App() {
  const [images, setImages] = useState([]);
  const [pixels, setPixels] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(3);
  const [brushSoftness, setBrushSoftness] = useState(0);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [uploadRemaining, setUploadRemaining] = useState(2);
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

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const pendingPixels = useRef([]);
  const canvasSize = 5000;
  const panStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const touchStartRef = useRef({ distance: 0, scale: 1, centerX: 0, centerY: 0, offsetX: 0, offsetY: 0, twoFinger: false });

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

  const fetchImages = async () => {
    try {
      const res = await fetch(`${API_URL}/api/images`);
      const data = await res.json();
      setImages(data);
    } catch (err) {
      console.error('Failed to fetch images:', err);
    }
  };

  const fetchPixels = async () => {
    try {
      const res = await fetch(`${API_URL}/api/pixels`);
      const data = await res.json();
      setPixels(data);
    } catch (err) {
      console.error('Failed to fetch pixels:', err);
    }
  };

  const fetchUploadStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/upload/status`, { credentials: 'include' });
      const data = await res.json();
      setUploadRemaining(data.remaining);
    } catch (err) {
      console.error('Failed to fetch upload status:', err);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('图片大小不能超过2MB');
      return;
    }
    if (uploadRemaining <= 0) {
      alert('今日上传次数已用完');
      return;
    }
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        fetchImages();
        fetchUploadStatus();
        alert('上传成功');
      } else {
        alert(data.error || '上传失败');
      }
    } catch (err) {
      console.error('Upload failed:', err);
      alert('上传失败');
    }
  };

  const getCanvasCoords = useCallback((clientX, clientY) => {
    if (!canvasRef.current || !containerRef.current) return { x: 0, y: 0 };
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const relX = (clientX - canvasRect.left) / scale;
    const relY = (clientY - canvasRect.top) / scale;
    return { x: Math.floor(relX), y: Math.floor(relY) };
  }, [scale]);

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
            const distFromCenter = Math.sqrt(i * i + j * j);
            const coreDist = halfSize - softHalf;
            if (distFromCenter > coreDist) {
              const softness = 1 - (distFromCenter - coreDist) / softHalf;
              alpha *= Math.max(0, softness);
            }
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

  const handleMouseDown = (e) => {
    e.preventDefault();

    if (e.button === 1 || e.button === 2) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, offsetX: offset.x, offsetY: offset.y };
      return;
    }

    if (e.button !== 0) return;

    const coords = getCanvasCoords(e.clientX, e.clientY);
    const x = coords.x;
    const y = coords.y;

    if (dragImage) {
      const newX = Math.max(0, Math.min(canvasSize - dragImage.width, x - dragOffset.x));
      const newY = Math.max(0, Math.min(canvasSize - dragImage.height, y - dragOffset.y));
      setImages(prev => prev.map(img =>
        img.id === dragImage.id ? { ...img, x: newX, y: newY } : img
      ));
    } else {
      setIsDrawing(true);
      drawPixel(x, y);
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setOffset({ x: panStartRef.current.offsetX + dx, y: panStartRef.current.offsetY + dy });
      return;
    }

    if (!isDrawing && !dragImage) return;

    const coords = getCanvasCoords(e.clientX, e.clientY);
    const x = coords.x;
    const y = coords.y;

    if (isDrawing) {
      drawPixel(x, y);
    } else if (dragImage) {
      const newX = Math.max(0, Math.min(canvasSize - dragImage.width, x - dragOffset.x));
      const newY = Math.max(0, Math.min(canvasSize - dragImage.height, y - dragOffset.y));
      setImages(prev => prev.map(img =>
        img.id === dragImage.id ? { ...img, x: newX, y: newY } : img
      ));
    }
  };

  const handleMouseUp = () => {
    if (isDrawing) {
      flushPixels();
    }
    setIsDrawing(false);
    setIsPanning(false);
    setDragImage(null);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, scale * delta));

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - canvasRect.left;
    const mouseY = e.clientY - canvasRect.top;

    const scaleRatio = newScale / scale;
    const newOffsetX = offset.x - mouseX * (scaleRatio - 1);
    const newOffsetY = offset.y - mouseY * (scaleRatio - 1);

    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  const getTouchDistance = (t1, t2) => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchCenter = (t1, t2) => {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2
    };
  };

  const handleTouchStart = (e) => {
    e.preventDefault();

    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const center = getTouchCenter(t1, t2);
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const centerX = center.x - canvasRect.left;
      const centerY = center.y - canvasRect.top;
      touchStartRef.current = {
        distance: getTouchDistance(t1, t2),
        scale: scale,
        centerX,
        centerY,
        offsetX: offset.x,
        offsetY: offset.y,
        twoFinger: true
      };
      setIsPanning(true);
      setIsDrawing(false);
    } else if (e.touches.length === 1 && !touchStartRef.current.twoFinger) {
      const touch = e.touches[0];
      const coords = getCanvasCoords(touch.clientX, touch.clientY);
      const x = coords.x;
      const y = coords.y;

      if (dragImage) {
        const newX = Math.max(0, Math.min(canvasSize - dragImage.width, x - dragOffset.x));
        const newY = Math.max(0, Math.min(canvasSize - dragImage.height, y - dragOffset.y));
        setImages(prev => prev.map(img =>
          img.id === dragImage.id ? { ...img, x: newX, y: newY } : img
        ));
      } else {
        setIsDrawing(true);
        drawPixel(x, y);
      }
    }
  };

  const handleTouchMove = (e) => {
    e.preventDefault();

    if (e.touches.length === 2 || touchStartRef.current.twoFinger) {
      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const newDistance = getTouchDistance(t1, t2);
        const scaleRatio = newDistance / touchStartRef.current.distance;
        const newScale = Math.max(0.1, Math.min(5, touchStartRef.current.scale * scaleRatio));

        const newCenter = getTouchCenter(t1, t2);
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const curCenterX = newCenter.x - canvasRect.left;
        const curCenterY = newCenter.y - canvasRect.top;

        const realScaleRatio = newScale / touchStartRef.current.scale;
        const scaleOffsetX = touchStartRef.current.centerX * (1 - realScaleRatio);
        const scaleOffsetY = touchStartRef.current.centerY * (1 - realScaleRatio);

        const dx = curCenterX - touchStartRef.current.centerX;
        const dy = curCenterY - touchStartRef.current.centerY;

        setScale(newScale);
        setOffset({
          x: touchStartRef.current.offsetX + scaleOffsetX + dx,
          y: touchStartRef.current.offsetY + scaleOffsetY + dy
        });
      }
      return;
    }

    if (!isDrawing && !dragImage) return;

    const touch = e.touches[0];
    const coords = getCanvasCoords(touch.clientX, touch.clientY);
    const x = coords.x;
    const y = coords.y;

    if (isDrawing) {
      drawPixel(x, y);
    } else if (dragImage) {
      const newX = Math.max(0, Math.min(canvasSize - dragImage.width, x - dragOffset.x));
      const newY = Math.max(0, Math.min(canvasSize - dragImage.height, y - dragOffset.y));
      setImages(prev => prev.map(img =>
        img.id === dragImage.id ? { ...img, x: newX, y: newY } : img
      ));
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length === 0) {
      if (isDrawing) {
        flushPixels();
      }
      setIsDrawing(false);
      setIsPanning(false);
      setDragImage(null);
      touchStartRef.current.twoFinger = false;
    } else if (e.touches.length === 1) {
      touchStartRef.current.twoFinger = false;
      setIsPanning(false);
    }
  };

  const flushPixels = async () => {
    if (pendingPixels.current.length === 0) return;
    const pixelsToSend = [...pendingPixels.current];
    pendingPixels.current = [];
    try {
      await fetch(`${API_URL}/api/draw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pixels: pixelsToSend })
      });
    } catch (err) {
      console.error('Failed to save pixels:', err);
    }
  };

  const handleImageClick = (e, image) => {
    e.stopPropagation();
    if (isAdmin) {
      if (selectedImages.includes(image.id)) {
        setSelectedImages(prev => prev.filter(id => id !== image.id));
      } else {
        setSelectedImages(prev => [...prev, image.id]);
      }
    } else {
      let clientX, clientY;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      const { x, y } = getCanvasCoords(clientX, clientY);
      setDragImage(image);
      setDragOffset({ x: x - image.x, y: y - image.y });
    }
  };

  const handleAdminLogin = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: adminPassword })
      });
      const data = await res.json();
      if (data.success) {
        setIsAdmin(true);
        setShowAdminLogin(false);
        setAdminPassword('');
        setAdminError('');
      } else {
        setAdminError(data.error || '密码错误');
      }
    } catch (err) {
      setAdminError('登录失败');
    }
  };

  const handleAdminLogout = async () => {
    await fetch(`${API_URL}/api/admin/logout`, { credentials: 'include' });
    setIsAdmin(false);
    setSelectedImages([]);
  };

  const handleDeleteSelected = async () => {
    if (selectedImages.length === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/images`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: selectedImages })
      });
      const data = await res.json();
      if (data.success) {
        fetchImages();
        setSelectedImages([]);
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleDeleteAllImages = async () => {
    if (!confirm('确定要删除所有图片吗？')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/images`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success) {
        fetchImages();
        setSelectedImages([]);
      }
    } catch (err) {
      console.error('Delete all failed:', err);
    }
  };

  const handleClearCanvas = async () => {
    if (!confirm('确定要清空画布上的所有涂鸦吗？')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/pixels`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setPixels([]);
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvasSize, canvasSize);
        }
      }
    } catch (err) {
      console.error('Clear canvas failed:', err);
    }
  };

  const getImageUrl = (filename) => `${API_URL}/uploads/${filename}`;

  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="relative w-full h-full touch-none select-none" style={{ overflow: 'hidden' }}>
      <div
        ref={containerRef}
        className="canvas-container"
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(rgba(0, 212, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 212, 255, 0.03) 1px, transparent 1px), #0a0a1a',
          backgroundSize: '50px 50px'
        }}
      >
        <div
          className="absolute"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            width: canvasSize,
            height: canvasSize,
            willChange: 'transform'
          }}
        >
          <div
            className="relative"
            style={{
              width: canvasSize,
              height: canvasSize,
              background: '#ffffff'
            }}
          >
            <canvas
              ref={canvasRef}
              width={canvasSize}
              height={canvasSize}
              className="absolute inset-0"
              style={{ touchAction: 'none', cursor: isPanning ? 'grabbing' : 'crosshair' }}
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
                className={`absolute cursor-move border-2 transition-all ${
                  selectedImages.includes(img.id) ? 'border-red-500' : 'border-transparent hover:border-tech-blue/50'
                }`}
                style={{
                  left: img.x,
                  top: img.y,
                  width: img.width,
                  height: img.height,
                  touchAction: 'none'
                }}
                onMouseDown={(e) => handleImageClick(e, img)}
                onTouchStart={(e) => handleImageClick(e, img)}
              >
                <img
                  src={getImageUrl(img.filename)}
                  alt=""
                  className="w-full h-full object-contain pointer-events-none"
                  draggable={false}
                />
                {isAdmin && (
                  <div className="absolute top-0 left-0 bg-tech-dark/80 text-white text-xs px-1">
                    {new Date(img.upload_date).toLocaleString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="fixed top-4 left-4 z-50 flex flex-col gap-2">
        <div className="tech-button flex items-center gap-2">
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif"
            onChange={handleImageUpload}
            className="hidden"
            id="upload-btn"
          />
          <label htmlFor="upload-btn">📤 上传图片</label>
        </div>
        <span className="text-white/70 text-sm bg-tech-dark/50 px-3 py-1 rounded">
          今日剩余: {uploadRemaining}/2
        </span>
        <div className="bg-tech-dark/70 backdrop-blur-md border border-tech-blue/30 rounded-xl p-2 text-xs text-white/70">
          <div>缩放: {Math.round(scale * 100)}%</div>
          <button
            onClick={resetView}
            className="mt-1 w-full px-2 py-1 bg-tech-blue/20 hover:bg-tech-blue/40 rounded text-tech-blue transition-colors"
          >
            重置视图
          </button>
        </div>
      </div>

      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-[220px]">
        <div className="bg-tech-dark/90 backdrop-blur-md border border-tech-blue/30 rounded-xl p-3">
          <h3 className="text-tech-blue font-semibold mb-2 text-sm">画笔</h3>
          <div className="flex flex-col gap-2">
            <div>
              <label className="text-white/70 text-xs block mb-1">颜色</label>
              <input
                type="color"
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
                className="w-full h-8 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="text-white/70 text-xs block mb-1">粗细: {brushSize}px</label>
              <input
                type="range"
                min="1"
                max="50"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-white/70 text-xs block mb-1">硬度: {100 - brushSoftness}%</label>
              <input
                type="range"
                min="0"
                max="100"
                value={brushSoftness}
                onChange={(e) => setBrushSoftness(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-white/70 text-xs block mb-1">透明度: {brushOpacity}%</label>
              <input
                type="range"
                min="1"
                max="100"
                value={brushOpacity}
                onChange={(e) => setBrushOpacity(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {!isAdmin ? (
          <button className="tech-button text-sm" onClick={() => setShowAdminLogin(true)}>
            🔑 管理后台
          </button>
        ) : (
          <div className="bg-tech-dark/90 backdrop-blur-md border border-red-500/50 rounded-xl p-3">
            <h3 className="text-red-400 font-semibold mb-2 text-sm">管理员</h3>
            <div className="space-y-2">
              <button className="w-full tech-button text-red-400 text-xs" onClick={handleDeleteSelected}>
                删除选中 ({selectedImages.length})
              </button>
              <button className="w-full tech-button text-red-400 text-xs" onClick={handleDeleteAllImages}>
                清空图片
              </button>
              <button className="w-full tech-button text-red-400 text-xs" onClick={handleClearCanvas}>
                清空涂鸦
              </button>
              <button className="w-full tech-button text-white/70 text-xs" onClick={handleAdminLogout}>
                退出
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-4 left-4 z-50">
        <button
          className="tech-button flex items-center gap-2"
          onClick={() => setShowDonation(true)}
        >
          💖 支持我们
        </button>
      </div>

      <div className="fixed bottom-4 right-4 z-50 text-xs text-white/40 bg-tech-dark/50 px-2 py-1 rounded">
        左键画画 | 中键/右键移动 | 滚轮缩放 | 手机单指画画/双指移动缩放
      </div>

      {showDonation && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]"
          onClick={() => setShowDonation(false)}
        >
          <div
            className="bg-tech-dark border border-tech-blue/30 rounded-xl p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-tech-blue font-semibold text-lg mb-3">💖 支持我们</h3>
            <p className="text-white/70 text-sm mb-4">感谢您的支持！</p>
            <img
              src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=QR%20code%20wechat%20pay%20donation%20tech%20style%20dark%20background&image_size=square"
              alt="捐款二维码"
              className="w-48 h-48 rounded-lg mx-auto mb-4"
            />
            <button
              className="tech-button"
              onClick={() => setShowDonation(false)}
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {showAdminLogin && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]">
          <div className="bg-tech-dark border border-tech-blue/30 rounded-xl p-6 w-80">
            <h3 className="text-tech-blue font-semibold text-xl mb-4 text-center">管理员登录</h3>
            {adminError && <p className="text-red-400 text-sm mb-3">{adminError}</p>}
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="输入管理员密码"
              className="w-full px-4 py-2 bg-white/10 border border-tech-blue/30 rounded-lg text-white mb-4 focus:outline-none focus:border-tech-blue"
            />
            <div className="flex gap-2">
              <button className="flex-1 tech-button" onClick={handleAdminLogin}>登录</button>
              <button className="flex-1 tech-button text-white/70" onClick={() => setShowAdminLogin(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
