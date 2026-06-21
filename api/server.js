import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync, readFileSync, unlinkSync } from 'fs';
import { readFile } from 'fs/promises';
import * as tf from '@tensorflow/tfjs';
import { load as nsfwjsLoad } from 'nsfwjs';
import jpegJs from 'jpeg-js';
import { PNG } from 'pngjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure uploads directory exists (use local path for personal server)
const dataDir = join(__dirname, 'data');
const uploadsDir = join(dataDir, 'uploads');
try {
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(uploadsDir, { recursive: true });
} catch (e) {
  console.error('Failed to create data directories:', e);
}

const app = express();
const port = process.env.PORT || 3001;
app.set('trust proxy', true);

// 获取客户端真实IP（兼容 Railway 代理）
const getClientIp = (req) => {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    if (typeof xff === 'string') return xff.split(',')[0].trim();
    if (Array.isArray(xff)) return xff[0].split(',')[0].trim();
  }
  return req.ip || req.connection.remoteAddress || 'unknown';
};

const adminPassword = 'zhanxnk';

console.log('\n========================================');
console.log('  无限画布 - 本地服务器');
console.log('  本地访问: http://localhost:' + port);
console.log('  数据目录: ' + dataDir);
console.log('  图片目录: ' + uploadsDir);
console.log('========================================\n');

const db = new sqlite3.Database(join(dataDir, 'canvas.db'), (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to SQLite database');
    db.run(`CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      x INTEGER DEFAULT 0,
      y INTEGER DEFAULT 0,
      width INTEGER DEFAULT 200,
      height INTEGER DEFAULT 200,
      uploader_ip TEXT,
      upload_date TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS canvas_pixels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      color TEXT NOT NULL DEFAULT '#000000',
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS upload_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      date TEXT NOT NULL,
      count INTEGER DEFAULT 1
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS visitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      user_agent TEXT,
      first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(ip)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`, () => {
      db.get('SELECT * FROM settings WHERE key = ?', ['daily_limit'], (err, row) => {
        if (!row) {
          db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['daily_limit', '2']);
          db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['max_size_mb', '10']);
          db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['canvas_width', '20000']);
          db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['canvas_height', '20000']);
        }
      });
    });
  }
});

// ========== 内容安全检测 (nsfwjs) ==========
let nsfwModelPromise = null;
const getNsfwModel = () => {
  if (!nsfwModelPromise) {
    nsfwModelPromise = nsfwjsLoad()
      .then((m) => { console.log('[Safety] nsfwjs model loaded'); return m; })
      .catch((e) => {
        console.error('[Safety] nsfwjs model load failed:', e.message);
        nsfwModelPromise = null;
        return null;
      });
  }
  return nsfwModelPromise;
};

const decodeImageToTensor = async (filePath) => {
  const ext = filePath.split('.').pop().toLowerCase();
  const buf = await readFile(filePath);
  let width = 0, height = 0, data = null;
  if (ext === 'jpg' || ext === 'jpeg') {
    const decoded = jpegJs.decode(buf, { maxMemoryUsageInMB: 512 });
    width = decoded.width; height = decoded.height; data = decoded.data;
  } else if (ext === 'png') {
    const png = PNG.sync.read(buf);
    width = png.width; height = png.height; data = png.data;
  } else {
    return null;
  }
  const numPixels = width * height;
  const rgb = new Uint8Array(numPixels * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  return tf.tensor3d(rgb, [height, width, 3], 'int32');
};

const checkImageSafety = async (filePath) => {
  const model = await getNsfwModel();
  if (!model) return { safe: true, reason: 'model_unavailable' };
  let tensor = null;
  try {
    tensor = await decodeImageToTensor(filePath);
    if (!tensor) return { safe: true, reason: 'unsupported_format' };
    const predictions = await model.classify(tensor);
    // categories: Drawing, Hentai, Neutral, Porn, Sexy
    const map = {};
    predictions.forEach((p) => { map[p.className] = p.probability; });
    const nudeScore = (map.Porn || 0) + (map.Hentai || 0) + (map.Sexy || 0) * 0.5;
    const threshold = 0.55;
    if (nudeScore >= threshold) {
      return { safe: false, reason: 'explicit_content', scores: map };
    }
    return { safe: true, scores: map };
  } catch (e) {
    console.error('[Safety] classify error:', e.message);
    return { safe: true, reason: 'check_error' };
  } finally {
    if (tensor) tensor.dispose();
  }
};

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `image-${uniqueSuffix}.${file.originalname.split('.').pop()}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, GIF allowed'));
    }
  }
});

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(uploadsDir));

// 尝试多个候选路径找到前端构建产物
const candidatePaths = [
  join(__dirname, '..', 'client', 'dist'),
  join(process.cwd(), 'client', 'dist'),
  join(process.cwd(), '..', 'client', 'dist'),
  join(__dirname, '..', '..', 'client', 'dist'),
];
const frontendDist = candidatePaths.find(p => existsSync(join(p, 'index.html')));

console.log('\n--- 前端文件路径检查 ---');
candidatePaths.forEach(p => console.log('  ' + p + ' -> ' + (existsSync(join(p, 'index.html')) ? '✅ 找到' : '❌ 未找到')));
console.log('  使用路径: ' + (frontendDist || '(未找到，将显示占位)'));
console.log('------------------------\n');

if (frontendDist) {
  app.use(express.static(frontendDist));
  // SPA 回退：所有非 API 的 GET 请求返回 index.html
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(join(frontendDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html><body style="font-family:sans-serif;text-align:center;padding:40px;">
        <h2>无限画布 - 后端服务运行中</h2>
        <p>前端页面尚未构建。请先运行 <code>cd client && npm install && npm run build</code></p>
        <p>API 状态：<a href="/api/images">/api/images</a></p>
      </body></html>
    `);
  });
}

app.get('/api/images', (req, res) => {
  db.all('SELECT * FROM images ORDER BY upload_date DESC', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.delete('/api/images/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid image id' });
  }
  db.run('DELETE FROM images WHERE id = ?', [id], (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true, deleted: this.changes });
    }
  });
});

app.get('/api/pixels', (req, res) => {
  db.all('SELECT * FROM canvas_pixels', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.get('/api/settings', (req, res) => {
  db.all('SELECT * FROM settings', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      const settings = {};
      rows.forEach(row => settings[row.key] = row.value);
      res.json(settings);
    }
  });
});

// 访客记录 + 在线人数
app.post('/api/visit', (req, res) => {
  const ip = getClientIp(req);
  const ua = (req.headers['user-agent'] || '').substring(0, 500);
  db.run(
    'INSERT OR IGNORE INTO visitors (ip, user_agent, first_seen, last_seen) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    [ip, ua],
    () => {
      db.run('UPDATE visitors SET last_seen = CURRENT_TIMESTAMP, user_agent = ? WHERE ip = ?', [ua, ip]);
      res.json({ success: true });
    }
  );
});

// 在线人数：过去 3 分钟内活跃的访客
app.get('/api/visitors/count', (req, res) => {
  db.get(
    "SELECT COUNT(*) AS cnt FROM visitors WHERE last_seen >= datetime('now', '-3 minutes')",
    (err, row) => {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ count: row?.cnt || 0 });
    }
  );
});

// 管理员：访客列表
app.get('/api/admin/visitors', (req, res) => {
  if (req.cookies.admin !== 'true') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  db.all('SELECT * FROM visitors ORDER BY last_seen DESC LIMIT 100', (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.post('/api/upload', (req, res) => {
  // 像素盖章模式（JSON 数据）
  if (req.headers['content-type'] && req.headers['content-type'].indexOf('application/json') !== -1) {
    const { pixels } = req.body;
    if (!pixels || !Array.isArray(pixels) || pixels.length === 0) {
      return res.status(400).json({ error: 'No pixel data' });
    }

    const ip = getClientIp(req);
    const today = new Date().toISOString().split('T')[0];

    db.get('SELECT count FROM upload_logs WHERE ip = ? AND date = ?', [ip, today], (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const dailyLimit = 1;
      const currentCount = row?.count || 0;

      if (currentCount >= dailyLimit) {
        return res.status(403).json({ error: 'Daily upload limit reached' });
      }

      // 将像素存入画布
      const stmt = db.prepare('INSERT INTO canvas_pixels (x, y, color) VALUES (?, ?, ?)');
      pixels.forEach(p => {
        if (p.x != null && p.y != null && p.color) {
          stmt.run(Math.round(p.x), Math.round(p.y), p.color);
        }
      });
      stmt.finalize((err) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        // 更新上传计数
        if (row) {
          db.run('UPDATE upload_logs SET count = count + 1 WHERE ip = ? AND date = ?', [ip, today]);
        } else {
          db.run('INSERT INTO upload_logs (ip, date, count) VALUES (?, ?, 1)', [ip, today]);
        }

        res.json({ success: true, count: pixels.length });
      });
    });
    return;
  }

  // 文件上传（旧流程）
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }

    const ip = getClientIp(req);
    const today = new Date().toISOString().split('T')[0];

    db.get('SELECT count FROM upload_logs WHERE ip = ? AND date = ?', [ip, today], async (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const dailyLimit = 1;

      const currentCount = row?.count || 0;

      if (currentCount >= dailyLimit) {
        return res.status(403).json({ error: 'Daily upload limit reached' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // ========== 内容安全检测 ==========
      try {
        const safety = await checkImageSafety(req.file.path);
        if (!safety.safe) {
          try { unlinkSync(req.file.path); } catch (_) {}
          console.log('[Safety] blocked upload:', safety.reason, 'ip=' + ip);
          return res.status(403).json({ error: 'Image rejected: contains explicit content' });
        }
      } catch (checkErr) {
        console.error('[Safety] check exception:', checkErr.message);
      }

      const imgWidth = parseInt(req.body.width) || 200;
      const imgHeight = parseInt(req.body.height) || 200;
      const displayWidth = Math.max(20, Math.floor(imgWidth / 2));
      const displayHeight = Math.max(20, Math.floor(imgHeight / 2));

      const canvasWidth = await new Promise((resolve) => {
        db.get('SELECT value FROM settings WHERE key = ?', ['canvas_width'], (err, row) => {
          resolve(parseInt(row?.value || '20000'));
        });
      });

      const canvasHeight = await new Promise((resolve) => {
        db.get('SELECT value FROM settings WHERE key = ?', ['canvas_height'], (err, row) => {
          resolve(parseInt(row?.value || '20000'));
        });
      });

      const x = Math.floor(canvasWidth / 2);
      const y = Math.floor(canvasHeight / 2);

      db.run('INSERT INTO images (filename, x, y, width, height, uploader_ip) VALUES (?, ?, ?, ?, ?, ?)',
        [req.file.filename, x, y, displayWidth, displayHeight, ip], (err) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          if (row) {
            db.run('UPDATE upload_logs SET count = count + 1 WHERE ip = ? AND date = ?', [ip, today]);
          } else {
            db.run('INSERT INTO upload_logs (ip, date, count) VALUES (?, ?, 1)', [ip, today]);
          }

          res.json({ success: true, id: this.lastID, width: displayWidth, height: displayHeight });
        });
    });
  });
});

app.post('/api/draw', (req, res) => {
  const { pixels } = req.body;
  if (!pixels || !Array.isArray(pixels)) {
    return res.status(400).json({ error: 'Invalid pixels data' });
  }
  
  const stmt = db.prepare('INSERT INTO canvas_pixels (x, y, color) VALUES (?, ?, ?)');
  pixels.forEach(p => {
    stmt.run(p.x, p.y, p.color);
  });
  stmt.finalize((err) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true });
    }
  });
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === adminPassword) {
    res.cookie('admin', 'true', { maxAge: 24 * 60 * 60 * 1000 });
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.get('/api/admin/verify', (req, res) => {
  if (req.cookies.admin === 'true') {
    res.json({ isAdmin: true });
  } else {
    res.json({ isAdmin: false });
  }
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin');
  res.json({ success: true });
});

app.delete('/api/admin/images', (req, res) => {
  if (req.cookies.admin !== 'true') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { ids } = req.body;
  if (ids && Array.isArray(ids) && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM images WHERE id IN (${placeholders})`, ids, (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ success: true, deleted: ids.length });
      }
    });
  } else {
    db.run('DELETE FROM images', (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ success: true, deleted: 'all' });
      }
    });
  }
});

app.delete('/api/admin/pixels', (req, res) => {
  if (req.cookies.admin !== 'true') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  db.run('DELETE FROM canvas_pixels', (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true });
    }
  });
});

app.post('/api/admin/settings', (req, res) => {
  if (req.cookies.admin !== 'true') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { key, value } = req.body;
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value], (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true });
    }
  });
});

app.get('/api/upload/status', (req, res) => {
  const ip = getClientIp(req);
  const today = new Date().toISOString().split('T')[0];
  
  db.get('SELECT count FROM upload_logs WHERE ip = ? AND date = ?', [ip, today], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const dailyLimit = 1;
    res.json({
      count: row?.count || 0,
      limit: dailyLimit,
      remaining: dailyLimit - (row?.count || 0)
    });
  });
});

// 消耗一次上传额度（进入盖章模式时调用，确认名额足够）
app.post('/api/upload/consume', (req, res) => {
  const ip = getClientIp(req);
  const today = new Date().toISOString().split('T')[0];

  db.get('SELECT count FROM upload_logs WHERE ip = ? AND date = ?', [ip, today], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const dailyLimit = 1;
    const currentCount = row?.count || 0;

    if (currentCount >= dailyLimit) {
      return res.status(403).json({ error: 'Daily upload limit reached' });
    }

    if (row) {
      db.run('UPDATE upload_logs SET count = count + 1 WHERE ip = ? AND date = ?', [ip, today]);
    } else {
      db.run('INSERT INTO upload_logs (ip, date, count) VALUES (?, ?, 1)', [ip, today]);
    }

    res.json({ success: true, count: currentCount + 1, remaining: dailyLimit - currentCount - 1 });
  });
});

// 管理员：橡皮擦 - 删除指定范围内的像素
app.delete('/api/admin/pixels/range', (req, res) => {
  if (req.cookies.admin !== 'true') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const x = parseInt(req.body.x);
  const y = parseInt(req.body.y);
  const size = Math.max(1, parseInt(req.body.size) || 1);

  if (isNaN(x) || isNaN(y)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  const half = Math.floor(size / 2);
  const x1 = x - half;
  const y1 = y - half;
  const x2 = x + half;
  const y2 = y + half;

  db.run(
    'DELETE FROM canvas_pixels WHERE x >= ? AND x <= ? AND y >= ? AND y <= ?',
    [x1, x2, y1, y2],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ success: true, deleted: this.changes || 0 });
      }
    }
  );
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${port}`);
});
