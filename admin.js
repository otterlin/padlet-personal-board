/**
 * 個人靈感塗鴉牆 - 後臺管理系統 (admin.js)
 * 支援貼文審核、完整編輯、批次管理、留言管理、統計圖表、CSV/JSON 匯出與 Google Sheet 同步
 */

const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbw22p1vBhbt1B5vDhoxNOSqYtWj8XMGKG5_QeXC4i9qpQgTSEmDy0Mj_IwOq-A5-Clq/exec';

const STORAGE_KEYS = {
  GAS_URL: 'padlet_personal_gas_url',
  LOCAL_POSTS: 'padlet_personal_local_posts',
  BOARD_META: 'padlet_personal_board_meta',
  ADMIN_PIN: 'padlet_personal_admin_pin',
  ADMIN_SESSION: 'padlet_personal_admin_unlocked'
};

const COLOR_NAMES = {
  white: '純淨白',
  yellow: '暖陽黃',
  pink: '櫻花粉',
  blue: '晴空藍',
  green: '薄荷綠',
  purple: '薰衣草紫'
};

const state = {
  gasUrl: localStorage.getItem(STORAGE_KEYS.GAS_URL) || DEFAULT_GAS_URL,
  posts: [],
  selectedIds: new Set(),
  searchQuery: '',
  statusFilter: 'all',
  categoryFilter: 'all',
  editUploadedBase64: '',
  editUploadedName: '',
  boardSettings: {
    boardTitle: '我的個人靈感塗鴉牆',
    boardSubtitle: '隨時記錄靈感、分享圖片與好站連結',
    boardBg: 'bg-cork',
    announcement: '',
    allowPosting: true,
    requireApproval: false,
    allowComments: true
  }
};

const els = {
  loginOverlay: document.getElementById('loginOverlay'),
  loginForm: document.getElementById('loginForm'),
  adminPinInput: document.getElementById('adminPinInput'),
  loginError: document.getElementById('loginError'),
  adminApp: document.getElementById('adminApp'),
  logoutBtn: document.getElementById('logoutBtn'),
  adminDbBadge: document.getElementById('adminDbBadge'),
  navPendingBadge: document.getElementById('navPendingBadge'),
  sectionTitle: document.getElementById('sectionTitle'),
  adminRefreshBtn: document.getElementById('adminRefreshBtn'),
  adminNewPostBtn: document.getElementById('adminNewPostBtn'),
  adminLoadingBar: document.getElementById('adminLoadingBar'),
  // KPIs
  kpiTotalPosts: document.getElementById('kpiTotalPosts'),
  kpiPendingPosts: document.getElementById('kpiPendingPosts'),
  kpiTotalLikes: document.getElementById('kpiTotalLikes'),
  kpiTotalComments: document.getElementById('kpiTotalComments'),
  // Posts table
  adminSearchInput: document.getElementById('adminSearchInput'),
  adminStatusFilter: document.getElementById('adminStatusFilter'),
  adminCategoryFilter: document.getElementById('adminCategoryFilter'),
  selectedCount: document.getElementById('selectedCount'),
  batchApproveBtn: document.getElementById('batchApproveBtn'),
  batchHideBtn: document.getElementById('batchHideBtn'),
  batchDeleteBtn: document.getElementById('batchDeleteBtn'),
  selectAllCheckbox: document.getElementById('selectAllCheckbox'),
  adminPostsTbody: document.getElementById('adminPostsTbody'),
  // Comments table
  adminCommentsTbody: document.getElementById('adminCommentsTbody'),
  // Analytics
  categoryChartContainer: document.getElementById('categoryChartContainer'),
  topPostsList: document.getElementById('topPostsList'),
  topAuthorsList: document.getElementById('topAuthorsList'),
  colorChartContainer: document.getElementById('colorChartContainer'),
  // Settings form
  boardSettingsForm: document.getElementById('boardSettingsForm'),
  cfgBoardTitle: document.getElementById('cfgBoardTitle'),
  cfgBoardBg: document.getElementById('cfgBoardBg'),
  cfgBoardSubtitle: document.getElementById('cfgBoardSubtitle'),
  cfgAnnouncement: document.getElementById('cfgAnnouncement'),
  cfgAllowPosting: document.getElementById('cfgAllowPosting'),
  cfgRequireApproval: document.getElementById('cfgRequireApproval'),
  cfgAllowComments: document.getElementById('cfgAllowComments'),
  cfgNewPin: document.getElementById('cfgNewPin'),
  // Database
  adminGasUrlInput: document.getElementById('adminGasUrlInput'),
  adminTestGasBtn: document.getElementById('adminTestGasBtn'),
  adminSaveGasBtn: document.getElementById('adminSaveGasBtn'),
  adminGasTestMsg: document.getElementById('adminGasTestMsg'),
  exportCsvBtn: document.getElementById('exportCsvBtn'),
  adminExportJsonBtn: document.getElementById('adminExportJsonBtn'),
  importJsonFile: document.getElementById('importJsonFile'),
  importJsonBtn: document.getElementById('importJsonBtn'),
  adminCopyGasBtn: document.getElementById('adminCopyGasBtn'),
  // Edit modal
  editPostModal: document.getElementById('editPostModal'),
  editModalTitle: document.getElementById('editModalTitle'),
  closeEditModal: document.getElementById('closeEditModal'),
  cancelEditBtn: document.getElementById('cancelEditBtn'),
  editPostForm: document.getElementById('editPostForm'),
  editPostId: document.getElementById('editPostId'),
  editAuthor: document.getElementById('editAuthor'),
  editStatus: document.getElementById('editStatus'),
  editCategory: document.getElementById('editCategory'),
  editColor: document.getElementById('editColor'),
  editTitle: document.getElementById('editTitle'),
  editContent: document.getElementById('editContent'),
  editImageUrl: document.getElementById('editImageUrl'),
  editImageFile: document.getElementById('editImageFile'),
  editLinkUrl: document.getElementById('editLinkUrl'),
  editLinkTitle: document.getElementById('editLinkTitle'),
  editLikes: document.getElementById('editLikes'),
  editPinned: document.getElementById('editPinned'),
  saveEditBtn: document.getElementById('saveEditBtn'),
  toastContainer: document.getElementById('toastContainer')
};

function initAdmin() {
  bindAuthEvents();
  bindNavigationEvents();
  bindTableEvents();
  bindSettingsAndDbEvents();

  if (sessionStorage.getItem(STORAGE_KEYS.ADMIN_SESSION) === 'true') {
    unlockDashboard();
  }
}

function getSavedPin() {
  return localStorage.getItem(STORAGE_KEYS.ADMIN_PIN) || '1234';
}

function bindAuthEvents() {
  els.loginForm.addEventListener('submit', e => {
    e.preventDefault();
    const inputPin = els.adminPinInput.value.trim();
    if (inputPin === getSavedPin()) {
      sessionStorage.setItem(STORAGE_KEYS.ADMIN_SESSION, 'true');
      els.loginError.classList.add('hidden');
      unlockDashboard();
    } else {
      els.loginError.classList.remove('hidden');
      els.adminPinInput.select();
    }
  });

  els.logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem(STORAGE_KEYS.ADMIN_SESSION);
    els.adminApp.classList.add('hidden');
    els.loginOverlay.classList.remove('hidden');
    els.adminPinInput.value = '';
  });
}

function unlockDashboard() {
  els.loginOverlay.classList.add('hidden');
  els.adminApp.classList.remove('hidden');
  updateDbStatusUI();
  loadLocalSettings();
  fetchAllData();
}

function updateDbStatusUI() {
  els.adminGasUrlInput.value = state.gasUrl;
  if (state.gasUrl) {
    els.adminDbBadge.textContent = '🟢 Google Sheet 已連線';
    els.adminDbBadge.classList.add('connected');
  } else {
    els.adminDbBadge.textContent = '⚪ 本機儲存模式';
    els.adminDbBadge.classList.remove('connected');
  }
}

function loadLocalSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BOARD_META);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.boardSettings = {
        ...state.boardSettings,
        boardTitle: parsed.title || state.boardSettings.boardTitle,
        boardSubtitle: parsed.subtitle || state.boardSettings.boardSubtitle,
        boardBg: parsed.bg || state.boardSettings.boardBg,
        announcement: parsed.announcement || '',
        allowPosting: parsed.allowPosting !== undefined ? parsed.allowPosting : true,
        requireApproval: parsed.requireApproval !== undefined ? parsed.requireApproval : false,
        allowComments: parsed.allowComments !== undefined ? parsed.allowComments : true
      };
    }
  } catch (e) {}
  populateSettingsForm();
}

function populateSettingsForm() {
  const s = state.boardSettings;
  els.cfgBoardTitle.value = s.boardTitle || '';
  els.cfgBoardSubtitle.value = s.boardSubtitle || '';
  els.cfgBoardBg.value = s.boardBg || 'bg-cork';
  els.cfgAnnouncement.value = s.announcement || '';
  els.cfgAllowPosting.checked = Boolean(s.allowPosting);
  els.cfgRequireApproval.checked = Boolean(s.requireApproval);
  els.cfgAllowComments.checked = Boolean(s.allowComments);
}

function setLoading(loading) {
  els.adminLoadingBar.classList.toggle('hidden', !loading);
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  els.toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

async function sendGasPost(payload) {
  const res = await fetch(state.gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

async function fetchAllData() {
  setLoading(true);
  try {
    if (state.gasUrl) {
      const url = state.gasUrl + (state.gasUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
      const res = await fetch(url);
      const data = await res.json();
      if (data && data.status === 'ok' && Array.isArray(data.posts)) {
        state.posts = data.posts.map(p => ({ ...p, status: p.status || 'approved' }));
        localStorage.setItem(STORAGE_KEYS.LOCAL_POSTS, JSON.stringify(state.posts));
        if (data.settings) {
          state.boardSettings = { ...state.boardSettings, ...data.settings };
          saveMetaToLocal(state.boardSettings);
          populateSettingsForm();
        }
      }
    } else {
      const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_POSTS);
      state.posts = raw ? JSON.parse(raw).map(p => ({ ...p, status: p.status || 'approved' })) : [];
    }
  } catch (err) {
    console.warn('讀取雲端失敗，使用本機快取:', err);
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_POSTS);
    state.posts = raw ? JSON.parse(raw).map(p => ({ ...p, status: p.status || 'approved' })) : [];
  } finally {
    setLoading(false);
    refreshAllViews();
  }
}

function saveMetaToLocal(s) {
  const meta = {
    title: s.boardTitle,
    subtitle: s.boardSubtitle,
    bg: s.boardBg,
    announcement: s.announcement,
    allowPosting: s.allowPosting,
    requireApproval: s.requireApproval,
    allowComments: s.allowComments
  };
  localStorage.setItem(STORAGE_KEYS.BOARD_META, JSON.stringify(meta));
}

function savePostsToLocal() {
  localStorage.setItem(STORAGE_KEYS.LOCAL_POSTS, JSON.stringify(state.posts));
}

function refreshAllViews() {
  updateKPIs();
  renderPostsTable();
  renderCommentsTable();
  renderAnalytics();
}

function updateKPIs() {
  const total = state.posts.length;
  const pending = state.posts.filter(p => p.status === 'pending').length;
  const likes = state.posts.reduce((acc, p) => acc + Number(p.likes || 0), 0);
  const comments = state.posts.reduce((acc, p) => acc + (Array.isArray(p.comments) ? p.comments.length : 0), 0);

  els.kpiTotalPosts.textContent = total;
  els.kpiPendingPosts.textContent = pending;
  els.kpiTotalLikes.textContent = likes;
  els.kpiTotalComments.textContent = comments;
  els.navPendingBadge.textContent = pending;
  els.navPendingBadge.classList.toggle('has-pending', pending > 0);
}

/**
 * 渲染貼文管理列表
 */
function getFilteredPosts() {
  const q = state.searchQuery.trim().toLowerCase();
  return state.posts.filter(p => {
    const st = p.status || 'approved';
    if (state.statusFilter !== 'all' && st !== state.statusFilter) return false;
    if (state.categoryFilter !== 'all' && p.category !== state.categoryFilter) return false;
    if (!q) return true;
    const text = [p.title, p.content, p.author, p.category, p.linkTitle].filter(Boolean).join(' ').toLowerCase();
    return text.includes(q);
  });
}

function renderPostsTable() {
  const filtered = getFilteredPosts();
  els.adminPostsTbody.innerHTML = '';

  // 清除已不存在的選取項目
  const validIds = new Set(state.posts.map(p => p.id));
  for (const id of state.selectedIds) {
    if (!validIds.has(id)) state.selectedIds.delete(id);
  }
  els.selectedCount.textContent = state.selectedIds.size;

  if (filtered.length === 0) {
    els.adminPostsTbody.innerHTML = `<tr><td colspan="9" class="empty-table-cell">目前沒有符合篩選條件的貼文</td></tr>`;
    return;
  }

  filtered.forEach(post => {
    const tr = document.createElement('tr');
    const st = post.status || 'approved';
    const isChecked = state.selectedIds.has(post.id);
    const commentsCount = Array.isArray(post.comments) ? post.comments.length : 0;

    let statusBadgeHtml = '<span class="status-pill status-approved">✅ 已公開</span>';
    if (st === 'pending') statusBadgeHtml = '<span class="status-pill status-pending">⏳ 待審核</span>';
    if (st === 'hidden') statusBadgeHtml = '<span class="status-pill status-hidden">👁️‍🗨️ 已隱藏</span>';

    let thumbHtml = '<span class="no-media">無附件</span>';
    if (post.imageUrl) {
      thumbHtml = `<img src="${escapeHtml(post.imageUrl)}" class="table-thumb" alt="預覽" />`;
    } else if (post.linkUrl) {
      thumbHtml = `<a href="${escapeHtml(post.linkUrl)}" target="_blank" class="table-link-chip">🔗 連結↗</a>`;
    }

    tr.innerHTML = `
      <td><input type="checkbox" class="row-checkbox" data-id="${escapeHtml(post.id)}" ${isChecked ? 'checked' : ''} /></td>
      <td>${statusBadgeHtml}</td>
      <td>${thumbHtml}</td>
      <td>
        <div class="table-post-title">
          ${post.pinned ? '<span class="pin-tag" title="置頂中">📌</span>' : ''}
          <strong>${escapeHtml(post.title || '(無標題)')}</strong>
        </div>
        <div class="table-post-excerpt">${escapeHtml(post.content || '')}</div>
      </td>
      <td><span class="table-author">${escapeHtml(post.author || '匿名訪客')}</span></td>
      <td>
        <div class="table-cat">${escapeHtml(post.category || '一般')}</div>
        <span class="color-dot-mini swatch-${escapeHtml(post.color || 'white')}"></span>
        <small>${COLOR_NAMES[post.color] || '白'}</small>
      </td>
      <td>
        <div>❤️ ${Number(post.likes || 0)}</div>
        <div>💬 ${commentsCount}</div>
      </td>
      <td><small>${formatDateTime(post.createdAt)}</small></td>
      <td>
        <div class="row-actions">
          ${st !== 'approved' ? `<button class="btn-action approve" data-action="approve" title="核准公開">✅</button>` : ''}
          ${st !== 'hidden' ? `<button class="btn-action hide" data-action="hide" title="設為隱藏">👁️‍🗨️</button>` : ''}
          <button class="btn-action pin" data-action="pin" title="${post.pinned ? '取消置頂' : '設為置頂'}">📌</button>
          <button class="btn-action edit" data-action="edit" title="編輯內容">✏️</button>
          <button class="btn-action delete" data-action="delete" title="永久刪除">🗑️</button>
        </div>
      </td>
    `;

    const cb = tr.querySelector('.row-checkbox');
    cb.addEventListener('change', () => {
      if (cb.checked) state.selectedIds.add(post.id);
      else state.selectedIds.delete(post.id);
      els.selectedCount.textContent = state.selectedIds.size;
    });

    tr.querySelectorAll('.btn-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.action;
        if (act === 'approve') updatePostStatus(post.id, 'approved');
        if (act === 'hide') updatePostStatus(post.id, 'hidden');
        if (act === 'pin') togglePostPin(post.id);
        if (act === 'edit') openEditModal(post);
        if (act === 'delete') deleteSinglePost(post.id);
      });
    });

    els.adminPostsTbody.appendChild(tr);
  });
}

/**
 * 渲染留言管理列表
 */
function renderCommentsTable() {
  els.adminCommentsTbody.innerHTML = '';
  const allComments = [];
  state.posts.forEach(p => {
    if (Array.isArray(p.comments)) {
      p.comments.forEach(c => {
        allComments.push({
          ...c,
          postId: p.id,
          postTitle: p.title
        });
      });
    }
  });

  allComments.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  if (allComments.length === 0) {
    els.adminCommentsTbody.innerHTML = `<tr><td colspan="5" class="empty-table-cell">目前尚無任何訪客留言</td></tr>`;
    return;
  }

  allComments.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(item.author || '訪客')}</strong></td>
      <td>${escapeHtml(item.text || '')}</td>
      <td><span class="text-muted">${escapeHtml(item.postTitle || '')}</span></td>
      <td><small>${formatDateTime(item.createdAt)}</small></td>
      <td>
        <button class="btn btn-sm btn-danger">🗑️ 刪除</button>
      </td>
    `;
    tr.querySelector('button').addEventListener('click', () => deleteComment(item.postId, item.id));
    els.adminCommentsTbody.appendChild(tr);
  });
}

/**
 * 渲染數據統計分析
 */
function renderAnalytics() {
  const total = Math.max(1, state.posts.length);

  // 1. 分類統計
  const catCounts = {};
  state.posts.forEach(p => {
    const c = p.category || '未分類';
    catCounts[c] = (catCounts[c] || 0) + 1;
  });
  els.categoryChartContainer.innerHTML = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, cnt]) => {
      const pct = Math.round((cnt / total) * 100);
      return `
        <div class="bar-row">
          <div class="bar-label"><span>${escapeHtml(cat)}</span><strong>${cnt} 篇 (${pct}%)</strong></div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    })
    .join('') || '<p class="text-muted">尚無資料</p>';

  // 2. 熱門貼文排行
  const rankedPosts = [...state.posts]
    .sort((a, b) => {
      const scoreA = Number(a.likes || 0) * 2 + (Array.isArray(a.comments) ? a.comments.length : 0);
      const scoreB = Number(b.likes || 0) * 2 + (Array.isArray(b.comments) ? b.comments.length : 0);
      return scoreB - scoreA;
    })
    .slice(0, 5);

  els.topPostsList.innerHTML = rankedPosts
    .map((p, idx) => `
      <div class="rank-item">
        <span class="rank-num">#${idx + 1}</span>
        <div class="rank-info">
          <strong>${escapeHtml(p.title)}</strong>
          <small>作者：${escapeHtml(p.author)} · ❤️ ${Number(p.likes || 0)} · 💬 ${(p.comments || []).length}</small>
        </div>
      </div>
    `)
    .join('') || '<p class="text-muted">尚無資料</p>';

  // 3. 活躍作者排行
  const authorCounts = {};
  state.posts.forEach(p => {
    const a = p.author || '匿名訪客';
    authorCounts[a] = (authorCounts[a] || 0) + 1;
  });
  els.topAuthorsList.innerHTML = Object.entries(authorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([author, cnt], idx) => `
      <div class="rank-item">
        <span class="rank-num">#${idx + 1}</span>
        <div class="rank-info">
          <strong>${escapeHtml(author)}</strong>
          <small>累計發布 ${cnt} 篇貼文</small>
        </div>
      </div>
    `)
    .join('') || '<p class="text-muted">尚無資料</p>';

  // 4. 顏色偏好
  const colorCounts = {};
  state.posts.forEach(p => {
    const col = p.color || 'white';
    colorCounts[col] = (colorCounts[col] || 0) + 1;
  });
  els.colorChartContainer.innerHTML = Object.entries(colorCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([col, cnt]) => {
      const pct = Math.round((cnt / total) * 100);
      return `
        <div class="bar-row">
          <div class="bar-label">
            <span><span class="color-dot-mini swatch-${escapeHtml(col)}"></span> ${COLOR_NAMES[col] || col}</span>
            <strong>${cnt} 篇 (${pct}%)</strong>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    })
    .join('') || '<p class="text-muted">尚無資料</p>';
}

/**
 * 後臺單筆與批次操作
 */
async function updatePostStatus(id, newStatus) {
  const target = state.posts.find(p => p.id === id);
  if (!target) return;
  target.status = newStatus;
  savePostsToLocal();
  refreshAllViews();
  showToast(newStatus === 'approved' ? '✅ 貼文已核准公開' : '👁️‍🗨️ 貼文已設為隱藏');

  if (state.gasUrl) {
    try {
      await sendGasPost({ action: 'update', id, status: newStatus });
    } catch (e) {
      console.warn('狀態同步失敗', e);
    }
  }
}

async function togglePostPin(id) {
  const target = state.posts.find(p => p.id === id);
  if (!target) return;
  target.pinned = !target.pinned;
  savePostsToLocal();
  refreshAllViews();
  showToast(target.pinned ? '📌 已置頂貼文' : '已取消置頂');

  if (state.gasUrl) {
    try {
      await sendGasPost({ action: 'pin', id });
    } catch (e) {}
  }
}

async function deleteSinglePost(id) {
  if (!confirm('確定要永久刪除這則貼文嗎？')) return;
  state.posts = state.posts.filter(p => p.id !== id);
  state.selectedIds.delete(id);
  savePostsToLocal();
  refreshAllViews();
  showToast('🗑️ 已刪除貼文');

  if (state.gasUrl) {
    try {
      await sendGasPost({ action: 'delete', id });
    } catch (e) {}
  }
}

async function deleteComment(postId, commentId) {
  if (!confirm('確定要刪除這則留言嗎？')) return;
  const target = state.posts.find(p => p.id === postId);
  if (!target || !Array.isArray(target.comments)) return;
  target.comments = target.comments.filter(c => String(c.id) !== String(commentId));
  savePostsToLocal();
  refreshAllViews();
  showToast('🗑️ 已刪除留言');

  if (state.gasUrl) {
    try {
      await sendGasPost({ action: 'delete_comment', id: postId, commentId });
    } catch (e) {}
  }
}

async function handleBatchStatus(newStatus) {
  const ids = [...state.selectedIds];
  if (ids.length === 0) {
    showToast('⚠️ 請先勾選至少一則貼文');
    return;
  }
  state.posts.forEach(p => {
    if (state.selectedIds.has(p.id)) p.status = newStatus;
  });
  savePostsToLocal();
  refreshAllViews();
  showToast(`✅ 已批次更新 ${ids.length} 則貼文狀態`);

  if (state.gasUrl) {
    try {
      await sendGasPost({ action: 'batch_status', ids, status: newStatus });
    } catch (e) {}
  }
}

async function handleBatchDelete() {
  const ids = [...state.selectedIds];
  if (ids.length === 0) {
    showToast('⚠️ 請先勾選至少一則貼文');
    return;
  }
  if (!confirm(`確定要批次永久刪除選取的 ${ids.length} 則貼文嗎？`)) return;

  state.posts = state.posts.filter(p => !state.selectedIds.has(p.id));
  state.selectedIds.clear();
  els.selectAllCheckbox.checked = false;
  savePostsToLocal();
  refreshAllViews();
  showToast(`🗑️ 已批次刪除 ${ids.length} 則貼文`);

  if (state.gasUrl) {
    try {
      await sendGasPost({ action: 'batch_delete', ids });
    } catch (e) {}
  }
}

/**
 * 開啟編輯或新增官方貼文 Modal
 */
function openEditModal(post = null) {
  state.editUploadedBase64 = '';
  state.editUploadedName = '';
  els.editImageFile.value = '';

  if (post) {
    els.editModalTitle.textContent = '✏️ 編輯貼文';
    els.editPostId.value = post.id;
    els.editAuthor.value = post.author || '';
    els.editStatus.value = post.status || 'approved';
    els.editCategory.value = post.category || '靈感筆記';
    els.editColor.value = post.color || 'white';
    els.editTitle.value = post.title || '';
    els.editContent.value = post.content || '';
    els.editImageUrl.value = post.imageUrl || '';
    els.editLinkUrl.value = post.linkUrl || '';
    els.editLinkTitle.value = post.linkTitle || '';
    els.editLikes.value = Number(post.likes || 0);
    els.editPinned.checked = Boolean(post.pinned);
  } else {
    els.editModalTitle.textContent = '＋ 新增官方管理員貼文';
    els.editPostId.value = '';
    els.editAuthor.value = '管理員';
    els.editStatus.value = 'approved';
    els.editCategory.value = '靈感筆記';
    els.editColor.value = 'yellow';
    els.editTitle.value = '';
    els.editContent.value = '';
    els.editImageUrl.value = '';
    els.editLinkUrl.value = '';
    els.editLinkTitle.value = '';
    els.editLikes.value = 0;
    els.editPinned.checked = true;
  }

  els.editPostModal.classList.remove('hidden');
}

function bindNavigationEvents() {
  const titles = {
    posts: '📋 貼文審核與管理',
    comments: '💬 留言互動管理',
    analytics: '📊 數據統計分析',
    settings: '⚙️ 牆面與權限設定',
    database: '🗄️ Google Sheet 資料庫與備份'
  };

  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-nav .nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sec = btn.dataset.section;
      els.sectionTitle.textContent = titles[sec] || '後臺管理';
      document.querySelectorAll('.admin-section').forEach(s => {
        s.classList.toggle('hidden', s.id !== `section-${sec}`);
      });
    });
  });

  els.adminRefreshBtn.addEventListener('click', () => {
    showToast('🔄 重新同步資料中...');
    fetchAllData();
  });

  els.adminNewPostBtn.addEventListener('click', () => openEditModal(null));
}

function bindTableEvents() {
  els.adminSearchInput.addEventListener('input', e => {
    state.searchQuery = e.target.value;
    renderPostsTable();
  });

  els.adminStatusFilter.addEventListener('change', e => {
    state.statusFilter = e.target.value;
    renderPostsTable();
  });

  els.adminCategoryFilter.addEventListener('change', e => {
    state.categoryFilter = e.target.value;
    renderPostsTable();
  });

  els.selectAllCheckbox.addEventListener('change', () => {
    const filtered = getFilteredPosts();
    if (els.selectAllCheckbox.checked) {
      filtered.forEach(p => state.selectedIds.add(p.id));
    } else {
      filtered.forEach(p => state.selectedIds.delete(p.id));
    }
    renderPostsTable();
  });

  els.batchApproveBtn.addEventListener('click', () => handleBatchStatus('approved'));
  els.batchHideBtn.addEventListener('click', () => handleBatchStatus('hidden'));
  els.batchDeleteBtn.addEventListener('click', handleBatchDelete);

  // Edit modal image upload compression
  els.editImageFile.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
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
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        state.editUploadedBase64 = canvas.toDataURL('image/jpeg', 0.85);
        state.editUploadedName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        els.editImageUrl.value = '(已選擇新上傳圖片: ' + file.name + ')';
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  els.closeEditModal.addEventListener('click', () => els.editPostModal.classList.add('hidden'));
  els.cancelEditBtn.addEventListener('click', () => els.editPostModal.classList.add('hidden'));

  els.editPostForm.addEventListener('submit', async e => {
    e.preventDefault();
    const id = els.editPostId.value;
    const payloadData = {
      author: els.editAuthor.value.trim() || '管理員',
      status: els.editStatus.value,
      category: els.editCategory.value,
      color: els.editColor.value,
      title: els.editTitle.value.trim(),
      content: els.editContent.value.trim(),
      imageUrl: state.editUploadedBase64 || els.editImageUrl.value.trim(),
      linkUrl: els.editLinkUrl.value.trim(),
      linkTitle: els.editLinkTitle.value.trim(),
      likes: Number(els.editLikes.value || 0),
      pinned: els.editPinned.checked
    };

    els.saveEditBtn.disabled = true;
    els.saveEditBtn.textContent = '⏳ 儲存中...';

    try {
      if (id) {
        // 更新既有貼文
        const idx = state.posts.findIndex(p => p.id === id);
        if (idx !== -1) {
          state.posts[idx] = { ...state.posts[idx], ...payloadData };
        }
        if (state.gasUrl) {
          const res = await sendGasPost({
            action: 'update',
            id,
            ...payloadData,
            imageBase64: state.editUploadedBase64 || '',
            imageName: state.editUploadedName || ''
          });
          if (res && res.imageUrl && idx !== -1) {
            state.posts[idx].imageUrl = res.imageUrl;
          }
        }
        showToast('✅ 貼文修改已儲存');
      } else {
        // 新增官方貼文
        const newPost = {
          id: 'post_' + Date.now(),
          ...payloadData,
          comments: [],
          createdAt: new Date().toISOString()
        };
        if (state.gasUrl) {
          const res = await sendGasPost({
            action: 'create',
            ...newPost,
            imageBase64: state.editUploadedBase64 || '',
            imageName: state.editUploadedName || ''
          });
          if (res && res.post) {
            state.posts.unshift(res.post);
          } else {
            state.posts.unshift(newPost);
          }
        } else {
          state.posts.unshift(newPost);
        }
        showToast('✨ 已新增官方貼文');
      }

      savePostsToLocal();
      refreshAllViews();
      els.editPostModal.classList.add('hidden');
    } catch (err) {
      showToast('⚠️ 雲端同步異常，已儲存於本機');
      savePostsToLocal();
      refreshAllViews();
      els.editPostModal.classList.add('hidden');
    } finally {
      els.saveEditBtn.disabled = false;
      els.saveEditBtn.textContent = '💾 儲存變更';
    }
  });
}

function bindSettingsAndDbEvents() {
  // 儲存牆面設定
  els.boardSettingsForm.addEventListener('submit', async e => {
    e.preventDefault();
    state.boardSettings = {
      boardTitle: els.cfgBoardTitle.value.trim() || '我的個人靈感塗鴉牆',
      boardSubtitle: els.cfgBoardSubtitle.value.trim(),
      boardBg: els.cfgBoardBg.value,
      announcement: els.cfgAnnouncement.value.trim(),
      allowPosting: els.cfgAllowPosting.checked,
      requireApproval: els.cfgRequireApproval.checked,
      allowComments: els.cfgAllowComments.checked
    };

    const newPin = els.cfgNewPin.value.trim();
    if (newPin) {
      localStorage.setItem(STORAGE_KEYS.ADMIN_PIN, newPin);
      els.cfgNewPin.value = '';
    }

    saveMetaToLocal(state.boardSettings);

    if (state.gasUrl) {
      try {
        await sendGasPost({
          action: 'save_settings',
          settings: state.boardSettings
        });
        showToast('✅ 牆面設定已儲存並同步至 Google Sheet！');
      } catch (err) {
        showToast('✅ 牆面設定已儲存於本機');
      }
    } else {
      showToast('✅ 牆面設定已儲存！');
    }
  });

  // 測試與儲存 Google Sheet URL
  els.adminTestGasBtn.addEventListener('click', async () => {
    const url = els.adminGasUrlInput.value.trim();
    if (!url) {
      els.adminGasTestMsg.style.color = '#e11d48';
      els.adminGasTestMsg.textContent = '請先輸入 Web App URL';
      return;
    }
    els.adminGasTestMsg.style.color = '#475569';
    els.adminGasTestMsg.textContent = '⏳ 測試連線中...';
    try {
      const res = await fetch(url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now());
      const data = await res.json();
      if (data && data.status === 'ok') {
        els.adminGasTestMsg.style.color = '#16a34a';
        els.adminGasTestMsg.textContent = `✅ 連線成功！試算表目前共有 ${data.posts.length} 則貼文`;
      } else {
        throw new Error('回應異常');
      }
    } catch (err) {
      els.adminGasTestMsg.style.color = '#e11d48';
      els.adminGasTestMsg.textContent = '❌ 連線失敗，請檢查網址與「所有人 (Anyone)」部署權限';
    }
  });

  els.adminSaveGasBtn.addEventListener('click', () => {
    state.gasUrl = els.adminGasUrlInput.value.trim();
    localStorage.setItem(STORAGE_KEYS.GAS_URL, state.gasUrl);
    updateDbStatusUI();
    showToast(state.gasUrl ? '✅ 已更新 Google Sheet 連線，正在同步...' : '已切換為本機模式');
    fetchAllData();
  });

  // 匯出 CSV (含 BOM 支援 Excel 中文顯示)
  els.exportCsvBtn.addEventListener('click', () => {
    const headers = ['ID', '狀態', '作者', '分類', '標題', '內容', '圖片網址', '外部連結', '連結標題', '顏色', '愛心數', '置頂', '留言數', '建立時間'];
    const rows = state.posts.map(p => [
      p.id,
      p.status || 'approved',
      p.author || '',
      p.category || '',
      p.title || '',
      (p.content || '').replace(/\r?\n/g, ' '),
      p.imageUrl || '',
      p.linkUrl || '',
      p.linkTitle || '',
      p.color || 'white',
      Number(p.likes || 0),
      p.pinned ? 'TRUE' : 'FALSE',
      Array.isArray(p.comments) ? p.comments.length : 0,
      p.createdAt || ''
    ]);

    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `padlet_posts_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📊 已匯出 CSV 報表');
  });

  // 匯出 JSON
  els.adminExportJsonBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.posts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `padlet_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📥 已匯出 JSON 備份');
  });

  // 匯入 JSON
  els.importJsonBtn.addEventListener('click', () => els.importJsonFile.click());
  els.importJsonFile.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!Array.isArray(imported)) throw new Error('格式不正確');
        state.posts = imported;
        savePostsToLocal();
        refreshAllViews();
        showToast(`✅ 已成功匯入 ${imported.length} 則貼文！`);
      } catch (err) {
        showToast('❌ JSON 檔案格式不正確');
      }
    };
    reader.readAsText(file);
  });

  // 一鍵複製 .gs 程式碼
  els.adminCopyGasBtn.addEventListener('click', async () => {
    try {
      const res = await fetch('google-apps-script.gs');
      const code = await res.text();
      await navigator.clipboard.writeText(code);
      showToast('📋 已複製最新版 google-apps-script.gs 程式碼！');
    } catch (e) {
      showToast('請直接開啟專案內的 google-apps-script.gs 複製');
    }
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

document.addEventListener('DOMContentLoaded', initAdmin);
