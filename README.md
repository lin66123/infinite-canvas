# 无限画布 (Infinite Canvas)

一个基于 React + Express 的在线协作无限画布平台。

## 功能

- 无限画布，图片上传、叠加、移动
- 画布涂鸦，支持自定义颜色和粗细
- 管理员密码登录，可批量删除图片
- 捐款二维码按钮
- 支持手机触摸操作

## 本地开发

### 1. 启动后端

```bash
cd api
npm install
npm start
# 后端运行在 http://localhost:3001
```

### 2. 启动前端

```bash
cd client
npm install
npm run dev
# 前端运行在 http://localhost:5173
```

## 部署到 GitHub Pages

前端已配置好 GitHub Actions 自动部署：

1. 推送代码到 `main` 分支
2. 打开仓库 **Settings** → **Pages**
3. 选择 **Source: GitHub Actions**
4. 等待 Action 自动构建和部署
5. 访问：`https://lin66123.github.io/infinite-canvas/`

**注意**：GitHub Pages 只能部署前端静态页面，后端 API 需要单独部署到其他服务（如 Railway、Render 等）。

## 后端部署（推荐 Railway）

1. 登录 [railway.app](https://railway.app)
2. New Project → Deploy from GitHub repo
3. 选择你的仓库
4. 配置 Build Command: `cd api && npm install`
5. 配置 Start Command: `cd api && npm start`
6. 部署后获得后端 URL，替换 `client/src/App.jsx` 中的 `YOUR_BACKEND_URL`
7. 重新 Push 前端代码

## 管理员密码

默认密码：公园221年秦时黄拉啥

可在 `api/server.js` 中修改：
```js
const adminPassword = '你的密码';
```

## 技术栈

- **前端**: React 18 + Vite + Tailwind CSS
- **后端**: Express.js + SQLite + Multer
- **部署**: GitHub Pages (前端) + Railway (后端)

## 开发模式

本地访问：`http://localhost:5173`
局域网访问：`http://10.73.82.39:5173`
