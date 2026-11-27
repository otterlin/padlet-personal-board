/**
 * 個人靈感塗鴉牆 (Padlet Personal Clone)
 * 支援 Google Sheet + Google Drive (透過 Google Apps Script Web App) 作為雲端資料庫
 * 同時提供 LocalStorage 本機模式，開箱即用
 */

const STORAGE_KEYS = {
  GAS_URL: 'padlet_personal_gas_url',
  LOCAL_POSTS: 'padlet_personal_local_posts',
  BOARD_META: 'padlet_personal_board_meta',
  LIKED_IDS: 'padlet_personal_liked_ids',
  LAST_AUTHOR: 'padlet_personal_last_author'
};

// 預設展示貼文 (當初次開啟且尚未連線至空白資料庫時顯示)
const DEFAULT_DEMO_POSTS = [
  {
    id: 'demo_1',
    author: '板主 小創',
    title: '🎉 歡迎來到我的個人靈感塗鴉牆！',
    content: '這是一個以 Google Sheet 當資料庫的 Padlet 風格塗鴉牆。\n\n你可以：\n1️⃣ 點擊右下角「＋」或雙擊空白處新增便利貼\n2️⃣ 上傳圖片（或直接 Ctrl+V 貼上截圖）\n3️⃣ 附上外部網站連結\n4️⃣ 對貼文按愛心或展開留言互動！',
    imageUrl: 'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?auto=format&fit=crop&w=900&q=80',
    linkUrl: 'https://sheets.new',
    linkTitle: '前往建立 Google 試算表資料庫',
    color: 'yellow',
    category: '靈感筆記',
    likes: 12,
    pinned: true,
    comments: [
      { id: 'c1', author: '訪客阿凱', text: '介面超像 Padlet！而且可以用 Google Sheet 存資料太方便了～', createdAt: new Date().toISOString() }
    ],
    createdAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString()
  },
  {
    id: 'demo_2',
    author: '設計師 Una',
    title: '📸 桌面改造與創客工作區靈感',
    content: '今天整理了工作桌，把常用的開發板、雙螢幕支架跟溫暖的桌燈重新配置了一下，寫程式跟做專案的效率大幅提升！',
    imageUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=900&q=80',
    linkUrl: 'https://unsplash.com',
    linkTitle: 'Unsplash 免費高畫質圖庫',
    color: 'white',
    category: '作品分享',
    likes: 8,
    pinned: false,
    comments: [],
    createdAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString()
  },
  {
    id: 'demo_3',
    author: '小創',
    title: '🔗 常用前端與創客開發資源整理',
    content: '把幾個平常做 Side Project 最常查閱的網站釘在牆上，隨時要找靈感或查 API 都一目了然。',
    imageUrl: '',
    linkUrl: 'https://developer.mozilla.org/zh-TW/',
    linkTitle: 'MDN Web Docs 開發者文件',
    color: 'blue',
    category: '好站連結',
    likes: 5,
    pinned: false,
    comments: [],
    createdAt: new Date(Date.now() - 3600 * 1000 * 1).toISOString()
  }
];

// 應用程式狀態
const state = {
  gasUrl: localStorage.getItem(STORAGE_KEYS.GAS_URL) || '',
  posts: [],
  currentCategory: 'all',
  searchQuery: '',
  selectedColor: 'white',
  mediaMode: 'upload', // 'upload' | 'url'
  uploadedImageBase64: '',
  uploadedImageName: '',
  uploadedImageMime: '',
  likedPostIds: new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.LIKED_IDS) || '[]'))
};

// DOM 元素快取
const els = {
  boardTitle: document.getElementById('boardTitle'),
  boardSubtitle: document.getElementById('boardSubtitle'),
  dbStatusBadge: document.getElementById('dbStatusBadge'),
  dbStatusText: document.getElementById('dbStatusText'),
  searchInput: document.getElementById('searchInput'),
  refreshBtn: document.getElementById('refreshBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  newPostTopBtn: document.getElementById('newPostTopBtn'),
  fabAddBtn: document.getElementById('fabAddBtn'),
  emptyAddBtn: document.getElementById('emptyAddBtn'),
  categoryTabs: document.getElementById('categoryTabs'),
  countAll: document.getElementById('countAll'),
  loadingBar: document.getElementById('loadingBar'),
  boardCanvas: document.getElementById('boardCanvas'),
  postsContainer: document.getElementById('postsContainer'),
  emptyState: document.getElementById('emptyState'),
  // 新增貼文 Modal
  postModal: document.getElementById('postModal'),
  closePostModal: document.getElementById('closePostModal'),
  cancelPostBtn: document.getElementById('cancelPostBtn'),
  postForm: document.getElementById('postForm'),
  postAuthor: document.getElementById('postAuthor'),
  postCategory: document.getElementById('postCategory'),
  postTitle: document.getElementById('postTitle'),
  postContent: document.getElementById('postContent'),
  postImageUrl: document.getElementById('postImageUrl'),
  postLinkUrl: document.getElementById('postLinkUrl'),
  postLinkTitle: document.getElementById('postLinkTitle'),
  postPinned: document.getElementById('postPinned'),
  submitPostBtn: document.getElementById('submitPostBtn'),
  dropZone: document.getElementById('dropZone'),
  imageFileInput: document.getElementById('imageFileInput'),
  dropZonePrompt: document.getElementById('dropZonePrompt'),
  imagePreviewWrap: document.getElementById('imagePreviewWrap'),
  imagePreview: document.getElementById('imagePreview'),
  removeImgBtn: document.getElementById('removeImgBtn'),
  uploadPanel: document.getElementById('uploadPanel'),
  urlPanel: document.getElementById('urlPanel'),
  colorPicker: document.getElementById('colorPicker'),
  // 設定 Modal
  settingsModal: document.getElementById('settingsModal'),
  closeSettingsModal: document.getElementById('closeSettingsModal'),
  gasUrlInput: document.getElementById('gasUrlInput'),
  testConnectionBtn: document.getElementById('testConnectionBtn'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
  testResultMsg: document.getElementById('testResultMsg'),
  copyGasCodeBtn: document.getElementById('copyGasCodeBtn'),
  clearGasUrlBtn: document.getElementById('clearGasUrlBtn'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  // 燈箱
  lightboxModal: document.getElementById('lightboxModal'),
  closeLightboxBtn: document.getElementById('closeLightboxBtn'),
  lightboxImg: document.getElementById('lightboxImg'),
  lightboxCaption: document.getElementById('lightboxCaption'),
  toastContainer: document.getElementById('toastContainer')
};

/**
 * 初始化應用程式
 */
function init() {
  loadBoardMeta();
  updateDbBadge();
  bindEvents();
  fetchPosts();
}

/**
 * 載入與儲存塗鴉牆標題、背景設定
 */
function loadBoardMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BOARD_META);
    if (!raw) return;
    const meta = JSON.parse(raw);
    if (meta.title) els.boardTitle.textContent = meta.title;
    if (meta.subtitle) els.boardSubtitle.textContent = meta.subtitle;
    if (meta.bg) {
      document.body.className = meta.bg;
      document.querySelectorAll('.bg-dot').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.bg === meta.bg);
      });
    }
  } catch (err) {
    console.warn('無法載入版面設定', err);
  }
}

function saveBoardMeta() {
  const activeBgBtn = document.querySelector('.bg-dot.active');
  const meta = {
    title: els.boardTitle.textContent.trim() || '我的個人靈感塗鴉牆',
    subtitle: els.boardSubtitle.textContent.trim() || '',
    bg: activeBgBtn ? activeBgBtn.dataset.bg : 'bg-cork'
  };
  localStorage.setItem(STORAGE_KEYS.BOARD_META, JSON.stringify(meta));
}

/**
 * 更新資料庫狀態徽章
 */
function updateDbBadge() {
  if (state.gasUrl) {
    els.dbStatusBadge.classList.add('connected');
    els.dbStatusText.textContent = 'Google Sheet 已連線';
  } else {
    els.dbStatusBadge.classList.remove('connected');
    els.dbStatusText.textContent = '本機展示模式 (點此串接 Google Sheet)';
  }
}

/**
 * 顯示 Toast 提示訊息
 */
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  els.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3200);
}

function setLoading(isLoading) {
  els.loadingBar.classList.toggle('hidden', !isLoading);
}

/**
 * 讀取貼文列表 (優先從 Google Sheet 讀取，若未設定則讀取 LocalStorage)
 */
async function fetchPosts() {
  setLoading(true);
  try {
    if (state.gasUrl) {
      const url = state.gasUrl + (state.gasUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
      const res = await fetch(url, { method: 'GET' });
      const data = await res.json();
      if (data && data.status === 'ok' && Array.isArray(data.posts)) {
        state.posts = data.posts;
        localStorage.setItem(STORAGE_KEYS.LOCAL_POSTS, JSON.stringify(state.posts));
      } else {
        throw new Error((data && data.message) || 'Google Sheet 回傳格式不正確');
      }
    } else {
      const saved = localStorage.getItem(STORAGE_KEYS.LOCAL_POSTS);
      if (saved) {
        state.posts = JSON.parse(saved);
      } else {
        state.posts = [...DEFAULT_DEMO_POSTS];
        localStorage.setItem(STORAGE_KEYS.LOCAL_POSTS, JSON.stringify(state.posts));
      }
    }
  } catch (err) {
    console.error('讀取失敗:', err);
    showToast('⚠️ 無法從 Google Sheet 讀取，暫時顯示本機快取資料');
    const saved = localStorage.getItem(STORAGE_KEYS.LOCAL_POSTS);
    state.posts = saved ? JSON.parse(saved) : [...DEFAULT_DEMO_POSTS];
  } finally {
    setLoading(false);
    renderPosts();
  }
}

/**
 * 傳送 POST 請求至 Google Apps Script (使用 text/plain 避免 CORS 預檢失敗)
 */
async function sendGasPost(payload) {
  const res = await fetch(state.gasUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

/**
 * 將貼文排序並渲染至塗鴉牆
 */
function renderPosts() {
  // 排序：置頂優先，其次依時間新到舊
  const sorted = [...state.posts].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) {
      return a.pinned ? -1 : 1;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  els.countAll.textContent = sorted.length;

  // 篩選分類與關鍵字
  const query = state.searchQuery.trim().toLowerCase();
  const filtered = sorted.filter(post => {
    const matchCat = state.currentCategory === 'all' || post.category === state.currentCategory;
    if (!matchCat) return false;
    if (!query) return true;
    const haystack = [post.title, post.content, post.author, post.category, post.linkTitle, post.linkUrl]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });

  els.postsContainer.innerHTML = '';

  if (filtered.length === 0) {
    els.emptyState.classList.remove('hidden');
    return;
  }

  els.emptyState.classList.add('hidden');

  filtered.forEach(post => {
    const card = createCardElement(post);
    els.postsContainer.appendChild(card);
  });
}

/**
 * 建立單張 Padlet 貼文卡片 DOM
 */
function createCardElement(post) {
  const article = document.createElement('article');
  const colorClass = `color-${post.color || 'white'}`;
  article.className = `padlet-card ${colorClass}`;
  article.dataset.id = post.id;

  const authorName = post.author || '匿名訪客';
  const avatarChar = authorName.trim().charAt(0).toUpperCase();
  const formattedTime = formatRelativeTime(post.createdAt);
  const isLiked = state.likedPostIds.has(post.id);
  const comments = Array.isArray(post.comments) ? post.comments : [];

  // 頂部作者與工具列
  const topBar = document.createElement('div');
  topBar.className = 'card-top-bar';
  topBar.innerHTML = `
    <div class="author-info">
      <div class="author-avatar">${escapeHtml(avatarChar)}</div>
      <div class="author-meta">
        <span class="author-name">${escapeHtml(authorName)}</span>
        <span class="post-time">${escapeHtml(formattedTime)}</span>
      </div>
    </div>
    <div class="card-badges">
      <span class="category-pill">${escapeHtml(post.category || '一般')}</span>
      <button class="pin-btn ${post.pinned ? 'pinned' : ''}" title="${post.pinned ? '取消置頂' : '置頂貼文'}">
        📌
      </button>
      <button class="delete-btn" title="刪除貼文">🗑️</button>
    </div>
  `;

  // 綁定置頂與刪除事件
  topBar.querySelector('.pin-btn').addEventListener('click', () => handleTogglePin(post.id));
  topBar.querySelector('.delete-btn').addEventListener('click', () => handleDeletePost(post.id));
  article.appendChild(topBar);

  // 卡片主體
  const body = document.createElement('div');
  body.className = 'card-body';

  if (post.title) {
    const titleEl = document.createElement('h3');
    titleEl.className = 'card-title';
    titleEl.textContent = post.title;
    body.appendChild(titleEl);
  }

  // 圖片區塊
  if (post.imageUrl) {
    const imgWrap = document.createElement('div');
    imgWrap.className = 'card-image-wrap';
    const img = document.createElement('img');
    img.src = post.imageUrl;
    img.alt = post.title || '塗鴉牆圖片';
    img.loading = 'lazy';
    imgWrap.addEventListener('click', () => openLightbox(post.imageUrl, post.title));
    imgWrap.appendChild(img);
    body.appendChild(imgWrap);
  }

  // 文字內容
  if (post.content) {
    const contentEl = document.createElement('div');
    contentEl.className = 'card-content';
    contentEl.textContent = post.content;
    body.appendChild(contentEl);
  }

  // 附加外部連結卡片
  if (post.linkUrl) {
    const safeUrl = normalizeUrl(post.linkUrl);
    let domain = safeUrl;
    try {
      domain = new URL(safeUrl).hostname;
    } catch (e) {
      domain = safeUrl;
    }
    const linkBox = document.createElement('a');
    linkBox.className = 'card-link-box';
    linkBox.href = safeUrl;
    linkBox.target = '_blank';
    linkBox.rel = 'noopener noreferrer';
    linkBox.innerHTML = `
      <div class="link-icon-badge">🔗</div>
      <div class="link-details">
        <div class="link-title">${escapeHtml(post.linkTitle || domain)}</div>
        <div class="link-domain">${escapeHtml(safeUrl)}</div>
      </div>
      <span>↗</span>
    `;
    body.appendChild(linkBox);
  }

  article.appendChild(body);

  // 底部按讚與留言區塊
  const footer = document.createElement('div');
  footer.className = 'card-footer';
  footer.innerHTML = `
    <div class="card-actions-row">
      <button class="like-btn ${isLiked ? 'liked' : ''}">
        ❤️ <span class="like-count">${Number(post.likes || 0)}</span>
      </button>
      <button class="comment-toggle-btn">
        💬 留言 (<span>${comments.length}</span>)
      </button>
    </div>
    <div class="comments-section ${comments.length > 0 ? '' : 'hidden'}">
      <div class="comment-list"></div>
      <form class="comment-form">
        <input type="text" placeholder="寫下留言回覆..." required maxlength="150" />
        <button type="submit">送出</button>
      </form>
    </div>
  `;

  // 渲染現有回覆留言
  const commentListEl = footer.querySelector('.comment-list');
  comments.forEach(c => {
    const item = document.createElement('div');
    item.className = 'comment-item';
    item.innerHTML = `<span class="comment-author">${escapeHtml(c.author || '訪客')}:</span><span class="comment-text">${escapeHtml(c.text)}</span>`;
    commentListEl.appendChild(item);
  });

  // 按讚事件
  footer.querySelector('.like-btn').addEventListener('click', () => handleLikePost(post.id));

  // 展開/收合留言區
  const commentsSection = footer.querySelector('.comments-section');
  footer.querySelector('.comment-toggle-btn').addEventListener('click', () => {
    commentsSection.classList.toggle('hidden');
    if (!commentsSection.classList.contains('hidden')) {
      commentsSection.querySelector('input').focus();
    }
  });

  // 提交新留言
  const commentForm = footer.querySelector('.comment-form');
  commentForm.addEventListener('submit', e => {
    e.preventDefault();
    const input = commentForm.querySelector('input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    handleAddComment(post.id, text);
  });

  article.appendChild(footer);
  return article;
}

/**
 * 新增貼文提交處理
 */
async function handleCreatePost(e) {
  e.preventDefault();
  const title = els.postTitle.value.trim();
  if (!title) {
    showToast('請輸入貼文標題');
    return;
  }

  const author = els.postAuthor.value.trim() || '匿名訪客';
  localStorage.setItem(STORAGE_KEYS.LAST_AUTHOR, author);

  const category = els.postCategory.value;
  const content = els.postContent.value.trim();
  const linkUrl = els.postLinkUrl.value.trim();
  const linkTitle = els.postLinkTitle.value.trim();
  const pinned = els.postPinned.checked;

  let imageUrl = '';
  let imageBase64 = '';
  if (state.mediaMode === 'upload' && state.uploadedImageBase64) {
    imageBase64 = state.uploadedImageBase64;
    imageUrl = state.uploadedImageBase64; // 本機預覽或 fallback
  } else if (state.mediaMode === 'url' && els.postImageUrl.value.trim()) {
    imageUrl = els.postImageUrl.value.trim();
  }

  const tempId = 'post_' + Date.now();
  const newPost = {
    id: tempId,
    author,
    title,
    content,
    imageUrl,
    linkUrl: linkUrl ? normalizeUrl(linkUrl) : '',
    linkTitle,
    color: state.selectedColor,
    category,
    likes: 0,
    pinned,
    comments: [],
    createdAt: new Date().toISOString()
  };

  els.submitPostBtn.disabled = true;
  els.submitPostBtn.textContent = '⏳ 發布中...';
  setLoading(true);

  try {
    if (state.gasUrl) {
      const res = await sendGasPost({
        action: 'create',
        ...newPost,
        imageBase64: imageBase64 || '',
        imageName: state.uploadedImageName || '',
        imageMimeType: state.uploadedImageMime || ''
      });
      if (res && res.status === 'ok' && res.post) {
        state.posts.unshift(res.post);
        showToast('✅ 已發布並同步至 Google Sheet！');
      } else {
        throw new Error((res && res.message) || '寫入 Google Sheet 失敗');
      }
    } else {
      state.posts.unshift(newPost);
      showToast('✨ 已發布至塗鴉牆 (本機儲存)');
    }
    localStorage.setItem(STORAGE_KEYS.LOCAL_POSTS, JSON.stringify(state.posts));
    renderPosts();
    closeNewPostModal();
  } catch (err) {
    console.error(err);
    showToast('⚠️ 雲端同步失敗，已先儲存於本機：' + err.message);
    state.posts.unshift(newPost);
    localStorage.setItem(STORAGE_KEYS.LOCAL_POSTS, JSON.stringify(state.posts));
    renderPosts();
    closeNewPostModal();
  } finally {
    els.submitPostBtn.disabled = false;
    els.submitPostBtn.textContent = '🚀 發布貼文';
    setLoading(false);
  }
}

/**
 * 按讚處理
 */
async function handleLikePost(postId) {
  const target = state.posts.find(p => p.id === postId);
  if (!target) return;

  target.likes = Number(target.likes || 0) + 1;
  state.likedPostIds.add(postId);
  localStorage.setItem(STORAGE_KEYS.LIKED_IDS, JSON.stringify([...state.likedPostIds]));
  localStorage.setItem(STORAGE_KEYS.LOCAL_POSTS, JSON.stringify(state.posts));
  renderPosts();

  if (state.gasUrl) {
    try {
      await sendGasPost({ action: 'like', id: postId });
    } catch (err) {
      console.warn('按讚同步失敗', err);
    }
  }
}

/**
 * 置頂切換處理
 */
async function handleTogglePin(postId) {
  const target = state.posts.find(p => p.id === postId);
  if (!target) return;

  target.pinned = !target.pinned;
  localStorage.setItem(STORAGE_KEYS.LOCAL_POSTS, JSON.stringify(state.posts));
  renderPosts();
  showToast(target.pinned ? '📌 已將貼文置頂' : '已取消置頂');

  if (state.gasUrl) {
    try {
      await sendGasPost({ action: 'pin', id: postId });
    } catch (err) {
      console.warn('置頂同步失敗', err);
    }
  }
}

/**
 * 新增卡片下方回覆留言
 */
async function handleAddComment(postId, text) {
  const target = state.posts.find(p => p.id === postId);
  if (!target) return;

  const savedAuthor = localStorage.getItem(STORAGE_KEYS.LAST_AUTHOR) || '訪客';
  const newComment = {
    id: 'c_' + Date.now(),
    author: savedAuthor,
    text,
    createdAt: new Date().toISOString()
  };

  if (!Array.isArray(target.comments)) target.comments = [];
  target.comments.push(newComment);
  localStorage.setItem(STORAGE_KEYS.LOCAL_POSTS, JSON.stringify(state.posts));
  renderPosts();

  if (state.gasUrl) {
    try {
      await sendGasPost({
        action: 'comment',
        id: postId,
        author: savedAuthor,
        text
      });
    } catch (err) {
      console.warn('留言同步失敗', err);
    }
  }
}

/**
 * 刪除貼文處理
 */
async function handleDeletePost(postId) {
  if (!confirm('確定要刪除這則貼文嗎？')) return;

  state.posts = state.posts.filter(p => p.id !== postId);
  localStorage.setItem(STORAGE_KEYS.LOCAL_POSTS, JSON.stringify(state.posts));
  renderPosts();
  showToast('🗑️ 已刪除貼文');

  if (state.gasUrl) {
    try {
      await sendGasPost({ action: 'delete', id: postId });
    } catch (err) {
      console.warn('刪除同步失敗', err);
    }
  }
}

/**
 * 圖片檔案讀取與自動壓縮 (轉成 Base64，確保寫入 Google Drive 或 LocalStorage 快速穩定)
 */
function handleImageFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('⚠️ 請選擇有效的圖片檔案');
    return;
  }

  const reader = new FileReader();
  reader.onload = event => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1280;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      state.uploadedImageBase64 = compressedDataUrl;
      state.uploadedImageName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
      state.uploadedImageMime = 'image/jpeg';

      els.imagePreview.src = compressedDataUrl;
      els.dropZonePrompt.classList.add('hidden');
      els.imagePreviewWrap.classList.remove('hidden');
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

function clearUploadedImage() {
  state.uploadedImageBase64 = '';
  state.uploadedImageName = '';
  state.uploadedImageMime = '';
  els.imageFileInput.value = '';
  els.imagePreview.src = '';
  els.imagePreviewWrap.classList.add('hidden');
  els.dropZonePrompt.classList.remove('hidden');
}

/**
 * 開啟與關閉新增貼文 Modal
 */
function openNewPostModal() {
  const lastAuthor = localStorage.getItem(STORAGE_KEYS.LAST_AUTHOR) || '';
  els.postAuthor.value = lastAuthor;
  if (state.currentCategory !== 'all') {
    els.postCategory.value = state.currentCategory;
  }
  els.postModal.classList.remove('hidden');
  setTimeout(() => els.postTitle.focus(), 80);
}

function closeNewPostModal() {
  els.postModal.classList.add('hidden');
  els.postForm.reset();
  clearUploadedImage();
  selectColorSwatch('white');
}

function selectColorSwatch(color) {
  state.selectedColor = color;
  els.colorPicker.querySelectorAll('.color-swatch').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === color);
  });
}

/**
 * 圖片燈箱預覽
 */
function openLightbox(imgUrl, caption) {
  els.lightboxImg.src = imgUrl;
  els.lightboxCaption.textContent = caption || '';
  els.lightboxModal.classList.remove('hidden');
}

/**
 * 事件綁定
 */
function bindEvents() {
  // 標題與副標題即時儲存
  els.boardTitle.addEventListener('blur', saveBoardMeta);
  els.boardSubtitle.addEventListener('blur', saveBoardMeta);

  // 背景主題切換
  document.querySelectorAll('.bg-dot').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bg-dot').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.body.className = btn.dataset.bg;
      saveBoardMeta();
    });
  });

  // 搜尋與分類篩選
  els.searchInput.addEventListener('input', e => {
    state.searchQuery = e.target.value;
    renderPosts();
  });

  els.categoryTabs.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      els.categoryTabs.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.currentCategory = tab.dataset.category;
      renderPosts();
    });
  });

  // 檢視模式切換 (瀑布流 / 單欄列表)
  document.querySelectorAll('.layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      els.postsContainer.classList.toggle('stream-view', btn.dataset.layout === 'stream');
    });
  });

  // 開啟新增貼文視窗 (右上按鈕、FAB、空狀態按鈕、雙擊畫布)
  els.newPostTopBtn.addEventListener('click', openNewPostModal);
  els.fabAddBtn.addEventListener('click', openNewPostModal);
  els.emptyAddBtn.addEventListener('click', openNewPostModal);
  els.boardCanvas.addEventListener('dblclick', e => {
    if (e.target === els.boardCanvas || e.target === els.postsContainer) {
      openNewPostModal();
    }
  });

  els.closePostModal.addEventListener('click', closeNewPostModal);
  els.cancelPostBtn.addEventListener('click', closeNewPostModal);
  els.postForm.addEventListener('submit', handleCreatePost);

  // 媒體分頁切換 (上傳檔案 vs 圖片網址)
  document.querySelectorAll('.media-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.mediaMode = tab.dataset.tab;
      els.uploadPanel.classList.toggle('hidden', state.mediaMode !== 'upload');
      els.urlPanel.classList.toggle('hidden', state.mediaMode !== 'url');
    });
  });

  // 拖曳上傳、點擊上傳、Ctrl+V 貼上圖片
  els.dropZone.addEventListener('click', e => {
    if (e.target === els.removeImgBtn) return;
    els.imageFileInput.click();
  });

  els.imageFileInput.addEventListener('change', e => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  });

  els.dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    els.dropZone.classList.add('dragover');
  });

  els.dropZone.addEventListener('dragleave', () => {
    els.dropZone.classList.remove('dragover');
  });

  els.dropZone.addEventListener('drop', e => {
    e.preventDefault();
    els.dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  });

  els.removeImgBtn.addEventListener('click', e => {
    e.stopPropagation();
    clearUploadedImage();
  });

  // 全域 Ctrl+V 貼上剪貼簿截圖
  window.addEventListener('paste', e => {
    if (els.postModal.classList.contains('hidden')) return;
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        handleImageFile(file);
        showToast('📷 已從剪貼簿貼上圖片');
        break;
      }
    }
  });

  // 便利貼顏色選擇
  els.colorPicker.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => selectColorSwatch(swatch.dataset.color));
  });

  // 同步按鈕
  els.refreshBtn.addEventListener('click', () => {
    showToast('🔄 正在重新同步塗鴉牆資料...');
    fetchPosts();
  });

  // Google Sheet 設定視窗
  const openSettings = () => {
    els.gasUrlInput.value = state.gasUrl;
    els.testResultMsg.textContent = '';
    els.settingsModal.classList.remove('hidden');
  };
  els.settingsBtn.addEventListener('click', openSettings);
  els.dbStatusBadge.addEventListener('click', openSettings);
  els.closeSettingsModal.addEventListener('click', () => els.settingsModal.classList.add('hidden'));

  // 儲存 Google Sheet Web App URL
  els.saveSettingsBtn.addEventListener('click', () => {
    const url = els.gasUrlInput.value.trim();
    state.gasUrl = url;
    localStorage.setItem(STORAGE_KEYS.GAS_URL, url);
    updateDbBadge();
    els.settingsModal.classList.add('hidden');
    showToast(url ? '✅ 已儲存 Google Sheet 連線設定，正在同步...' : '已切換為本機儲存模式');
    fetchPosts();
  });

  els.clearGasUrlBtn.addEventListener('click', () => {
    els.gasUrlInput.value = '';
    state.gasUrl = '';
    localStorage.removeItem(STORAGE_KEYS.GAS_URL);
    updateDbBadge();
    els.settingsModal.classList.add('hidden');
    showToast('已切換回本機展示模式');
    fetchPosts();
  });

  // 測試連線
  els.testConnectionBtn.addEventListener('click', async () => {
    const url = els.gasUrlInput.value.trim();
    if (!url) {
      els.testResultMsg.style.color = '#e11d48';
      els.testResultMsg.textContent = '請先輸入 Web App URL';
      return;
    }
    els.testResultMsg.style.color = '#475569';
    els.testResultMsg.textContent = '⏳ 測試連線中...';
    try {
      const res = await fetch(url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now());
      const data = await res.json();
      if (data && data.status === 'ok') {
        els.testResultMsg.style.color = '#16a34a';
        els.testResultMsg.textContent = `✅ 連線成功！目前共有 ${data.posts.length} 則雲端貼文`;
      } else {
        throw new Error((data && data.message) || '回應格式異常');
      }
    } catch (err) {
      els.testResultMsg.style.color = '#e11d48';
      els.testResultMsg.textContent = '❌ 連線失敗，請確認部署權限已設為「所有人 (Anyone)」';
    }
  });

  // 匯出 JSON 備份
  els.exportJsonBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.posts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `padlet_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📥 已匯出塗鴉牆 JSON 備份');
  });

  // 一鍵複製 Google Apps Script 程式碼
  els.copyGasCodeBtn.addEventListener('click', async () => {
    try {
      const res = await fetch('google-apps-script.gs');
      const codeText = await res.text();
      await navigator.clipboard.writeText(codeText);
      showToast('📋 已複製 google-apps-script.gs 程式碼！');
    } catch (err) {
      showToast('請直接打開專案資料夾內的 google-apps-script.gs 複製');
    }
  });

  // 關閉燈箱與快捷鍵
  els.closeLightboxBtn.addEventListener('click', () => els.lightboxModal.classList.add('hidden'));
  els.lightboxModal.addEventListener('click', e => {
    if (e.target === els.lightboxModal) els.lightboxModal.classList.add('hidden');
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      els.postModal.classList.add('hidden');
      els.settingsModal.classList.add('hidden');
      els.lightboxModal.classList.add('hidden');
    }
  });
}

/**
 * 工具函式
 */
function normalizeUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return 'https://' + trimmed;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRelativeTime(isoString) {
  if (!isoString) return '剛剛';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '剛剛';
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return '剛剛';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分鐘前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小時前`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)} 天前`;
  return date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
}

document.addEventListener('DOMContentLoaded', init);
