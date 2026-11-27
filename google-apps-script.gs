/**
 * Padlet 個人塗鴉牆 & 後臺管理系統 - Google Apps Script 後端 (資料庫 + Google Drive 圖片儲存)
 *
 * 【安裝與部署步驟】
 * 1. 建立一個新的 Google 試算表 (Google Sheet)。
 * 2. 點選上方選單「擴充功能」>「Apps Script」。
 * 3. 將此檔案的所有程式碼貼上並取代原本的 Code.gs 內容，按 Ctrl+S 儲存。
 * 4. (選填) 可在下方 ADMIN_PASSWORD 設定雲端管理員密碼 (預設 "1234")。
 * 5. 點選右上角「部署」>「新增部署作業」(若已部署過，點選「管理部署作業」> 編輯 > 版本選「新版本」)：
 *    - 選取類型：「網頁應用程式 (Web App)」
 *    - 執行身分：「我 (Me)」
 *    - 誰可以存取：「所有人 (Anyone)」
 * 6. 點選「部署」，複製產生的「網頁應用程式網址 (Web App URL)」。
 */

const SHEET_NAME = 'Posts';
const SETTINGS_SHEET_NAME = 'Settings';
const DRIVE_FOLDER_ID = ''; // 可填入特定 Google Drive 資料夾 ID，留空則自動建立
const AUTO_FOLDER_NAME = 'Padlet_塗鴉牆圖片';
const DEFAULT_ADMIN_PIN = '1234'; // 預設管理員密碼，可透過後臺或在此修改

/**
 * 取得或初始化貼文資料表
 */
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = [
      'id',
      'author',
      'title',
      'content',
      'imageUrl',
      'linkUrl',
      'linkTitle',
      'color',
      'category',
      'likes',
      'pinned',
      'commentsJson',
      'createdAt',
      'status' // 'approved' | 'pending' | 'hidden'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f3f4f6');
  } else {
    // 確保第 14 欄 status 存在 (向下相容舊版試算表)
    const lastCol = sheet.getLastColumn();
    if (lastCol < 14) {
      sheet.getRange(1, 14).setValue('status').setFontWeight('bold').setBackground('#f3f4f6');
    }
  }
  return sheet;
}

/**
 * 取得或初始化牆面全域設定表 (Settings)
 */
function getOrCreateSettingsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SETTINGS_SHEET_NAME);
    const defaultSettings = [
      ['key', 'value'],
      ['boardTitle', '我的個人靈感塗鴉牆'],
      ['boardSubtitle', '隨時記錄靈感、分享圖片與好站連結 — 支援 Google Sheet 雲端同步'],
      ['boardBg', 'bg-cork'],
      ['requireApproval', 'false'],
      ['allowPosting', 'true'],
      ['allowComments', 'true'],
      ['announcement', ''],
      ['adminPin', DEFAULT_ADMIN_PIN]
    ];
    sheet.getRange(1, 1, defaultSettings.length, 2).setValues(defaultSettings);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#f3f4f6');
  }
  return sheet;
}

function getBoardSettings() {
  const sheet = getOrCreateSettingsSheet();
  const lastRow = sheet.getLastRow();
  const settings = {
    boardTitle: '我的個人靈感塗鴉牆',
    boardSubtitle: '隨時記錄靈感、分享圖片與好站連結 — 支援 Google Sheet 雲端同步',
    boardBg: 'bg-cork',
    requireApproval: false,
    allowPosting: true,
    allowComments: true,
    announcement: ''
  };
  if (lastRow <= 1) return settings;
  const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = 0; i < rows.length; i++) {
    const k = String(rows[i][0]);
    const v = rows[i][1];
    if (k === 'adminPin') continue; // 不將密碼暴露給一般 GET
    if (k === 'requireApproval' || k === 'allowPosting' || k === 'allowComments') {
      settings[k] = (v === true || v === 'true' || v === 'TRUE');
    } else if (k) {
      settings[k] = String(v || '');
    }
  }
  return settings;
}

function saveBoardSettings(newSettings) {
  const sheet = getOrCreateSettingsSheet();
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 2).getValues() : [];
  const keyRowMap = {};
  for (let i = 0; i < rows.length; i++) {
    keyRowMap[String(rows[i][0])] = i + 2;
  }

  const keys = Object.keys(newSettings);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = String(newSettings[k]);
    if (keyRowMap[k]) {
      sheet.getRange(keyRowMap[k], 2).setValue(v);
    } else {
      sheet.appendRow([k, v]);
    }
  }
  return getBoardSettings();
}

/**
 * 取得或建立存放圖片的 Google Drive 資料夾
 */
function getUploadFolder() {
  if (DRIVE_FOLDER_ID) {
    try {
      return DriveApp.getFolderById(DRIVE_FOLDER_ID);
    } catch (e) {}
  }
  const folders = DriveApp.getFoldersByName(AUTO_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  const folder = DriveApp.createFolder(AUTO_FOLDER_NAME);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return folder;
}

/**
 * 將 Base64 圖片儲存至 Google Drive 並回傳公開顯示網址
 */
function saveBase64ImageToDrive(base64Data, fileName, mimeType) {
  if (!base64Data) return '';
  if (base64Data.indexOf('http://') === 0 || base64Data.indexOf('https://') === 0) {
    return base64Data;
  }

  let rawBase64 = base64Data;
  let detectedMime = mimeType || 'image/jpeg';

  if (base64Data.indexOf('base64,') !== -1) {
    const parts = base64Data.split('base64,');
    const header = parts[0];
    rawBase64 = parts[1];
    const mimeMatch = header.match(/data:([^;]+);/);
    if (mimeMatch && mimeMatch[1]) {
      detectedMime = mimeMatch[1];
    }
  }

  const decoded = Utilities.base64Decode(rawBase64);
  const safeName = fileName || ('padlet_img_' + new Date().getTime() + '.jpg');
  const blob = Utilities.newBlob(decoded, detectedMime, safeName);

  const folder = getUploadFolder();
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1200';
}

/**
 * 處理 GET 請求：讀取所有塗鴉牆貼文與牆面設定
 */
function doGet(e) {
  try {
    const sheet = getOrCreateSheet();
    const settings = getBoardSettings();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return jsonResponse({ status: 'ok', posts: [], settings: settings });
    }

    const numCols = Math.max(14, sheet.getLastColumn());
    const data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    const posts = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      let comments = [];
      try {
        comments = row[11] ? JSON.parse(row[11]) : [];
      } catch (err) {
        comments = [];
      }
      posts.push({
        id: String(row[0]),
        author: String(row[1] || '匿名訪客'),
        title: String(row[2] || ''),
        content: String(row[3] || ''),
        imageUrl: String(row[4] || ''),
        linkUrl: String(row[5] || ''),
        linkTitle: String(row[6] || ''),
        color: String(row[7] || 'white'),
        category: String(row[8] || '靈感筆記'),
        likes: Number(row[9] || 0),
        pinned: row[10] === true || row[10] === 'TRUE' || row[10] === 'true',
        comments: comments,
        createdAt: String(row[12] || new Date().toISOString()),
        status: String(row[13] || 'approved')
      });
    }

    posts.sort(function(a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return jsonResponse({ status: 'ok', posts: posts, settings: settings });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

/**
 * 處理 POST 請求：前台與後臺管理操作
 */
function doPost(e) {
  try {
    const rawBody = e.postData && e.postData.contents ? e.postData.contents : '{}';
    const payload = JSON.parse(rawBody);
    const action = payload.action || 'create';
    const sheet = getOrCreateSheet();
    const settings = getBoardSettings();

    // 1. 新增貼文
    if (action === 'create') {
      const id = payload.id || ('post_' + new Date().getTime() + '_' + Math.floor(Math.random() * 1000));
      let imageUrl = payload.imageUrl || '';

      if (payload.imageBase64) {
        imageUrl = saveBase64ImageToDrive(
          payload.imageBase64,
          payload.imageName,
          payload.imageMimeType
        );
      }

      const initialStatus = payload.status || (settings.requireApproval ? 'pending' : 'approved');
      const now = payload.createdAt || new Date().toISOString();
      const newPost = {
        id: id,
        author: payload.author || '匿名訪客',
        title: payload.title || '',
        content: payload.content || '',
        imageUrl: imageUrl,
        linkUrl: payload.linkUrl || '',
        linkTitle: payload.linkTitle || '',
        color: payload.color || 'white',
        category: payload.category || '靈感筆記',
        likes: Number(payload.likes || 0),
        pinned: Boolean(payload.pinned),
        comments: Array.isArray(payload.comments) ? payload.comments : [],
        createdAt: now,
        status: initialStatus
      };

      sheet.appendRow([
        newPost.id,
        newPost.author,
        newPost.title,
        newPost.content,
        newPost.imageUrl,
        newPost.linkUrl,
        newPost.linkTitle,
        newPost.color,
        newPost.category,
        newPost.likes,
        newPost.pinned,
        JSON.stringify(newPost.comments),
        newPost.createdAt,
        newPost.status
      ]);

      return jsonResponse({ status: 'ok', post: newPost });
    }

    // 2. 後臺儲存牆面全域設定
    if (action === 'save_settings') {
      const updated = saveBoardSettings(payload.settings || {});
      return jsonResponse({ status: 'ok', settings: updated });
    }

    // 3. 後臺批次刪除貼文
    if (action === 'batch_delete') {
      const idsToDelete = Array.isArray(payload.ids) ? payload.ids.map(String) : [];
      const lastRow = sheet.getLastRow();
      let deletedCount = 0;
      if (lastRow > 1 && idsToDelete.length > 0) {
        const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        // 由下往上刪除避免列號位移
        for (let i = ids.length - 1; i >= 0; i--) {
          if (idsToDelete.indexOf(String(ids[i][0])) !== -1) {
            sheet.deleteRow(i + 2);
            deletedCount++;
          }
        }
      }
      return jsonResponse({ status: 'ok', deletedCount: deletedCount });
    }

    // 4. 後臺批次更新狀態 (審核通過 / 隱藏 / 置頂)
    if (action === 'batch_status') {
      const idsToUpdate = Array.isArray(payload.ids) ? payload.ids.map(String) : [];
      const targetStatus = payload.status || 'approved';
      const lastRow = sheet.getLastRow();
      let updatedCount = 0;
      if (lastRow > 1 && idsToUpdate.length > 0) {
        const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (let i = 0; i < ids.length; i++) {
          if (idsToUpdate.indexOf(String(ids[i][0])) !== -1) {
            sheet.getRange(i + 2, 14).setValue(targetStatus);
            updatedCount++;
          }
        }
      }
      return jsonResponse({ status: 'ok', updatedCount: updatedCount });
    }

    // 單筆操作：尋找目標列
    const targetId = String(payload.id || '');
    const rowIndex = findRowById(sheet, targetId);
    if (rowIndex === -1) {
      return jsonResponse({ status: 'error', message: '找不到該貼文 ID: ' + targetId });
    }

    // 5. 後臺完整編輯貼文
    if (action === 'update') {
      let imageUrl = payload.imageUrl !== undefined ? payload.imageUrl : sheet.getRange(rowIndex, 5).getValue();
      if (payload.imageBase64) {
        imageUrl = saveBase64ImageToDrive(payload.imageBase64, payload.imageName, payload.imageMimeType);
      }
      if (payload.author !== undefined) sheet.getRange(rowIndex, 2).setValue(payload.author);
      if (payload.title !== undefined) sheet.getRange(rowIndex, 3).setValue(payload.title);
      if (payload.content !== undefined) sheet.getRange(rowIndex, 4).setValue(payload.content);
      sheet.getRange(rowIndex, 5).setValue(imageUrl);
      if (payload.linkUrl !== undefined) sheet.getRange(rowIndex, 6).setValue(payload.linkUrl);
      if (payload.linkTitle !== undefined) sheet.getRange(rowIndex, 7).setValue(payload.linkTitle);
      if (payload.color !== undefined) sheet.getRange(rowIndex, 8).setValue(payload.color);
      if (payload.category !== undefined) sheet.getRange(rowIndex, 9).setValue(payload.category);
      if (payload.likes !== undefined) sheet.getRange(rowIndex, 10).setValue(Number(payload.likes));
      if (payload.pinned !== undefined) sheet.getRange(rowIndex, 11).setValue(Boolean(payload.pinned));
      if (payload.comments !== undefined) sheet.getRange(rowIndex, 12).setValue(JSON.stringify(payload.comments));
      if (payload.status !== undefined) sheet.getRange(rowIndex, 14).setValue(payload.status);

      return jsonResponse({ status: 'ok', id: targetId, imageUrl: imageUrl });
    }

    // 6. 後臺刪除單則留言
    if (action === 'delete_comment') {
      const commentId = String(payload.commentId || '');
      const rawComments = sheet.getRange(rowIndex, 12).getValue();
      let comments = [];
      try {
        comments = rawComments ? JSON.parse(rawComments) : [];
      } catch (err) {
        comments = [];
      }
      comments = comments.filter(function(c) { return String(c.id) !== commentId; });
      sheet.getRange(rowIndex, 12).setValue(JSON.stringify(comments));
      return jsonResponse({ status: 'ok', id: targetId, comments: comments });
    }

    if (action === 'like') {
      const currentLikes = Number(sheet.getRange(rowIndex, 10).getValue() || 0);
      const nextLikes = currentLikes + 1;
      sheet.getRange(rowIndex, 10).setValue(nextLikes);
      return jsonResponse({ status: 'ok', id: targetId, likes: nextLikes });
    }

    if (action === 'pin') {
      const currentPin = sheet.getRange(rowIndex, 11).getValue();
      const isPinned = currentPin === true || currentPin === 'TRUE' || currentPin === 'true';
      const nextPin = !isPinned;
      sheet.getRange(rowIndex, 11).setValue(nextPin);
      return jsonResponse({ status: 'ok', id: targetId, pinned: nextPin });
    }

    if (action === 'comment') {
      const rawComments = sheet.getRange(rowIndex, 12).getValue();
      let comments = [];
      try {
        comments = rawComments ? JSON.parse(rawComments) : [];
      } catch (err) {
        comments = [];
      }
      const newComment = {
        id: 'c_' + new Date().getTime(),
        author: payload.author || '匿名訪客',
        text: payload.text || '',
        createdAt: new Date().toISOString()
      };
      comments.push(newComment);
      sheet.getRange(rowIndex, 12).setValue(JSON.stringify(comments));
      return jsonResponse({ status: 'ok', id: targetId, comments: comments });
    }

    if (action === 'delete') {
      sheet.deleteRow(rowIndex);
      return jsonResponse({ status: 'ok', id: targetId });
    }

    return jsonResponse({ status: 'error', message: '未知的操作: ' + action });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

function findRowById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      return i + 2;
    }
  }
  return -1;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
