============================================================
  无限画布网站 - AI Agent 操作手册（线上 / 本地同步）
  版本：2026-06-21
  适用：OpenClaw / Claude / 章鱼爪 / 任意可操作电脑与浏览器的 Agent
============================================================

一、项目概述
------------------------------------------------------------
项目名称：无限画布（多人在线画布 + 图片盖章 + 内容安全检测）
线上地址：https://infinite-canvas-production-635a.up.railway.app/
GitHub 仓库：https://github.com/lin66123/infinite-canvas.git
主分支：main（推送到 main 后 Railway 自动构建部署，约 1-3 分钟生效）

技术栈：
  - 前端：React 18 + Vite （目录 client/）
  - 后端：Express.js + SQLite （目录 api/）
  - 托管：Railway（自动监听 GitHub main 分支推送）

核心特性：
  1. 无限像素画布 + 画笔/橡皮擦 + 图片盖章
  2. 实时在线人数（顶部显示）
  3. 管理员面板（访客记录、上传管理）
  4. 整点强制弹出风险警示（3/6/10/12/14/16/20/22 点刷新重新弹出）
  5. 水墨画布（侧边入口，独立画布）
  6. 上传色情图片自动拒绝（nsfwjs 检测）
  7. 每日每人盖章/上传限额（=1 次/天）

============================================================
二、目录结构与关键文件
------------------------------------------------------------
/workspace/infinite-canvas/  ← 根目录（或你电脑上的任意路径）
│
├── client/                          前端 React
│   ├── src/
│   │   ├── App.jsx                  ← 主入口：所有 UI 逻辑、侧边栏、主画布、管理员面板
│   │   ├── WarningPage.jsx          ← 风险警示页组件（全屏、可滚动）
│   │   └── InkCanvas.jsx            ← 水墨画布组件（笔触+粒子+缩放+返回按钮）
│   ├── package.json                 ← 前端依赖
│   └── dist/                        ← 构建产物（git 忽略，但 Railway 会拉取）
│
├── api/                             后端 Express + SQLite
│   ├── server.js                    ← 所有路由、数据库操作、上传、访客、nsfwjs 检测
│   ├── package.json                 ← 后端依赖
│   └── data/                        ← SQLite 数据库文件与上传图片（运行时自动创建）
│
├── .gitignore
└── README.md                        ← （可选）项目说明

⚠ 重要：
  - App.jsx 约 1000 行，是修改最多的文件。改任何"看起来改不动"的功能先搜这个文件。
  - server.js 包含所有数据库/接口/安全检测，修改前先备份（或先 git commit 保存当前状态）。

============================================================
三、本地开发环境搭建
------------------------------------------------------------
前置条件：已安装 Node.js ≥ 18、npm ≥ 9。
  在终端输入：node -v / npm -v  确认版本号。

3.1 拉取代码（首次）
  cd /workspace
  git clone https://github.com/lin66123/infinite-canvas.git
  cd infinite-canvas

  （如果代码已存在，先拉最新）
  git pull origin main

3.2 安装依赖（前端 + 后端分别装）
  cd client && npm install     ← 可能需要 1-3 分钟
  cd ../api && npm install     ← 同上

3.3 本地启动
  方式 A（推荐：只看前端页面效果）
    cd client && npm run dev
    浏览器打开：http://localhost:5173

  方式 B（完整：前端 + 后端同跑）
    打开两个终端：
      终端 1: cd api && node server.js          ← 运行在 http://localhost:3001
      终端 2: cd client && npm run dev           ← 运行在 http://localhost:5173

    此时访问 http://localhost:5173 就能看到完整功能（访客检测、图片上传、nsfwjs 检测均生效）

============================================================
四、常见修改操作手册
------------------------------------------------------------
⚠ 所有改代码前都建议先执行：
  git status                    ← 确认当前分支是 main，且无未提交改动
  git pull origin main          ← 拉取线上最新，避免冲突

--- 修改文字 / 提示 / 按钮文案 ---
  1. 打开 client/src/App.jsx，用"搜索功能"（Ctrl+F / Cmd+F）
     输入你想改的文字关键词。
  2. 找到对应行直接修改字符串内容。
  3. 保存。本地刷新浏览器（http://localhost:5173）查看效果。
  4. 确认无误后，执行"推送部署"流程（见第五节）。

--- 修改颜色 / 样式 ---
  - 画笔默认色、调色板预设色：搜 App.jsx 中的 `useState` / `brushColor` / `palette`。
  - 警告页样式：改 WarningPage.jsx 中的 style 对象。
  - 水墨画布样式：改 InkCanvas.jsx 中的 style 对象。

--- 新增功能 / 页面 ---
  1. 在 client/src/ 下创建新的 .jsx 文件（例如 NewFeature.jsx）。
  2. 在 App.jsx 顶部添加 import：
        import NewFeature from './NewFeature';
  3. 在 App.jsx 的 return 中按已有模式（与 InkCanvas 类似）新增渲染入口：
        {showNewFeature && <NewFeature onClose={() => setShowNewFeature(false)} />}
     并在状态声明区添加：
        const [showNewFeature, setShowNewFeature] = useState(false);
  4. 在侧边栏/顶部新增触发按钮（搜"水墨画布"按钮，复制同样结构）。

--- 修改后端接口行为 ---
  - 改 api/server.js。关键区域：
    * 顶部 import（添加新的库需先 npm install 再 import）
    * 数据库表结构（CREATE TABLE 块）
    * `/api/*` 路由处理函数
  - 修改 server.js 后需重启后端（Ctrl+C 然后 node server.js）。

--- 调整每日上传/盖章限额 ---
  1. 打开 server.js，搜 `dailyLimit`。
  2. 每个涉及 dailyLimit 的地方都要改（JSON 盖章流程 + 文件上传流程，通常有两处）。
  3. 同时前端 App.jsx 搜"今日剩余"，保持文案一致。

--- 修改管理员密码 ---
  server.js 中搜索 `adminPassword`，通常在文件顶部声明。
  也可以在环境变量里设置（Railway 后台可配置，优先级高于硬编码）。

--- 新增管理员可看的页面 ---
  1. 在 App.jsx 的"管理员面板"区域（大约 800-1000 行），添加你要显示的内容。
  2. 用条件渲染控制：只有 `isAdmin === true` 时才渲染。
  3. 如果需要后端数据，在 server.js 新增一个 `/api/admin/xxx` 的 GET 路由，返回查询结果。
  4. 前端用 `fetch('/api/admin/xxx').then(r => r.json()).then(data => ...)` 拉取数据并渲染。

============================================================
五、构建 + 推送到线上（GitHub → Railway 自动部署）
------------------------------------------------------------
⚠ 执行前必须确认：已配置好 GitHub SSH Key 或 PAT（见第六节）。

5.1 构建前端
  cd client
  npm run build           ← 会生成 client/dist/ 目录（约 240KB JS + 9KB CSS）
  看到 "built in X.Xs" 即成功。

5.2 提交 + 推送
  cd /workspace/infinite-canvas    ← 回到项目根目录
  git status                       ← 查看哪些文件被改动过
  git add client/src/xxx.jsx client/src/xxx.jsx api/server.js
  （上面这行按需：把你实际改动的文件都 add 进来）
  git commit -m "这里写中文/英文说明改动，方便以后回查"
  git push origin main

5.3 等待 Railway 部署（1-3 分钟）
  访问：https://railway.app/  进入 infinite-canvas 项目
  或直接访问线上网站看是否已刷新。

  确认已更新的简单方法：
    - 在代码里故意留一个"可见的差异"（比如按钮文案加个日期），
      推送后看浏览器刷新后是否看到。

============================================================
六、GitHub 与 SSH Key 配置（首次或换电脑必做）
------------------------------------------------------------
6.1 生成 SSH Key（Windows / macOS / Linux 通用）
  在终端执行：
    ssh-keygen -t rsa -b 4096 -C "你的邮箱或备注"
    一路回车（默认路径、无密码最省心）。

6.2 把公钥添加到 GitHub
  Windows: type %userprofile%\.ssh\id_rsa.pub
  macOS/Linux: cat ~/.ssh/id_rsa.pub
  复制输出的整段文字。
  登录 https://github.com/settings/keys → New SSH key → 粘贴保存。

6.3 测试连接
  ssh -T git@github.com
  看到 "Hi lin66123!" 即成功。

6.4 确保本地仓库走 SSH
  cd /workspace/infinite-canvas
  git remote -v
  如果显示 https://github.com/lin66123/infinite-canvas.git，则改为 SSH：
    git remote set-url origin git@github.com:lin66123/infinite-canvas.git

  （或保留 HTTPS + PAT 方式也可，见 6.5）

6.5 备选：Personal Access Token (PAT) 方式
  https://github.com/settings/tokens → Generate new token (classic)
  勾选 repo 权限，生成后复制，在 remote 里用：
    git remote set-url origin https://lin66123:你的TOKEN@github.com/lin66123/infinite-canvas.git
  （TOKEN 只显示一次，务必复制好）

============================================================
七、本地和线上同步的最佳实践
------------------------------------------------------------
7.1 本地调试
  - 先在本地 `npm run dev` 预览，满意后再推 main。
  - 不要把"半成品/报错代码"推 main，会让线上网站挂掉。

7.2 修改前备份
  git status / git diff          ← 看清楚改了哪些行
  git commit -m "backup-before-x"  ← 即使代码坏了也能一键回到这版

7.3 回滚（代码改错了想恢复上一版）
  git log                        ← 看最近几条提交，记一个 commit hash（前 7 位即可）
  git reset --hard commit_hash   ← 回到那个版本（⚠ 会清掉未提交改动）
  git push -f origin main        ← 强制推送（⚠ 线上会回到那个版本）

7.4 文件不要乱删
  以下文件必须存在：
    - client/src/App.jsx
    - client/src/WarningPage.jsx
    - client/src/InkCanvas.jsx
    - client/package.json
    - api/server.js
    - api/package.json
    - .gitignore

7.5 不要把 secrets / API key 写到代码里
  Railway / GitHub 都有"环境变量"功能可设置。
  当前 nsfwjs 无需密钥，是纯开源模型；若以后接入阿里云内容安全、腾讯云内容安全，把 key 放 Railway 环境变量，不要硬编码。

============================================================
八、常见故障排查
------------------------------------------------------------
8.1 报错 "vite: not found"
  → 没装依赖。执行 cd client && npm install

8.2 报错 "nsfwjs not found" 或类似
  → 后端依赖缺失。执行 cd api && npm install

8.3 推送成功后线上网站没变化
  → 等 1-3 分钟 Railway 构建；仍没变化去 Railway 后台看构建日志。
  → 浏览器强制刷新（Ctrl+Shift+R / Cmd+Shift+R）。
  → 确认你 push 的分支确实是 main，而不是别的分支。

8.4 线上 500 服务器错误
  → 大概率 server.js 改动后启动失败。
  → 本地先跑 `cd api && node server.js` 看启动日志。

8.5 "git push" 被拒绝（rejected）
  → 线上代码比本地新。先 `git pull origin main`，合并冲突后再推。

8.6 警告页在手机上无法滚动 / 按钮看不到
  → 已在 WarningPage.jsx 用 `justifyContent: 'flex-start'` + `WebkitOverflowScrolling: 'touch'` 修复。
  → 如果仍有问题，检查该文件 `overflowY: 'auto'` 是否存在。

8.7 水墨画布调颜色/笔刷/浓度后画面清空
  → 已修复（把 useEffect 依赖改为 `[]`，颜色等值改用 ref 读取）。
  → 如果又出现，检查 InkCanvas.jsx 的 useEffect 依赖数组是否仍含 [color, size, opacity]。

8.8 主画布的墨水滴粒子掉到错误位置（偏移）
  → 已修复：改用 `canvasRef.current.getBoundingClientRect()` 取真实位置。
  → 若又坏，确认 App.jsx 中 `sx/sy` 计算用的是 `rect.left + x * scale` 而不是 `(w - canvasSize*scale)/2`。

8.9 nswfjs 检测失效或模型加载失败
  → server.js 中 `getNsfwModel` 有容错；模型加载失败时不会阻止网站运行，只是图片不会被检测。
  → 看 `node server.js` 启动日志里是否有 "[Safety]" 相关信息。

============================================================
九、一键脚本（可选，方便 AI 执行）
------------------------------------------------------------
把以下内容存为 `deploy.sh`（Windows 用 PowerShell 版本也可）。
下次要发布时，只要执行这一个脚本即可。

  #!/bin/bash
  # 用法：chmod +x deploy.sh && ./deploy.sh
  set -e

  echo "==> 拉取最新代码"
  git pull origin main

  echo "==> 构建前端"
  cd client
  npm install
  npm run build
  cd ..

  echo "==> 安装后端依赖"
  cd api
  npm install
  cd ..

  echo "==> 推送"
  git add -A
  git commit -m "deploy: $(date '+%Y-%m-%d %H:%M:%S')"
  git push origin main

  echo "==> 完成，Railway 1-3 分钟后自动生效"
  echo "访问：https://infinite-canvas-production-635a.up.railway.app/"

============================================================
十、版本历史（维护者在此记录重要改动）
------------------------------------------------------------
2026-06-21 初始版本
  - 基础无限画布
  - 侧边栏 + 刷新画布 + 重置视图
  - 管理员面板（连续按 ` 键触发）
  - 图片盖章（每日 1 次）
  - 实时在线人数
  - 风险警告页（整点弹出）
  - 水墨画布入口
  - nsfwjs 色情图片检测
  - 警告页手机端可滚动修复
  - 水墨画布调参不丢失修复
  - 主画布墨水滴位置修正

============================================================
END OF MANUAL
============================================================
