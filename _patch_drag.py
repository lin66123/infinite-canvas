import re

with open('/workspace/client/src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. 添加 isDragOver state
old_state = "  const [showConfirm, setShowConfirm] = useState(false);\n  const [confirmData, setConfirmData] = useState(null);"
new_state = "  const [showConfirm, setShowConfirm] = useState(false);\n  const [confirmData, setConfirmData] = useState(null);\n  const [isDragOver, setIsDragOver] = useState(false);"
content = content.replace(old_state, new_state, 1)

# 2. 添加拖拽处理函数 - 找到 cancelUpload 函数之后添加
old_func = "  const cancelUpload = () => {\n    setShowConfirm(false);\n    setConfirmData(null);\n  };"
new_func = """  const cancelUpload = () => {
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
  };"""
content = content.replace(old_func, new_func, 1)

# 3. 给容器 div 添加拖拽事件
old_container = """      <div
        ref={containerRef}
        style={{
          width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px), #0a0a1a',
          backgroundSize: '50px 50px'
        }}
      >"""
new_container = """      <div
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
        )}"""
content = content.replace(old_container, new_container, 1)

with open('/workspace/client/src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('OK')
