/**
 * Padlet 個人塗鴉牆 - Google Apps Script 後端 (資料庫 + Google Drive 圖片儲存)
 *
 * 【安裝與部署步驟】
 * 1. 建立一個新的 Google 試算表 (Google Sheet)。
 * 2. 點選上方選單「擴充功能」>「Apps Script」。
 * 3. 將此檔案的所有程式碼貼上並取代原本的 Code.gs 內容，按 Ctrl+S 儲存。
 * 4. (選填) 若想將圖片集中放在特定 Google Drive 資料夾，請將下方 DRIVE_FOLDER_ID 改為您的資料夾 ID；
 *    若留空 ""，系統會自動在您的 Google Drive 建立一個名為「Padlet_塗鴉牆圖片」的資料夾。
 * 5. 點選右上角「部署」>「新增部署作業」：
 *    - 選取類型：「網頁應用程式 (Web App)」
 *    - 執行身分：「我 (Me)」
 *    - 誰可以存取：「所有人 (Anyone)」
 * 6. 點選「部署」，授權存取權限後，複製產生的「網頁應用程式網址 (Web App URL)」。
 * 7. 打開前端網頁，點擊右上角「⚙️ 設定資料庫」，貼上該網址即可開始使用！
 */

const SHEET_NAME = 'Posts';
const DRIVE_FOLDER_ID = ''; // 可填入特定 Google Drive 資料夾 ID，留空則自動建立
const AUTO_FOLDER_NAME = 'Padlet_塗鴉牆圖片';

/**
 * 取得或初始化資料表
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
      'createdAt'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f3f4f6');
  }
  return sheet;
}

/**
 * 取得或建立存放圖片的 Google Drive 資料夾
 */
function getUploadFolder() {
  if (DRIVE_FOLDER_ID) {
    try {
      return DriveApp.getFolderById(DRIVE_FOLDER_ID);
    } catch (e) {
      // Fallback to auto folder
    }
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
  // 若已經是一般 http/https 網址，直接回傳
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

  // 使用 Google Drive Thumbnail 高解析度端點以便在 <img> 標籤直接穩定載入
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1200';
}

/**
 * 處理 GET 請求：讀取所有塗鴉牆貼文
 */
function doGet(e) {
  try {
    const sheet = getOrCreateSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return jsonResponse({ status: 'ok', posts: [] });
    }

    const data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
    const posts = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue; // skip empty ID
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
        category: String(row[8] || '一般'),
        likes: Number(row[9] || 0),
        pinned: row[10] === true || row[10] === 'TRUE' || row[10] === 'true',
        comments: comments,
        createdAt: String(row[12] || new Date().toISOString())
      });
    }

    // 依置頂與建立時間排序 (最新在前)
    posts.sort(function(a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return jsonResponse({ status: 'ok', posts: posts });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

/**
 * 處理 POST 請求：新增貼文、按讚、留言、置頂、刪除
 */
function doPost(e) {
  try {
    const rawBody = e.postData && e.postData.contents ? e.postData.contents : '{}';
    const payload = JSON.parse(rawBody);
    const action = payload.action || 'create';
    const sheet = getOrCreateSheet();

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
        category: payload.category || '一般',
        likes: 0,
        pinned: Boolean(payload.pinned),
        comments: [],
        createdAt: now
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
        newPost.createdAt
      ]);

      return jsonResponse({ status: 'ok', post: newPost });
    }

    // 尋找目標列
    const targetId = String(payload.id || '');
    const rowIndex = findRowById(sheet, targetId);
    if (rowIndex === -1) {
      return jsonResponse({ status: 'error', message: '找不到該貼文 ID: ' + targetId });
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

/**
 * 根據貼文 ID 尋找試算表列號 (1-based)
 */
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

/**
 * 回傳 JSON 格式回應
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
