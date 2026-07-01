/***************
 * CARD SCANNER - DRIVE UPLOAD GATEWAY
 *
 * Deploy as an Apps Script Web App.
 * Vercel/Next sends image data as Base64 JSON.
 * This script uploads the image to Drive and logs a row in SCAN_QUEUE.
 *
 * Recommended Script Properties:
 * - DRIVE_FOLDER_ID
 * - SPREADSHEET_ID
 * - API_SECRET
 *
 * The fallback values below are configured from the current CardDrop setup.
 ***************/

const CONFIG = {
  DRIVE_FOLDER_ID: getConfig_("DRIVE_FOLDER_ID", "1SyLwqlth2MWwrOTNF31YlP7EDXVE1PTA"),
  SPREADSHEET_ID: getConfig_("SPREADSHEET_ID", "17RbRddcBXlsXAg9C0MEcwi5OHaTTxvCvtKf82RUjWa4"),
  API_SECRET: getConfig_("API_SECRET", "brownwall_cardscanner_upload_2026_X9kL72mQpR4sT8vZ"),
  QUEUE_SHEET_NAME: getConfig_("QUEUE_SHEET_NAME", "SCAN_QUEUE"),
  MAX_IMAGE_BYTES: Number(getConfig_("MAX_IMAGE_BYTES", String(12 * 1024 * 1024)))
};

const QUEUE_HEADERS = [
  "Job ID",
  "Created At",
  "Updated At",
  "File ID",
  "File URL",
  "Uploaded By",
  "Status",
  "OCR Provider",
  "Started At",
  "Completed At",
  "Retry Count",
  "Error",
  "Raw OCR Text",
  "Parsed JSON",
  "Confidence",
  "Review Required"
];

function doGet() {
  return HtmlService
    .createHtmlOutput(
      '<html><body style="font-family:Arial;padding:20px;">' +
      '<h3>Card Scanner Upload API is Live</h3>' +
      '<p>POST JSON with secret, fileName, mimeType, and base64.</p>' +
      '</body></html>'
    )
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    validateSecret_(payload.secret);

    const mimeType = String(payload.mimeType || "image/jpeg").trim();
    if (!/^image\/[a-z0-9.+-]+$/i.test(mimeType)) {
      return jsonResponse_({
        success: false,
        error: "Only image files are allowed."
      });
    }

    const base64 = normalizeBase64_(payload.base64);
    if (!base64) {
      return jsonResponse_({
        success: false,
        error: "Missing base64 image."
      });
    }

    const bytes = Utilities.base64Decode(base64);
    if (bytes.length > CONFIG.MAX_IMAGE_BYTES) {
      return jsonResponse_({
        success: false,
        error: "Image is too large."
      });
    }

    const jobId = makeJobId_();
    const originalFileName = sanitizeFileName_(
      payload.fileName || makeDefaultFileName_(mimeType)
    );
    const uploadedBy = String(payload.uploadedBy || "CardDrop").trim() || "CardDrop";

    const uploadResult = uploadImageToDrive_({
      jobId: jobId,
      fileName: originalFileName,
      mimeType: mimeType,
      bytes: bytes
    });

    appendScanQueueRow_({
      jobId: jobId,
      fileId: uploadResult.fileId,
      fileUrl: uploadResult.fileUrl,
      uploadedBy: uploadedBy
    });

    return jsonResponse_({
      success: true,
      message: "Image uploaded and scan job created.",
      jobId: jobId,
      fileId: uploadResult.fileId,
      fileUrl: uploadResult.fileUrl,
      status: "PENDING"
    });
  } catch (err) {
    return jsonResponse_({
      success: false,
      error: err && err.message ? err.message : String(err)
    });
  }
}

function authorizeDriveWrite() {
  const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const testBlob = Utilities.newBlob(
    "Drive write permission test",
    "text/plain",
    "AUTH_TEST_DELETE_ME.txt"
  );
  const file = folder.createFile(testBlob);
  Logger.log("Created test file: " + file.getUrl());
  file.setTrashed(true);

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  Logger.log("Sheet opened: " + ss.getName());
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("No POST body received.");
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    throw new Error("Invalid JSON body.");
  }
}

function validateSecret_(secret) {
  if (!CONFIG.API_SECRET) {
    throw new Error("API secret is not configured.");
  }

  if (String(secret || "") !== CONFIG.API_SECRET) {
    throw new Error("Unauthorized request.");
  }
}

function uploadImageToDrive_({ jobId, fileName, mimeType, bytes }) {
  const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const finalFileName = sanitizeFileName_(jobId + "_" + fileName);
  const blob = Utilities.newBlob(bytes, mimeType, finalFileName);
  const file = folder.createFile(blob);

  return {
    fileId: file.getId(),
    fileUrl: file.getUrl()
  };
}

function appendScanQueueRow_({ jobId, fileId, fileUrl, uploadedBy }) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    let sheet = ss.getSheetByName(CONFIG.QUEUE_SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.QUEUE_SHEET_NAME);
    }

    ensureHeaders_(sheet, QUEUE_HEADERS);

    const now = new Date();
    sheet.appendRow([
      jobId,
      now,
      now,
      fileId,
      fileUrl,
      uploadedBy,
      "PENDING",
      "",
      "",
      "",
      0,
      "",
      "",
      "",
      "",
      false
    ]);
  } finally {
    lock.releaseLock();
  }
}

function ensureHeaders_(sheet, headers) {
  const lastColumn = Math.max(sheet.getLastColumn(), headers.length);
  const existingHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const needsUpdate = headers.some(function(header, index) {
    return existingHeaders[index] !== header;
  });

  if (needsUpdate) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function normalizeBase64_(value) {
  let base64 = String(value || "").trim();

  if (!base64) {
    return "";
  }

  if (base64.indexOf(",") !== -1) {
    base64 = base64.split(",").pop();
  }

  return base64.replace(/\s/g, "");
}

function makeJobId_() {
  const time = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyyMMdd-HHmmss"
  );
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return "JOB-" + time + "-" + rand;
}

function makeDefaultFileName_(mimeType) {
  const extensionMap = {
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/jpeg": "jpg",
    "image/jpg": "jpg"
  };
  const extension = extensionMap[String(mimeType).toLowerCase()] || "jpg";
  return "business-card." + extension;
}

function sanitizeFileName_(name) {
  const cleaned = String(name || "business-card.jpg")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 160);

  return cleaned || "business-card.jpg";
}

function getConfig_(key, fallback) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  return value || fallback || "";
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
