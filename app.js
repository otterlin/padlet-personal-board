/**
 * 個人靈感塗鴉牆 (Padlet Personal Clone)
 * 支援 Google Sheet + Google Drive (透過 Google Apps Script Web App) 作為雲端資料庫
 * 同時提供 LocalStorage 本機模式，開箱即用
 */

const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbw22p1vBhbt1B5vDhoxNOSqYtWj8XMGKG5_QeXC4i9qpQgTSEmDy0Mj_IwOq-A5-Clq/exec';

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
    content: '這是一個數位互動塗鴉牆。\n\n你可以：\n1️⃣ 點擊右下角「＋」或雙擊空白處新增便利貼\n2️⃣ 上傳圖片（或直接 Ctrl+V 貼上截圖）\n3️⃣ 附上外部網站連結\n4️⃣ 對貼文按愛心或展開留言互動！',
    imageUrl: 'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?auto=format&fit=crop&w=900&q=80',
    linkUrl: '',
    linkTitle: '',
    color: 'yellow',
    category: '靈感筆記',
    likes: 12,
    pinned: true,
    comments: [
      { id: 'c1', author: '訪客阿凱', text: '介面超像 Padlet！分享作品很方便～', createdAt: new Date().toISOString() }
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
  gasUrl: localStorage.getItem(STORAGE_KEYS.GAS_URL) || DEFAULT_GAS_URL,
  posts: [],
  currentCategory: 'all',
  searchQuery: '',
  selectedColor: 'white',
  mediaMode: 'upload', // 'upload' | 'url'
  uploadedImageBase64: '',
  uploadedImageName: '',
  uploadedImageMime: '',
  likedPostIds: new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.LIKED_IDS) || '[]')),
  boardSettings: {
    allowPosting: true,
    requireApproval: false,
    allowComments: true,
    announcement: ''
  },
  slideshow: {
    active: false,
    list: [],
    index: 0,
    autoPlay: true,
    intervalMs: 5000,
    orientation: 'landscape', // 'landscape' | 'portrait'
    timerId: null,
    progressTimerId: null,
    elapsedMs: 0
  }
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
  // 播放模式 (Slideshow)
  playModeBtn: document.getElementById('playModeBtn'),
  slideshowModal: document.getElementById('slideshowModal'),
  slideshowTimerBar: document.getElementById('slideshowTimerBar'),
  slideCounterBadge: document.getElementById('slideCounterBadge'),
  slideBoardName: document.getElementById('slideBoardName'),
  slideOrientLandscapeBtn: document.getElementById('slideOrientLandscapeBtn'),
  slideOrientPortraitBtn: document.getElementById('slideOrientPortraitBtn'),
  slideAutoPlayBtn: document.getElementById('slideAutoPlayBtn'),
  slideAutoPlayText: document.getElementById('slideAutoPlayText'),
  slideIntervalSelect: document.getElementById('slideIntervalSelect'),
  slideFullscreenBtn: document.getElementById('slideFullscreenBtn'),
  closeSlideshowBtn: document.getElementById('closeSlideshowBtn'),
  slidePrevBtn: document.getElementById('slidePrevBtn'),
  slideNextBtn: document.getElementById('slideNextBtn'),
  slideCardContainer: document.getElementById('slideCardContainer'),
  slideDotsContainer: document.getElementById('slideDotsContainer'),
  toastContainer: document.getElementById('toastContainer')
};

/**
 * 初始化應用程式
 */
function init() {
  loadBoardMeta();
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
    applyBoardSettings(meta);
  } catch (err) {
    console.warn('無法載入版面設定', err);
  }
}

function applyBoardSettings(meta) {
  if (!meta) return;
  const title = meta.boardTitle || meta.title;
  let subtitle = meta.boardSubtitle !== undefined ? meta.boardSubtitle : meta.subtitle;
  if (subtitle === '隨時記錄靈感、分享圖片與好站連結 — 支援 Google Sheet 雲端同步') {
    subtitle = '隨時記錄靈感、分享圖片與好站連結';
  }
  const bg = meta.boardBg || meta.bg;

  if (title) els.boardTitle.textContent = title;
  if (subtitle !== undefined) els.boardSubtitle.textContent = subtitle;
  if (bg) {
    document.body.className = bg;
    document.querySelectorAll('.bg-dot').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.bg === bg);
    });
  }

  if (meta.allowPosting !== undefined) state.boardSettings.allowPosting = Boolean(meta.allowPosting);
  if (meta.requireApproval !== undefined) state.boardSettings.requireApproval = Boolean(meta.requireApproval);
  if (meta.allowComments !== undefined) state.boardSettings.allowComments = Boolean(meta.allowComments);
  if (meta.announcement !== undefined) state.boardSettings.announcement = String(meta.announcement || '');

  // 顯示或隱藏頂部公告橫幅
  const annBanner = document.getElementById('announcementBanner');
  const annText = document.getElementById('announcementText');
  if (annBanner && annText) {
    if (state.boardSettings.announcement.trim()) {
      annText.textContent = state.boardSettings.announcement;
      annBanner.classList.remove('hidden');
    } else {
      annBanner.classList.add('hidden');
    }
  }

  // 控制是否開放訪客新增貼文
  const allowPost = state.boardSettings.allowPosting;
  els.newPostTopBtn.classList.toggle('hidden', !allowPost);
  els.fabAddBtn.classList.toggle('hidden', !allowPost);
}

function saveBoardMeta() {
  const activeBgBtn = document.querySelector('.bg-dot.active');
  const meta = {
    title: els.boardTitle.textContent.trim() || '我的個人靈感塗鴉牆',
    subtitle: els.boardSubtitle.textContent.trim() || '',
    bg: activeBgBtn ? activeBgBtn.dataset.bg : 'bg-cork',
    announcement: state.boardSettings.announcement,
    allowPosting: state.boardSettings.allowPosting,
    requireApproval: state.boardSettings.requireApproval,
    allowComments: state.boardSettings.allowComments
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
        if (data.settings) {
          applyBoardSettings(data.settings);
          saveBoardMeta();
        }
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
    showToast('⚠️ 暫時無法連線至雲端，顯示本機快取資料');
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
  // 僅顯示已公開 (approved 或未設定 status) 的貼文
  const visiblePosts = state.posts.filter(p => !p.status || p.status === 'approved');

  // 排序：置頂優先，其次依時間新到舊
  const sorted = [...visiblePosts].sort((a, b) => {
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
  const hasImgClass = post.imageUrl ? 'has-image' : '';
  article.className = `padlet-card ${colorClass} ${hasImgClass}`.trim();
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
      <button class="pin-btn play-from-here-btn" title="從此貼文開始簡報播放">
        ▶️
      </button>
      <button class="pin-btn ${post.pinned ? 'pinned' : ''}" title="${post.pinned ? '取消置頂' : '置頂貼文'}">
        📌
      </button>
      <button class="delete-btn" title="刪除貼文">🗑️</button>
    </div>
  `;

  // 綁定單卡播放、置頂與刪除事件
  topBar.querySelector('.play-from-here-btn').addEventListener('click', () => openSlideshow(post.id));
  topBar.querySelectorAll('.pin-btn')[1].addEventListener('click', () => handleTogglePin(post.id));
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
 * 新增貼文提交處理 (支援免審核直接發布、免填標題自動產生標題)
 */
async function handleCreatePost(e) {
  if (e && e.preventDefault) e.preventDefault();

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

  // 若未填寫標題，自動依據內容、連結、圖片檔名或分類產生標題
  let title = els.postTitle.value.trim();
  if (!title) {
    if (content) {
      title = content.split('\n')[0].slice(0, 28);
    } else if (linkTitle) {
      title = linkTitle;
    } else if (state.uploadedImageName) {
      title = state.uploadedImageName.replace(/\.[^.]+$/, '');
    } else if (imageUrl) {
      title = `${author} 的圖片分享`;
    } else if (linkUrl) {
      title = `${author} 的連結分享`;
    } else {
      showToast('請輸入內容、標題，或上傳一張圖片');
      return;
    }
  }

  const tempId = 'post_' + Date.now();
  // 預設自動直接公開 Po 文 (除非後臺明確開啟 requireApproval)
  const initialStatus = state.boardSettings.requireApproval === true ? 'pending' : 'approved';
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
    createdAt: new Date().toISOString(),
    status: initialStatus
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
        showToast(
          res.post.status === 'pending'
            ? '⏳ 貼文已送出，待管理員於後臺審核通過後即會公開顯示！'
            : '✅ 貼文已成功發布！'
        );
      } else {
        throw new Error((res && res.message) || '寫入雲端失敗');
      }
    } else {
      state.posts.unshift(newPost);
      showToast(
        initialStatus === 'pending'
          ? '⏳ 貼文已送出，請至後臺管理系統核准後公開！'
          : '✨ 已發布至塗鴉牆 (本機儲存)'
      );
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

      // 若開啟「預設自動立即Po文」，選完圖片後自動發布上牆
      const autoPublishToggle = document.getElementById('autoPublishToggle');
      if (autoPublishToggle && autoPublishToggle.checked) {
        handleCreatePost();
      }
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
 * 全螢幕簡報播放模式 (Padlet Slideshow Mode)
 */
function getVisibleFilteredPosts() {
  const visiblePosts = state.posts.filter(p => !p.status || p.status === 'approved');
  const sorted = [...visiblePosts].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const query = state.searchQuery.trim().toLowerCase();
  return sorted.filter(post => {
    const matchCat = state.currentCategory === 'all' || post.category === state.currentCategory;
    if (!matchCat) return false;
    if (!query) return true;
    const haystack = [post.title, post.content, post.author, post.category, post.linkTitle, post.linkUrl]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

function openSlideshow(startPostId = null) {
  const list = getVisibleFilteredPosts();
  if (list.length === 0) {
    showToast('⚠️ 目前沒有可播放的貼文');
    return;
  }

  state.slideshow.list = list;
  let startIdx = 0;
  if (startPostId) {
    const foundIdx = list.findIndex(p => p.id === startPostId);
    if (foundIdx !== -1) startIdx = foundIdx;
  }
  state.slideshow.index = startIdx;
  state.slideshow.active = true;
  state.slideshow.autoPlay = true;
  state.slideshow.intervalMs = Number(els.slideIntervalSelect.value || 5000);

  els.slideBoardName.textContent = els.boardTitle.textContent.trim() || '我的個人靈感塗鴉牆';
  els.slideshowModal.classList.remove('hidden');
  updateAutoPlayButtonUI();
  renderCurrentSlide();
  startSlideshowTimer();
}

function closeSlideshow() {
  state.slideshow.active = false;
  stopSlideshowTimer();
  els.slideshowModal.classList.add('hidden');
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

function renderCurrentSlide() {
  const { list, index } = state.slideshow;
  if (!list.length) return;
  const post = list[index];

  els.slideCounterBadge.textContent = `${index + 1} / ${list.length}`;

  // 渲染底部圓點
  els.slideDotsContainer.innerHTML = '';
  list.forEach((_, idx) => {
    const dot = document.createElement('button');
    dot.className = `slide-dot ${idx === index ? 'active' : ''}`;
    dot.title = `跳至第 ${idx + 1} 則`;
    dot.addEventListener('click', () => {
      state.slideshow.index = idx;
      renderCurrentSlide();
      resetSlideshowTimer();
    });
    els.slideDotsContainer.appendChild(dot);
  });

  const authorName = post.author || '匿名訪客';
  const avatarChar = authorName.trim().charAt(0).toUpperCase();
  const formattedTime = formatRelativeTime(post.createdAt);
  const hasImage = Boolean(post.imageUrl);
  const comments = Array.isArray(post.comments) ? post.comments : [];

  let linkHtml = '';
  if (post.linkUrl) {
    const safeUrl = normalizeUrl(post.linkUrl);
    let domain = safeUrl;
    try {
      domain = new URL(safeUrl).hostname;
    } catch (e) {}
    linkHtml = `
      <a class="card-link-box" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" style="margin-bottom: 18px;">
        <div class="link-icon-badge">🔗</div>
        <div class="link-details">
          <div class="link-title">${escapeHtml(post.linkTitle || domain)}</div>
          <div class="link-domain">${escapeHtml(safeUrl)}</div>
        </div>
        <span>↗</span>
      </a>
    `;
  }

  let commentsHtml = '';
  if (comments.length > 0) {
    const latestComments = comments.slice(-3);
    commentsHtml = `
      <div class="slide-comments-preview">
        ${latestComments
          .map(
            c =>
              `<div class="slide-comment-bubble"><strong>${escapeHtml(c.author || '訪客')}:</strong> ${escapeHtml(c.text)}</div>`
          )
          .join('')}
      </div>
    `;
  }

  const orientClass = `orient-${state.slideshow.orientation || 'landscape'}`;

  els.slideCardContainer.innerHTML = `
    <div class="slide-showcase-card ${orientClass} color-${escapeHtml(post.color || 'white')} ${hasImage ? '' : 'no-image'}">
      ${
        hasImage
          ? `<div class="slide-media-col">
               <img src="${escapeHtml(post.imageUrl)}" alt="${escapeHtml(post.title)}" />
             </div>`
          : ''
      }
      <div class="slide-content-col">
        <div>
          <div class="slide-header-meta">
            <div class="slide-author-box">
              <div class="slide-avatar">${escapeHtml(avatarChar)}</div>
              <div>
                <div class="slide-author-name">${escapeHtml(authorName)}</div>
                <div class="slide-time">${escapeHtml(formattedTime)}</div>
              </div>
            </div>
            <span class="slide-category-badge">${post.pinned ? '📌 ' : ''}${escapeHtml(post.category || '一般')}</span>
          </div>

          <h2 class="slide-title">${escapeHtml(post.title || '')}</h2>
          ${post.content ? `<div class="slide-text">${escapeHtml(post.content)}</div>` : ''}
          ${linkHtml}
        </div>

        <div>
          <div class="slide-footer-stats">
            <div class="slide-stat-pills">
              <span>❤️ ${Number(post.likes || 0)} 個愛心</span>
              <span>💬 ${comments.length} 則留言</span>
            </div>
          </div>
          ${commentsHtml}
        </div>
      </div>
    </div>
  `;
}

function nextSlide() {
  if (!state.slideshow.list.length) return;
  state.slideshow.index = (state.slideshow.index + 1) % state.slideshow.list.length;
  renderCurrentSlide();
  resetSlideshowTimer();
}

function prevSlide() {
  if (!state.slideshow.list.length) return;
  state.slideshow.index = (state.slideshow.index - 1 + state.slideshow.list.length) % state.slideshow.list.length;
  renderCurrentSlide();
  resetSlideshowTimer();
}

function startSlideshowTimer() {
  stopSlideshowTimer();
  if (!state.slideshow.autoPlay) {
    els.slideshowTimerBar.style.width = '0%';
    return;
  }
  state.slideshow.elapsedMs = 0;
  const stepMs = 100;
  state.slideshow.progressTimerId = setInterval(() => {
    state.slideshow.elapsedMs += stepMs;
    const pct = Math.min(100, (state.slideshow.elapsedMs / state.slideshow.intervalMs) * 100);
    els.slideshowTimerBar.style.width = `${pct}%`;
    if (state.slideshow.elapsedMs >= state.slideshow.intervalMs) {
      nextSlide();
    }
  }, stepMs);
}

function stopSlideshowTimer() {
  if (state.slideshow.progressTimerId) {
    clearInterval(state.slideshow.progressTimerId);
    state.slideshow.progressTimerId = null;
  }
}

function resetSlideshowTimer() {
  if (state.slideshow.autoPlay) {
    startSlideshowTimer();
  }
}

function toggleSlideshowAutoPlay() {
  state.slideshow.autoPlay = !state.slideshow.autoPlay;
  updateAutoPlayButtonUI();
  if (state.slideshow.autoPlay) {
    startSlideshowTimer();
  } else {
    stopSlideshowTimer();
  }
}

function updateAutoPlayButtonUI() {
  if (state.slideshow.autoPlay) {
    els.slideAutoPlayBtn.innerHTML = '⏸️ <span>自動輪播中</span>';
    els.slideAutoPlayBtn.classList.add('active-autoplay');
  } else {
    els.slideAutoPlayBtn.innerHTML = '▶️ <span>已暫停輪播</span>';
    els.slideAutoPlayBtn.classList.remove('active-autoplay');
  }
}

function toggleSlideshowFullscreen() {
  if (!document.fullscreenElement) {
    els.slideshowModal.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function setSlideshowOrientation(orient) {
  state.slideshow.orientation = orient;
  if (els.slideOrientLandscapeBtn && els.slideOrientPortraitBtn) {
    els.slideOrientLandscapeBtn.classList.toggle('active-orient', orient === 'landscape');
    els.slideOrientPortraitBtn.classList.toggle('active-orient', orient === 'portrait');
  }
  if (state.slideshow.active) {
    renderCurrentSlide();
  }
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

  // 檢視模式切換 (直式瀑布流 / 橫式並排卡片 / 單欄列表)
  document.querySelectorAll('.layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const layout = btn.dataset.layout;
      els.postsContainer.classList.toggle('landscape-view', layout === 'landscape');
      els.postsContainer.classList.toggle('stream-view', layout === 'stream');
      // 同步播放模式的預設直式/橫式方向
      if (layout === 'portrait' || layout === 'landscape') {
        setSlideshowOrientation(layout);
      }
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

  // 全域 Ctrl+V 貼上剪貼簿截圖 或 全域拖曳圖片直接自動 Po 文
  window.addEventListener('paste', e => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (els.postModal.classList.contains('hidden')) {
          openNewPostModal();
        }
        handleImageFile(file);
        showToast('📷 已貼上圖片並自動發布中...');
        break;
      }
    }
  });

  // 支援直接把圖片拖曳到塗鴉牆畫布上就自動立即 Po 文
  window.addEventListener('dragover', e => {
    e.preventDefault();
  });

  window.addEventListener('drop', e => {
    if (!els.postModal.classList.contains('hidden')) return;
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        e.preventDefault();
        openNewPostModal();
        handleImageFile(file);
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

  // 播放模式事件綁定
  els.playModeBtn.addEventListener('click', () => openSlideshow());
  els.closeSlideshowBtn.addEventListener('click', closeSlideshow);
  els.slideNextBtn.addEventListener('click', nextSlide);
  els.slidePrevBtn.addEventListener('click', prevSlide);
  els.slideAutoPlayBtn.addEventListener('click', toggleSlideshowAutoPlay);
  els.slideFullscreenBtn.addEventListener('click', toggleSlideshowFullscreen);
  if (els.slideOrientLandscapeBtn) {
    els.slideOrientLandscapeBtn.addEventListener('click', () => setSlideshowOrientation('landscape'));
  }
  if (els.slideOrientPortraitBtn) {
    els.slideOrientPortraitBtn.addEventListener('click', () => setSlideshowOrientation('portrait'));
  }
  els.slideIntervalSelect.addEventListener('change', e => {
    state.slideshow.intervalMs = Number(e.target.value || 5000);
    resetSlideshowTimer();
  });

  // 關閉燈箱與快捷鍵
  els.closeLightboxBtn.addEventListener('click', () => els.lightboxModal.classList.add('hidden'));
  els.lightboxModal.addEventListener('click', e => {
    if (e.target === els.lightboxModal) els.lightboxModal.classList.add('hidden');
  });

  window.addEventListener('keydown', e => {
    if (state.slideshow.active) {
      if (e.key === 'Escape') {
        closeSlideshow();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextSlide();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevSlide();
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        toggleSlideshowAutoPlay();
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleSlideshowFullscreen();
        return;
      }
    }

    if (e.key === 'Escape') {
      els.postModal.classList.add('hidden');
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
