import { useEffect, useRef } from 'react';

const AGREE_KEY = 'canvas_warn_agree_hour';

export default function WarningPage({ onAgree }) {
  const canvasRef = useRef(null);
  const inkDropsRef = useRef([]);
  const lastXYRef = useRef({ x: 0, y: 0 });
  const fishesRef = useRef([]);
  const animRef = useRef(null);

  // 生成游鱼（最多6条）
  const createFish = (canvas) => {
    if (fishesRef.current.length >= 6) return;
    const direction = Math.random() > 0.5 ? 1 : -1;
    const size = 18 + Math.random() * 22;
    fishesRef.current.push({
      x: direction === 1 ? -size * 2 : canvas.width + size * 2,
      y: Math.random() * canvas.height,
      speed: 0.6 + Math.random() * 1,
      size,
      direction,
      opacity: 0.5,
      color: ['#2c2c2c', '#3a3a3a', '#4a4a4a'][Math.floor(Math.random() * 3)],
      wobble: Math.random() * Math.PI * 2
    });
  };

  // 绘制单条游鱼
  const drawFish = (ctx, fish) => {
    ctx.save();
    ctx.globalAlpha = fish.opacity;
    ctx.translate(fish.x, fish.y);
    ctx.scale(fish.direction, 1);
    const s = fish.size;
    ctx.shadowBlur = 8;
    ctx.shadowColor = fish.color;
    ctx.fillStyle = fish.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, s, s * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.lineTo(-s * 1.7, -s * 0.45);
    ctx.lineTo(-s * 1.7, s * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  // 水墨轨迹滴
  const createInkDrop = (x, y) => {
    const size = 8 + Math.random() * 12;
    inkDropsRef.current.push({
      x, y,
      radius: size * 0.3,
      maxRadius: size * 2.5,
      opacity: 0.35 + Math.random() * 0.2,
      speed: 0.8 + Math.random() * 0.5
    });
  };

  // 动画循环
  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(245, 240, 230, 0.08)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 水墨轨迹
    for (let i = inkDropsRef.current.length - 1; i >= 0; i--) {
      const drop = inkDropsRef.current[i];
      drop.radius += drop.speed;
      drop.opacity -= 0.008;
      if (drop.opacity <= 0 || drop.radius >= drop.maxRadius) {
        inkDropsRef.current.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(40, 40, 40, ${drop.opacity})`;
      ctx.filter = 'blur(2px)';
      ctx.fill();
      ctx.filter = 'none';
    }

    // 游鱼
    for (let i = fishesRef.current.length - 1; i >= 0; i--) {
      const fish = fishesRef.current[i];
      fish.x += fish.speed * fish.direction;
      fish.wobble += 0.025;
      fish.y += Math.sin(fish.wobble) * 0.6;
      if (
        (fish.direction === 1 && fish.x > canvas.width + fish.size * 2) ||
        (fish.direction === -1 && fish.x < -fish.size * 2)
      ) {
        fishesRef.current.splice(i, 1);
        continue;
      }
      drawFish(ctx, fish);
    }

    animRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // 初始两条鱼
    createFish(canvas);
    createFish(canvas);
    // 每3-5秒生成一条新鱼
    const fishTimer = setInterval(() => createFish(canvas), 3000 + Math.random() * 2000);

    animate();

    // 鼠标轨迹
    const onMouseMove = (e) => {
      const x = e.clientX, y = e.clientY;
      const dist = Math.hypot(x - lastXYRef.current.x, y - lastXYRef.current.y);
      const steps = Math.max(1, Math.floor(dist / 6));
      for (let i = 0; i < steps; i++) {
        createInkDrop(
          lastXYRef.current.x + (x - lastXYRef.current.x) * (i / steps),
          lastXYRef.current.y + (y - lastXYRef.current.y) * (i / steps)
        );
      }
      lastXYRef.current = { x, y };
    };

    // 触屏轨迹
    const onTouchMove = (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const x = touch.clientX, y = touch.clientY;
      const dist = Math.hypot(x - lastXYRef.current.x, y - lastXYRef.current.y);
      const steps = Math.max(1, Math.floor(dist / 6));
      for (let i = 0; i < steps; i++) {
        createInkDrop(
          lastXYRef.current.x + (x - lastXYRef.current.x) * (i / steps),
          lastXYRef.current.y + (y - lastXYRef.current.y) * (i / steps)
        );
      }
      lastXYRef.current = { x, y };
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      cancelAnimationFrame(animRef.current);
      clearInterval(fishTimer);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#f5f0e6',
      fontFamily: '"Microsoft Yahei", sans-serif', overflowY: 'auto'
    }}>
      {/* 水墨背景层 */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          zIndex: 0, pointerEvents: 'none'
        }}
      />

      {/* 警示内容 */}
      <div className="warn-modal" style={{
        position: 'fixed', inset: 0, zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '30px 24px',
        border: '2px solid #d92121',
        background: 'rgba(255, 255, 255, 0.96)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
        overflowY: 'auto'
      }}>
        <div style={{ maxWidth: 700, width: '100%' }}>
        <h1 style={{
          fontSize: 32, fontWeight: 900, color: '#d92121',
          textAlign: 'center', margin: '0 0 8px'
        }}>访问前强制警示</h1>
        <h2 style={{
          fontSize: 20, fontWeight: 'bold', color: '#f33',
          textAlign: 'center', margin: '0 0 20px'
        }}>IMPORTANT RISK WARNING</h2>

        <div style={{ lineHeight: 1.8, fontSize: 15, color: '#222' }}>
          <p style={{ marginBottom: 16 }}>
            中文：<br />
            1. 本平台无需登录即可使用，但即便未注册账号，若你创作、上传违法违规内容，平台留存操作记录，可追溯定位追责；<br />
            2. 所有手绘、上传图片、AI生成图像版权与法律责任全部由使用者自行承担；<br />
            3. 严禁制作、上传涉政、色情、暴力、侵权肖像、伪造证件、虚假造谣等违规画面；<br />
            4. 禁止利用本工具从事诈骗、造谣、恶意抹黑他人等一切违法行为；<br />
            5. 未成年人需在监护人陪同下使用本平台；<br />
            6. 一经发现违规内容，平台将直接清除作品、限制访问权限，并配合公安、监管部门追溯处理。<br />
            点击【同意进入】代表你已完整阅读并自愿遵守全部条款。
          </p>

          <hr style={{ margin: '15px 0', border: 'none', borderTop: '1px solid #ddd' }} />

          <p style={{ marginBottom: 16 }}>
            English:<br />
            1. No login is required to use this platform. However, even without an account, if you create or upload illegal content, we reserve operation records and can trace your information for legal liability.<br />
            2. All hand-drawn works, uploaded images and AI-generated artworks shall be solely responsible by the user.<br />
            3. It is strictly prohibited to produce or upload content involving politics, pornography, violence, portrait infringement, fake certificates and false rumors.<br />
            4. Do not use this tool for fraud, rumor-mongering or malicious slander against others.<br />
            5. Minors must use this platform under the supervision of guardians.<br />
            6. Once illegal content is detected, we will delete your works, restrict your access, and cooperate with public security and regulatory authorities for investigation.<br />
            Click "Agree & Enter" means you fully read and accept all the above rules.
          </p>
        </div>

        <div style={{ marginTop: 25, textAlign: 'center' }}>
          <button
            onClick={onAgree}
            style={{
              padding: '10px 30px', fontSize: 16,
              background: '#d92121', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer'
            }}
          >
            同意进入 / Agree &amp; Enter
          </button>
        </div>
        </div>
      </div>

      {/* 手机端响应式 */}
      <style>{`
        @media (max-width: 640px) {
          .warn-modal { padding: 16px 12px !important; }
          .warn-modal h1 { font-size: 26px !important; }
          .warn-modal h2 { font-size: 16px !important; }
        }
      `}</style>
    </div>
  );
}
