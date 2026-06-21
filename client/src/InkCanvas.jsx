import { useEffect, useRef, useState } from 'react';

export default function InkCanvas({ onClose }) {
  const wrapperRef = useRef(null);
  const mainCanvasRef = useRef(null);
  const particleCanvasRef = useRef(null);
  const [color, setColor] = useState('#333333');
  const [size, setSize] = useState(15);
  const [opacity, setOpacity] = useState(0.6);
  const colorRef = useRef(color);
  const sizeRef = useRef(size);
  const opacityRef = useRef(opacity);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { sizeRef.current = size; }, [size]);
  useEffect(() => { opacityRef.current = opacity; }, [opacity]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const mainCanvas = mainCanvasRef.current;
    const particleCanvas = particleCanvasRef.current;
    if (!wrapper || !mainCanvas || !particleCanvas) return;

    const ctx = mainCanvas.getContext('2d');
    const pCtx = particleCanvas.getContext('2d');

    // 初始化画布背景（宣纸色）
    ctx.fillStyle = '#faf6ed';
    ctx.fillRect(0, 0, 700, 700);

    // 画布变换状态
    let offsetX = 0;
    let offsetY = 0;
    let scale = 1;
    const minScale = 0.3;
    const maxScale = 3;

    // 绘画状态
    let isDrawing = false;
    let isPanning = false;
    let lastX = 0;
    let lastY = 0;
    let lastTime = 0;

    // 粒子系统
    let particles = [];

    // 屏幕坐标转画布坐标
    const screenToCanvas = (sx, sy) => {
      const rect = wrapper.getBoundingClientRect();
      const x = (sx - rect.left - offsetX) / scale;
      const y = (sy - rect.top - offsetY) / scale;
      return { x, y };
    };

    // 颜色转换
    const hexToRgb = (hex) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return { r, g, b };
    };

    // 水墨笔触绘制
    const drawInkStroke = (x1, y1, x2, y2, speed, currentColor, currentSize, currentOpacity) => {
      const rgb = hexToRgb(currentColor);
      const baseSize = currentSize;
      const baseOpacity = currentOpacity;

      const pressure = Math.max(0.4, Math.min(1, 1 - speed / 15));
      const strokeSize = baseSize * pressure;
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(1, Math.floor(dist / 2));

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = x1 + (x2 - x1) * t;
        const py = y1 + (y2 - y1) * t;

        const layers = 5;
        for (let l = 0; l < layers; l++) {
          const layerSize = strokeSize * (0.6 + l * 0.15);
          const layerAlpha = baseOpacity * (0.15 + l * 0.08) * pressure;
          ctx.beginPath();
          const offsetR = layerSize * 0.15;
          const ox = (Math.random() - 0.5) * offsetR;
          const oy = (Math.random() - 0.5) * offsetR;
          ctx.arc(px + ox, py + oy, layerSize / 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${layerAlpha})`;
          ctx.fill();
        }
      }
    };

    // 生成墨水粒子
    const spawnParticles = (x, y, count, currentColor, currentSize) => {
      const rgb = hexToRgb(currentColor);
      for (let i = 0; i < count; i++) {
        particles.push({
          x: x + (Math.random() - 0.5) * currentSize * 0.8,
          y: y + (Math.random() - 0.5) * currentSize * 0.3,
          vx: (Math.random() - 0.5) * 0.8,
          vy: Math.random() * 1.5 + 0.5,
          size: Math.random() * 2.5 + 0.5,
          alpha: Math.random() * 0.5 + 0.2,
          life: 1,
          decay: 0.008 + Math.random() * 0.012,
          color: rgb
        });
      }
    };

    // 更新并绘制粒子
    const updateParticles = () => {
      pCtx.clearRect(0, 0, 700, 700);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vy += 0.03;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        p.alpha = Math.max(0, p.life * 0.6);
        if (p.life <= 0 || p.y > 720) {
          particles.splice(i, 1);
          continue;
        }
        pCtx.save();
        pCtx.translate(offsetX, offsetY);
        pCtx.scale(scale, scale);
        pCtx.beginPath();
        pCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        pCtx.fillStyle = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${p.alpha})`;
        pCtx.fill();
        pCtx.restore();
      }
      requestAnimationFrame(updateParticles);
    };
    updateParticles();

    // 应用变换
    const applyTransform = () => {
      mainCanvas.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
      mainCanvas.style.transformOrigin = '0 0';
      particleCanvas.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
      particleCanvas.style.transformOrigin = '0 0';
    };

    // 鼠标事件
    const onMouseDown = (e) => {
      const pos = screenToCanvas(e.clientX, e.clientY);
      if (e.button === 1) {
        isPanning = true;
        lastX = e.clientX;
        lastY = e.clientY;
        e.preventDefault();
      } else if (e.button === 0) {
        isDrawing = true;
        lastX = pos.x;
        lastY = pos.y;
        lastTime = Date.now();
        drawInkStroke(pos.x, pos.y, pos.x, pos.y, 0, colorRef.current, sizeRef.current, opacityRef.current);
        spawnParticles(pos.x, pos.y, 3, colorRef.current, sizeRef.current);
      }
    };

    const onMouseMove = (e) => {
      if (isPanning) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        offsetX += dx;
        offsetY += dy;
        lastX = e.clientX;
        lastY = e.clientY;
        applyTransform();
      } else if (isDrawing) {
        const pos = screenToCanvas(e.clientX, e.clientY);
        const now = Date.now();
        const dt = now - lastTime;
        const dist = Math.hypot(pos.x - lastX, pos.y - lastY);
        const speed = dist / (dt / 16);
        drawInkStroke(lastX, lastY, pos.x, pos.y, speed, colorRef.current, sizeRef.current, opacityRef.current);
        const particleCount = Math.min(5, Math.floor(speed * 0.5) + 1);
        spawnParticles(pos.x, pos.y, particleCount, colorRef.current, sizeRef.current);
        lastX = pos.x;
        lastY = pos.y;
        lastTime = now;
      }
    };

    const onMouseUp = (e) => {
      if (e.button === 1) isPanning = false;
      if (e.button === 0) isDrawing = false;
    };

    const onWheel = (e) => {
      e.preventDefault();
      const rect = wrapper.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(minScale, Math.min(maxScale, scale * zoomFactor));
      offsetX = mouseX - (mouseX - offsetX) * (newScale / scale);
      offsetY = mouseY - (mouseY - offsetY) * (newScale / scale);
      scale = newScale;
      applyTransform();
    };

    // 触摸事件
    let touchStartDist = 0;
    let touchStartScale = 1;
    let touchStartOffsetX = 0;
    let touchStartOffsetY = 0;
    let lastTouchX = 0;
    let lastTouchY = 0;
    let lastTouchTime = 0;

    const onTouchStart = (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const pos = screenToCanvas(touch.clientX, touch.clientY);
        isDrawing = true;
        lastTouchX = pos.x;
        lastTouchY = pos.y;
        lastTouchTime = Date.now();
        drawInkStroke(pos.x, pos.y, pos.x, pos.y, 0, colorRef.current, sizeRef.current, opacityRef.current);
        spawnParticles(pos.x, pos.y, 3, colorRef.current, sizeRef.current);
      } else if (e.touches.length === 2) {
        isDrawing = false;
        isPanning = true;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        touchStartDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        touchStartScale = scale;
        touchStartOffsetX = offsetX;
        touchStartOffsetY = offsetY;
        lastX = (t1.clientX + t2.clientX) / 2;
        lastY = (t1.clientY + t2.clientY) / 2;
      }
    };

    const onTouchMove = (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && isDrawing) {
        const touch = e.touches[0];
        const pos = screenToCanvas(touch.clientX, touch.clientY);
        const now = Date.now();
        const dt = now - lastTouchTime;
        const dist = Math.hypot(pos.x - lastTouchX, pos.y - lastTouchY);
        const speed = dist / (dt / 16);
        drawInkStroke(lastTouchX, lastTouchY, pos.x, pos.y, speed, colorRef.current, sizeRef.current, opacityRef.current);
        const particleCount = Math.min(5, Math.floor(speed * 0.5) + 1);
        spawnParticles(pos.x, pos.y, particleCount, colorRef.current, sizeRef.current);
        lastTouchX = pos.x;
        lastTouchY = pos.y;
        lastTouchTime = now;
      } else if (e.touches.length === 2 && isPanning) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const scaleRatio = currentDist / touchStartDist;
        const newScale = Math.max(minScale, Math.min(maxScale, touchStartScale * scaleRatio));
        const centerX = (t1.clientX + t2.clientX) / 2;
        const centerY = (t1.clientY + t2.clientY) / 2;
        const rect = wrapper.getBoundingClientRect();
        const cx = centerX - rect.left;
        const cy = centerY - rect.top;
        offsetX = cx - (cx - touchStartOffsetX) * (newScale / touchStartScale);
        offsetY = cy - (cy - touchStartOffsetY) * (newScale / touchStartScale);
        scale = newScale;
        const dx = centerX - lastX;
        const dy = centerY - lastY;
        offsetX += dx;
        offsetY += dy;
        lastX = centerX;
        lastY = centerY;
        touchStartDist = currentDist;
        touchStartScale = scale;
        touchStartOffsetX = offsetX;
        touchStartOffsetY = offsetY;
        applyTransform();
      }
    };

    const onTouchEnd = (e) => {
      if (e.touches.length === 0) {
        isDrawing = false;
        isPanning = false;
      } else if (e.touches.length === 1) {
        isPanning = false;
        const touch = e.touches[0];
        const pos = screenToCanvas(touch.clientX, touch.clientY);
        lastTouchX = pos.x;
        lastTouchY = pos.y;
        lastTouchTime = Date.now();
        isDrawing = true;
      }
    };

    const onContextMenu = (e) => e.preventDefault();

    wrapper.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    wrapper.addEventListener('wheel', onWheel);
    wrapper.addEventListener('touchstart', onTouchStart, { passive: false });
    wrapper.addEventListener('touchmove', onTouchMove, { passive: false });
    wrapper.addEventListener('touchend', onTouchEnd);
    wrapper.addEventListener('contextmenu', onContextMenu);

    applyTransform();

    return () => {
      wrapper.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      wrapper.removeEventListener('wheel', onWheel);
      wrapper.removeEventListener('touchstart', onTouchStart);
      wrapper.removeEventListener('touchmove', onTouchMove);
      wrapper.removeEventListener('touchend', onTouchEnd);
      wrapper.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  const clearCanvas = () => {
    const ctx = mainCanvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#faf6ed';
      ctx.fillRect(0, 0, 700, 700);
      ctx.restore();
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#f5f0e6',
      fontFamily: '"Microsoft YaHei", sans-serif',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: 20, touchAction: 'none'
    }}>
      {/* 返回按钮 */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 15, left: 15,
          padding: '8px 16px',
          background: '#fff', border: '1px solid #ccc',
          borderRadius: 4, cursor: 'pointer',
          fontSize: 14, color: '#333',
          zIndex: 100
        }}
      >
        ← 返回画布
      </button>

      <h1 style={{ color: '#333', marginBottom: 15, fontWeight: 'normal', letterSpacing: 4 }}>
        水墨丹青
      </h1>

      {/* 控制面板 */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 15,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 15, padding: '12px 20px',
        background: '#fff', borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#555' }}>
          <span>颜色</span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ width: 36, height: 30, border: 'none', background: 'none', cursor: 'pointer' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#555' }}>
          <span>笔刷</span>
          <input
            type="range"
            min="5" max="40"
            value={size}
            onChange={(e) => setSize(parseInt(e.target.value))}
            style={{ width: 100 }}
          />
          <span>{size}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#555' }}>
          <span>浓度</span>
          <input
            type="range"
            min="0.1" max="1" step="0.1"
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            style={{ width: 100 }}
          />
          <span>{opacity.toFixed(1)}</span>
        </div>
        <button
          onClick={clearCanvas}
          style={{
            padding: '6px 14px', border: '1px solid #ccc',
            background: '#fff', borderRadius: 4, cursor: 'pointer',
            fontSize: 14, color: '#333'
          }}
        >
          清空
        </button>
      </div>

      {/* 画布 */}
      <div
        ref={wrapperRef}
        style={{
          position: 'relative', width: 700, height: 700,
          overflow: 'hidden', border: '2px solid #d0c8b8',
          background: '#faf6ed', borderRadius: 4,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          cursor: 'crosshair',
          maxWidth: '95vw', maxHeight: '95vw'
        }}
      >
        <canvas
          ref={mainCanvasRef}
          id="mainCanvas"
          width={700}
          height={700}
          style={{ position: 'absolute', top: 0, left: 0 }}
        />
        <canvas
          ref={particleCanvasRef}
          id="particleCanvas"
          width={700}
          height={700}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        />
      </div>

      {/* 提示 */}
      <div style={{ marginTop: 12, fontSize: 12, color: '#888', textAlign: 'center', lineHeight: 1.6 }}>
        电脑：左键绘画 · 中键拖动画布 · 滚轮缩放<br />
        手机：单指绘画 · 双指缩放与移动画布
      </div>
    </div>
  );
}