import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import os from "os";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

// In production (Vercel), only /tmp is writable.
const uploadDir = process.env.VERCEL ? path.join(os.tmpdir(), "uploads") : "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

const getAppUrl = (req?: express.Request) => {
  // If user explicitly set APP_URL in secrets, use it. 
  // RECOMMENDED: Leave APP_URL empty in Secrets to allow dynamic detection.
  if (process.env.APP_URL && process.env.APP_URL !== "DYNAMIC") {
    return process.env.APP_URL.replace(/\/$/, "");
  }
  if (req) {
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.get("host");
    if (host) {
      // Clean host if it contains internal ports or proxy artifacts
      const cleanHost = String(host).split(',')[0].trim();
      return `${protocol}://${cleanHost}`;
    }
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
};

const getCallbackUrl = (req?: express.Request) => {
  return `${getAppUrl(req)}/auth/callback`;
};

// oauth2Client initialized as a base template, dynamic clients used in routes
const oauth2Client = new google.auth.OAuth2(
  (process.env.GOOGLE_CLIENT_ID || "").trim(),
  (process.env.GOOGLE_CLIENT_SECRET || "").trim(),
  "http://localhost:3000/auth/callback" // Placeholder, dynamic callback used
);

console.log("Auth System Initialized (Production Check):");
console.log("- GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID ? `SET (${process.env.GOOGLE_CLIENT_ID.substring(0, 10)}...)` : "MISSING");
console.log("- GOOGLE_CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET ? "SET" : "MISSING");
console.log("- MASTER_SPREADSHEET_ID:", process.env.MASTER_SPREADSHEET_ID ? "SET" : "MISSING (Recommendation: Set in Vercel Env)");
console.log("- Base APP_URL:", getAppUrl());
function logAuthInit(req: express.Request) {
  console.log("Current Request Context Auth URI:", getCallbackUrl(req));
}

// Scopes for Google Sheets and profile
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/drive.file"
];

// Helper to get authorized client
const getAuthorizedClient = (tokens: any, req?: express.Request) => {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getCallbackUrl(req)
  );
  client.setCredentials(tokens);
  return client;
};

// --- CONFIG & HELPERS ---

const SPREADSHEET_NAME = "Procurement_Data_App";
const PHOTOS_FOLDER_NAME = "Procurement_Photos";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "asset.sebelas11@gmail.com";
const CONFIG_PATH = path.join(process.cwd(), "config.json");

// Helper to get/set Master Spreadsheet ID
const getMasterSpreadsheetId = () => {
  if (process.env.MASTER_SPREADSHEET_ID) return process.env.MASTER_SPREADSHEET_ID;
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      return config.masterSpreadsheetId;
    } catch (e) { return null; }
  }
  return null;
};

const setMasterSpreadsheetId = (id: string) => {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ masterSpreadsheetId: id }));
  } catch (e) {
    console.warn("Could not save masterSpreadsheetId to config.json (likely read-only filesystem):", e);
  }
};

async function getOrCreateMasterSpreadsheet(auth: any) {
  let spreadsheetId = getMasterSpreadsheetId();
  if (spreadsheetId) return spreadsheetId;

  const drive = google.drive({ version: "v3", auth });
  const sheets = google.sheets({ version: "v4", auth });

  const response = await drive.files.list({
    q: `name = '${SPREADSHEET_NAME}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
    fields: "files(id, name)",
  });

  if (response.data.files && response.data.files.length > 0) {
    spreadsheetId = response.data.files[0].id!;
    console.log(`Found existing spreadsheet: ${spreadsheetId}`);
    // Ensure Users sheet exists if we found an old one
    await ensureSheetExists(sheets, spreadsheetId, "Users", ["Email", "Name", "AddedAt"]);
    await ensureSheetExists(sheets, spreadsheetId, "Procurement", ["ID", "Timestamp", "Nama Barang", "Kuantitas", "Satuan", "Harga Satuan", "Harga Total", "Lokasi Store", "Prioritas", "Pemohon", "Deskripsi", "Link Referensi", "Foto Referensi", "Persetujuan", "Deskripsi Persetujuan", "Verifikator"]);
  } else {
    console.log("Creating new master spreadsheet...");
    const createResp = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: SPREADSHEET_NAME },
        sheets: [
          { properties: { title: "Procurement" } },
          { properties: { title: "Users" } }
        ]
      }
    });
    spreadsheetId = createResp.data.spreadsheetId!;
    
    // Initialize headers for Procurement
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Procurement!A1:P1",
      valueInputOption: "RAW",
      requestBody: {
        values: [["ID", "Timestamp", "Nama Barang", "Kuantitas", "Satuan", "Harga Satuan", "Harga Total", "Lokasi Store", "Prioritas", "Pemohon", "Deskripsi", "Link Referensi", "Foto Referensi", "Persetujuan", "Deskripsi Persetujuan", "Verifikator"]]
      }
    });

    // Initialize headers for Users
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Users!A1:C1",
      valueInputOption: "RAW",
      requestBody: {
        values: [["Email", "Name", "AddedAt"]]
      }
    });
  }
  
  if (spreadsheetId) setMasterSpreadsheetId(spreadsheetId);
  return spreadsheetId;
}

async function ensureSheetExists(sheets: any, spreadsheetId: string, sheetName: string, headers: string[]) {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = spreadsheet.data.sheets?.find((s: any) => s.properties?.title === sheetName);
  
  if (!sheet) {
    console.log(`Creating missing sheet: ${sheetName}`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: { title: sheetName }
          }
        }]
      }
    });
    
    // Initialize headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [headers]
      }
    });
  }
}

// --- AUTH ROUTES ---

app.get("/api/auth/url", (req, res) => {
  const dynamicCallbackUrl = getCallbackUrl(req);
  try {
    const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();

    if (!clientId || clientId.length < 10 || clientId.startsWith("YOUR_")) {
      throw new Error(`GOOGLE_CLIENT_ID tidak ditemukan atau tidak valid. Pastikan sudah diatur di Vercel Environment Variables. (Nilai terdeteksi: ${clientId ? "Tersedia tapi mungkin salah" : "KOSONG"})`);
    }
    if (!clientSecret || clientSecret.length < 5 || clientSecret.startsWith("YOUR_")) {
      throw new Error(`GOOGLE_CLIENT_SECRET tidak ditemukan atau tidak valid. (Nilai terdeteksi: ${clientSecret ? "Tersedia" : "KOSONG"})`);
    }
    
    const dynamicClient = new google.auth.OAuth2(
      clientId,
      clientSecret,
      dynamicCallbackUrl
    );

    const url = dynamicClient.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent"
    });
    console.log("Generated Auth URL with Redirect URI:", dynamicCallbackUrl);
    res.json({ url });
  } catch (error: any) {
    const dynamicCallbackUrl = getCallbackUrl(req);
    console.error("Auth URL Generation Failed:", error.message);
    res.status(500).json({ 
      error: "Authentication Configuration Error", 
      details: error.message,
      required_callback_url: dynamicCallbackUrl,
      hint: "Pastikan GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET sudah diatur di Settings > Secrets (AI Studio) atau Environment Variables (Vercel)."
    });
  }
});

app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
  const { code, error: queryError } = req.query;
  const dynamicCallbackUrl = getCallbackUrl(req);
  
  console.log("--- Google Auth Callback ---");
  console.log("Status:", code ? "Code Received" : "No Code");
  if (queryError) console.log("Google error:", queryError);
  console.log("Expected Redirect URI:", dynamicCallbackUrl);

  if (queryError) {
    return res.status(400).send(`Authentication failed from Google side: ${queryError}`);
  }

  const codeStr = code as string;
  if (!codeStr) {
    return res.status(400).send("No authorization code provided in the callback URL.");
  }

  try {
    console.log("Attempting to exchange code for tokens...");
    
    const exchangeClient = new google.auth.OAuth2(
      (process.env.GOOGLE_CLIENT_ID || "").trim(),
      (process.env.GOOGLE_CLIENT_SECRET || "").trim(),
      dynamicCallbackUrl
    );

    const { tokens } = await exchangeClient.getToken(codeStr);
    console.log("Tokens received successfully from Google.");
    
    if (!tokens) {
      throw new Error("Google returned a successful response but with empty tokens.");
    }

    // Determine cookie security based on protocol
    const isHttps = dynamicCallbackUrl.startsWith("https");

    // Set tokens in a secure cookie
    res.cookie("google_tokens", JSON.stringify(tokens), {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    console.log("Auth session established. Sending success response.");

    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb;">
          <div style="text-align: center; padding: 2rem; background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 1px solid #e5e7eb;">
            <div style="color: #10b981; font-size: 3rem; margin-bottom: 1rem;">✓</div>
            <h1 style="color: #111827; margin-bottom: 0.5rem; font-size: 1.5rem;">Autentikasi Berhasil</h1>
            <p style="color: #4b5563;">Menghubungkan ke aplikasi...</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                setTimeout(() => window.close(), 800);
              } else {
                window.location.href = '/';
              }
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (error: any) {
    const errorData = error.response?.data || {};
    const errorCode = errorData.error || "";
    const errorDesc = errorData.error_description || error.message;

    console.error("Token Exchange Failure:", {
      message: error.message,
      data: errorData
    });

    let instruction = "Pastikan Anda telah menambahkan URL di bawah ini ke 'Authorized redirect URIs' di Google Cloud Console.";
    if (errorCode === "redirect_uri_mismatch") {
      instruction = "<strong>KESALAHAN REDIRECT URI:</strong> URL yang terdeteksi tidak cocok dengan yang ada di Google Cloud Console.";
    }

    res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fff1f2; padding: 20px;">
          <div style="text-align: center; padding: 2.5rem; background: white; border-radius: 16px; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1); border: 2px solid #fecaca; max-width: 550px; width: 100%;">
            <div style="color: #ef4444; font-size: 3rem; margin-bottom: 0.5rem;">✕</div>
            <h1 style="color: #991b1b; margin-bottom: 1rem; font-size: 1.5rem;">Gagal Menukar Kode Akses</h1>
            <p style="color: #4b5563; margin-bottom: 1.5rem; font-size: 14px;">${instruction}</p>
            
            <div style="background: #f8fafc; padding: 1.25rem; border-radius: 8px; text-align: left; margin-bottom: 1.5rem; border: 1px solid #e2e8f0;">
               <p style="font-size: 11px; font-weight: bold; color: #64748b; margin-bottom: 8px; text-transform: uppercase;">Deteksi Redirect URI Aplikasi:</p>
               <code style="display: block; font-family: monospace; font-size: 12px; color: #0f172a; word-break: break-all; background: #fff; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px;">
                 ${dynamicCallbackUrl}
               </code>
               
               <p style="font-size: 11px; font-weight: bold; color: #64748b; margin-top: 15px; margin-bottom: 8px; text-transform: uppercase;">Detail Error dari Google:</p>
               <p style="font-family: monospace; font-size: 12px; color: #b91c1c; margin: 0; padding: 8px; background: #fef2f2; border-radius: 4px;">
                 [${errorCode}] ${errorDesc}
               </p>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: center;">
              <button onclick="window.location.reload()" style="background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; padding: 0.75rem 1.25rem; border-radius: 8px; font-weight: 600; cursor: pointer;">Coba Lagi</button>
              <button onclick="window.close()" style="background: #ef4444; color: white; border: none; padding: 0.75rem 1.25rem; border-radius: 8px; font-weight: 600; cursor: pointer;">Tutup</button>
            </div>
          </div>
        </body>
      </html>
    `);
  }
});

app.get("/api/auth/status", async (req, res) => {
  const tokensStr = req.cookies.google_tokens;
  if (!tokensStr) {
    console.log("Auth Status Check: No tokens cookie found");
    return res.json({ isAuthenticated: false });
  }

  try {
    const tokens = JSON.parse(tokensStr);
    const auth = getAuthorizedClient(tokens, req);
    const oauth2 = google.oauth2({ version: "v2", auth });
    const userInfo = await oauth2.userinfo.get();
    
    const email = userInfo.data.email;
    if (!email) {
      console.error("Auth Status Check: Email missing in userinfo");
      throw new Error("Email not found");
    }

    console.log("Auth Status Check: Success for", email);

    let role: 'ADMIN' | 'USER' | 'UNAUTHORIZED' = 'UNAUTHORIZED';

    const userEmail = email.toLowerCase().trim();
    const adminEmail = ADMIN_EMAIL.toLowerCase().trim();

    if (userEmail === adminEmail) {
      role = 'ADMIN';
    } else {
      // Check in Users sheet of Master Spreadsheet
      try {
        const masterId = await getOrCreateMasterSpreadsheet(auth);
        if (masterId) {
          const sheets = google.sheets({ version: "v4", auth });
          const usersResp = await sheets.spreadsheets.values.get({
            spreadsheetId: masterId,
            range: "Users!A2:A100",
          });
          const allowedEmails = (usersResp.data.values || []).flat().map(e => String(e).toLowerCase().trim());
          if (allowedEmails.includes(userEmail)) {
            role = 'USER';
          }
        }
      } catch (e) {
        console.error("Error checking user role:", e);
      }
    }

    res.json({ 
      isAuthenticated: true, 
      user: userInfo.data,
      role 
    });
  } catch (error) {
    res.json({ isAuthenticated: false });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("google_tokens", {
    secure: true,
    sameSite: "none"
  });
  res.json({ success: true });
});

// --- GOOGLE SHEETS PROXY ---

app.post("/api/upload", upload.single("file"), async (req, res) => {
  const tokensStr = req.cookies.google_tokens;
  if (!tokensStr) return res.status(401).json({ error: "Unauthorized" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const tokens = JSON.parse(tokensStr);
    const auth = getAuthorizedClient(tokens, req);
    const drive = google.drive({ version: "v3", auth });
    
    logAuthInit(req);

    // 1. Find or create photos folder
    let folderId = "";
    const folderResp = await drive.files.list({
      q: `name = '${PHOTOS_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
    });

    if (folderResp.data.files && folderResp.data.files.length > 0) {
      folderId = folderResp.data.files[0].id!;
    } else {
      const folderMetadata = {
        name: PHOTOS_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      };
      const folder = await drive.files.create({
        requestBody: folderMetadata,
        fields: "id",
      });
      folderId = folder.data.id!;
    }

    const fileMetadata: any = {
      name: `Photo_${Date.now()}_${req.file.originalname}`,
      parents: [folderId],
    };
    
    const media = {
      mimeType: req.file.mimetype,
      body: fs.createReadStream(req.file.path),
    };

    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, webViewLink, webContentLink",
    });

    if (!file.data || !file.data.id) {
      console.error("Drive file creation succeeded but returned no ID:", file.data);
      throw new Error("Failed to get file ID from Google Drive");
    }

    // Optional: Make file readable by anyone if the domain allows it
    try {
      await drive.permissions.create({
        fileId: file.data.id!,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        }
      });
    } catch (permError) {
      console.warn("Could not make file public (may be restricted by domain):", permError);
    }

    // Clean up local file
    fs.unlinkSync(req.file.path);

    res.json({ 
      fileId: file.data.id, 
      url: `/api/drive/image/${file.data.id}` 
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Upload failed" });
  }
});

app.get("/api/drive/image/:fileId", async (req, res) => {
  const tokensStr = req.cookies.google_tokens;
  if (!tokensStr) return res.status(401).send("Unauthorized");

  try {
    const tokens = JSON.parse(tokensStr);
    const auth = getAuthorizedClient(tokens, req);
    const drive = google.drive({ version: "v3", auth });

    const response = await drive.files.get(
      { fileId: req.params.fileId, alt: "media" },
      { responseType: "stream" }
    );

    res.setHeader("Content-Type", response.headers["content-type"] || "image/jpeg");
    response.data.pipe(res);
  } catch (error) {
    console.error("Proxy image error:", error);
    res.status(404).send("Image not found");
  }
});

app.get("/api/sheets/data", async (req, res) => {
  const tokensStr = req.cookies.google_tokens;
  if (!tokensStr) return res.status(401).json({ error: "Unauthorized" });

  try {
    const tokens = JSON.parse(tokensStr);
    const auth = getAuthorizedClient(tokens, req);
    const sheets = google.sheets({ version: "v4", auth });

    const spreadsheetId = await getOrCreateMasterSpreadsheet(auth);
    if (!spreadsheetId) throw new Error("Could not find or create master spreadsheet");

    // 2. Read data
    const dataResp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Procurement!A2:P1000",
    });

    const rows = dataResp.data.values || [];
    const items = rows.map((row, index) => {
      let vStatus = row[13] || "PENDING";
      // Legacy support for boolean-like strings
      if (vStatus === "TRUE") vStatus = "APPROVED";
      if (vStatus === "FALSE") vStatus = "PENDING";
      
      return {
        rowIndex: index + 2, // Spreadsheet row index for updates/deletes
        id: row[0],
        timestamp: row[1] || "",
        name: row[2] || "",
        quantity: row[3] || 0,
        unit: row[4] || "",
        price: row[5] || 0,
        totalPrice: row[6] || 0,
        storeLocation: row[7] || "",
        status: row[8] || "Penting (5x24 Jam)",
        requester: row[9] || "",
        description: row[10] || "",
        refLink: row[11] || "",
        refPhoto: row[12] || "",
        verificationStatus: vStatus,
        verificationReason: row[14] || "",
        verifierName: row[15] || ""
      };
    }).filter(item => item.id); // Filter out empty rows but keep original rowIndex

    res.json({ items, spreadsheetId });
  } catch (error) {
    console.error("Sheets API error:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.post("/api/sheets/add", async (req, res) => {
  const tokensStr = req.cookies.google_tokens;
  if (!tokensStr) return res.status(401).json({ error: "Unauthorized" });

  const { spreadsheetId, item } = req.body;
  try {
    const tokens = JSON.parse(tokensStr);
    const auth = getAuthorizedClient(tokens, req);
    const sheets = google.sheets({ version: "v4", auth });

    const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Procurement!A:P",
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          `ITEM-${Date.now()}`,
          timestamp,
          item.name,
          item.quantity,
          item.unit,
          item.price,
          item.totalPrice,
          item.storeLocation,
          item.status,
          item.requester,
          item.description,
          item.refLink,
          item.refPhoto,
          "PENDING",
          "",
          ""
        ]]
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Sheets Add error:", error);
    res.status(500).json({ error: "Failed to add item" });
  }
});

app.post("/api/sheets/update", async (req, res) => {
    const tokensStr = req.cookies.google_tokens;
    if (!tokensStr) return res.status(401).json({ error: "Unauthorized" });
  
    const { spreadsheetId, rowIndex, item } = req.body;
    try {
      const tokens = JSON.parse(tokensStr);
      const auth = getAuthorizedClient(tokens, req);
      const sheets = google.sheets({ version: "v4", auth });
  
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Procurement!A${rowIndex}:P${rowIndex}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [[
            item.id,
            item.timestamp || "",
            item.name,
            item.quantity,
            item.unit,
            item.price,
            item.totalPrice,
            item.storeLocation,
            item.status,
            item.requester,
            item.description,
            item.refLink,
            item.refPhoto,
            item.verificationStatus || "PENDING",
            item.verificationReason || "",
            item.verifierName || ""
          ]]
        }
      });
  
      res.json({ success: true });
    } catch (error) {
      console.error("Sheets Update error:", error);
      res.status(500).json({ error: "Failed to update item" });
    }
});

app.post("/api/sheets/verify", async (req, res) => {
  const tokensStr = req.cookies.google_tokens;
  if (!tokensStr) return res.status(401).json({ error: "Unauthorized" });

  const { spreadsheetId, rowIndex, status, reason, verifier } = req.body;
  try {
    const tokens = JSON.parse(tokensStr);
    const auth = getAuthorizedClient(tokens, req);
    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Procurement!N${rowIndex}:P${rowIndex}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[status, reason, verifier]]
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Sheets Verify error:", error);
    res.status(500).json({ error: "Failed to verify item" });
  }
});

app.get("/api/admin/users", async (req, res) => {
  const tokensStr = req.cookies.google_tokens;
  if (!tokensStr) return res.status(401).json({ error: "Unauthorized" });

  try {
    const tokens = JSON.parse(tokensStr);
    const auth = getAuthorizedClient(tokens, req);
    const oauth2 = google.oauth2({ version: "v2", auth });
    const userInfo = await oauth2.userinfo.get();
    
    const userEmail = userInfo.data.email?.toLowerCase().trim();
    const adminEmail = ADMIN_EMAIL.toLowerCase().trim();
    
    if (userEmail !== adminEmail) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const masterId = await getOrCreateMasterSpreadsheet(auth);
    const sheets = google.sheets({ version: "v4", auth });
    
    // Ensure Users sheet exists
    await ensureSheetExists(sheets, masterId, "Users", ["Email", "Name", "AddedAt"]);

    const usersResp = await sheets.spreadsheets.values.get({
      spreadsheetId: masterId,
      range: "Users!A2:C100",
    });

    const users = (usersResp.data.values || []).map((row, index) => ({
      rowIndex: index + 2,
      email: row[0],
      name: row[1] || "",
      addedAt: row[2] || ""
    }));

    res.json(users);
  } catch (error: any) {
    console.error("Fetch users error:", error.response?.data || error.message || error);
    res.status(500).json({ error: "Failed to fetch users", details: error.message });
  }
});

app.post("/api/admin/users/add", async (req, res) => {
  const tokensStr = req.cookies.google_tokens;
  if (!tokensStr) return res.status(401).json({ error: "Unauthorized" });

  const { email, name } = req.body;
  try {
    const tokens = JSON.parse(tokensStr);
    const auth = getAuthorizedClient(tokens, req);
    const oauth2 = google.oauth2({ version: "v2", auth });
    const userInfo = await oauth2.userinfo.get();
    
    const userEmail = userInfo.data.email?.toLowerCase().trim();
    const adminEmail = ADMIN_EMAIL.toLowerCase().trim();
    
    if (userEmail !== adminEmail) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const masterId = await getOrCreateMasterSpreadsheet(auth);
    const sheets = google.sheets({ version: "v4", auth });
    const drive = google.drive({ version: "v3", auth });

    // 0. Ensure Users sheet exists
    await ensureSheetExists(sheets, masterId, "Users", ["Email", "Name", "AddedAt"]);

    // 1. Add to sheet
    console.log(`Adding user email to sheet: ${email}`);
    await sheets.spreadsheets.values.append({
      spreadsheetId: masterId,
      range: "Users!A:C",
      valueInputOption: "RAW",
      requestBody: {
        values: [[email, name || "", new Date().toISOString()]]
      }
    });

    // 2. Share spreadsheet with user
    console.log(`Sharing sheet ${masterId} with ${email}`);
    try {
      await drive.permissions.create({
        fileId: masterId,
        requestBody: {
          role: 'writer',
          type: 'user',
          emailAddress: email
        }
      });
    } catch (e: any) {
      console.warn("Failed to share sheet automatically:", e.message);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Add user error:", error.response?.data || error.message || error);
    res.status(500).json({ error: "Failed to add user", details: error.message });
  }
});

app.post("/api/admin/users/delete", async (req, res) => {
  const tokensStr = req.cookies.google_tokens;
  if (!tokensStr) return res.status(401).json({ error: "Unauthorized" });

  const { rowIndex } = req.body;
  try {
    const tokens = JSON.parse(tokensStr);
    const auth = getAuthorizedClient(tokens, req);
    const oauth2 = google.oauth2({ version: "v2", auth });
    const userInfo = await oauth2.userinfo.get();
    
    const userEmail = userInfo.data.email?.toLowerCase().trim();
    const adminEmail = ADMIN_EMAIL.toLowerCase().trim();
    
    if (userEmail !== adminEmail) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const masterId = getMasterSpreadsheetId();
    if (!masterId) throw new Error("Master spreadsheet not initialized");

    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: masterId });
    const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === "Users");
    const sheetId = sheet?.properties?.sheetId;

    if (sheetId === undefined) throw new Error("Users sheet not found");

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: masterId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowIndex - 1,
              endIndex: rowIndex
            }
          }
        }]
      }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

app.post("/api/sheets/delete", async (req, res) => {
  const tokensStr = req.cookies.google_tokens;
  if (!tokensStr) return res.status(401).json({ error: "Unauthorized" });

  const { spreadsheetId, rowIndex, id, photoUrl } = req.body;
  try {
    const tokens = JSON.parse(tokensStr);
    const auth = getAuthorizedClient(tokens, req);
    const sheets = google.sheets({ version: "v4", auth });
    const drive = google.drive({ version: "v3", auth });

    // 1. Delete photo from Drive if exists
    if (photoUrl && photoUrl.includes("id=")) {
      try {
        // Robust extraction of fileId from the URL
        let fileId = "";
        if (photoUrl.includes("?")) {
          const urlObj = new URL(photoUrl);
          fileId = urlObj.searchParams.get("id") || "";
        } else {
          // Fallback for different formats
          fileId = photoUrl.split("id=")[1]?.split("&")[0] || "";
        }

        if (fileId) {
          console.log(`Attempting to delete file from Drive: ${fileId}`);
          await drive.files.delete({ fileId });
          console.log(`Successfully deleted file: ${fileId}`);
        }
      } catch (fileError) {
        console.error("Failed to delete file from Drive (non-fatal):", fileError);
      }
    }

    const spreadsheetIdNum = spreadsheetId as string;
    let rowIndexToDelete = parseInt(rowIndex as string, 10);

    if (isNaN(rowIndexToDelete)) {
      return res.status(400).json({ error: "Invalid rowIndex" });
    }

    // Robust Deletion: Verify ID first
    console.log(`Attempting to verify item ID ${id} before deleting row ${rowIndexToDelete}`);
    
    const dataResp = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetIdNum,
      range: "Procurement!A:A", // Just fetch IDs column
    });

    const allIds = dataResp.data.values || [];
    
    // Check if the ID at rowIndex matches
    // Remember rowIndex is 1-based, and Procurement!A:A includes header at index 0.
    // So row 2 is index 1.
    const currentIdAtRow = allIds[rowIndexToDelete - 1]?.[0];
    
    // Use string conversion and trim for robust comparison
    const normalizedTargetId = String(id).trim();
    const normalizedFoundId = currentIdAtRow ? String(currentIdAtRow).trim() : "";

    if (normalizedFoundId !== normalizedTargetId) {
      console.warn(`ID mismatch at row ${rowIndexToDelete}: Expected "${normalizedTargetId}", Found "${normalizedFoundId}". Searching for ID in all rows...`);
      // If it doesn't match, search for the ID in the entire column A
      const foundIndex = allIds.findIndex(row => row[0] && String(row[0]).trim() === normalizedTargetId);
      if (foundIndex === -1) {
        console.error(`Item ID "${normalizedTargetId}" not found in sheet column A. Column A values:`, allIds.flat().slice(0, 50));
        return res.status(404).json({ 
          error: "Item not found in database", 
          detail: `ID "${normalizedTargetId}" could not be located in the spreadsheet.` 
        });
      }
      rowIndexToDelete = foundIndex + 1; // Convert back to 1-based row index
      console.log(`Found item ID "${normalizedTargetId}" at row ${rowIndexToDelete}. Proceeding with delete.`);
    }

    // 2. Delete row from Sheet
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: spreadsheetIdNum });
    const sheetsList = spreadsheet.data.sheets;
    
    // Try to find the "Procurement" sheet, if not, use the first available sheet
    let sheet = sheetsList?.find(s => s.properties?.title === "Procurement");
    if (!sheet && sheetsList && sheetsList.length > 0) {
      console.log("Sheet 'Procurement' not found, using the first sheet instead");
      sheet = sheetsList[0];
    }

    const sheetId = sheet?.properties?.sheetId;

    if (sheetId === undefined) {
      console.error("No valid sheet found in spreadsheet");
      throw new Error("Target sheet could not be identified");
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetIdNum,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowIndexToDelete - 1,
              endIndex: rowIndexToDelete
            }
          }
        }]
      }
    });
    console.log(`Successfully deleted item ${id} from row ${rowIndexToDelete} (sheetId ${sheetId})`);

    res.json({ success: true });
  } catch (error: any) {
    console.error("Sheets Delete error detail:", error.response?.data || error.message);
    res.status(500).json({ 
      error: "Failed to delete item", 
      detail: error.response?.data?.error?.message || error.message 
    });
  }
});

// --- VITE MIDDLEWARE ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    } else {
      console.warn("Production: 'dist' folder not found. Only API routes will be available.");
    }
  }

  // Only listen if not on Vercel
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
