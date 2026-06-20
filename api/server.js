import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';

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
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// 服务前端页面（构建后的 React 应用）
const frontendDist = join(__dirname, '..', 'client', 'dist');
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA 回退：未匹配的 GET 请求返回 index.html
  app.get('/', (req, res) => {
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

app.post('/api/upload', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }

    const ip = req.ip || req.connection.remoteAddress;
    const today = new Date().toISOString().split('T')[0];

    db.get('SELECT count FROM upload_logs WHERE ip = ? AND date = ?', [ip, today], async (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const dailyLimit = await new Promise((resolve) => {
        db.get('SELECT value FROM settings WHERE key = ?', ['daily_limit'], (err, row) => {
          resolve(parseInt(row?.value || '2'));
        });
      });

      const currentCount = row?.count || 0;

      if (currentCount >= dailyLimit) {
        return res.status(403).json({ error: 'Daily upload limit reached' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
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
  const ip = req.ip || req.connection.remoteAddress;
  const today = new Date().toISOString().split('T')[0];
  
  db.get('SELECT count FROM upload_logs WHERE ip = ? AND date = ?', [ip, today], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    db.get('SELECT value FROM settings WHERE key = ?', ['daily_limit'], (err, limitRow) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({
        count: row?.count || 0,
        limit: parseInt(limitRow?.value || '2'),
        remaining: parseInt(limitRow?.value || '2') - (row?.count || 0)
      });
    });
  });
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
