import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

const upload = multer({ dest: "uploads/" });

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL || 'http://localhost:3000'}/auth/callback`
);

// Scopes for Google Sheets and profile
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/drive.file"
];

// Helper to get authorized client
const getAuthorizedClient = (tokens: any) => {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL || 'http://localhost:3000'}/auth/callback`
  );
  client.setCredentials(tokens);
  return client;
};

// --- AUTH ROUTES ---

app.get("/api/auth/url", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent"
  });
  res.json({ url });
});

app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    
    // Set tokens in a secure cookie
    res.cookie("google_tokens", JSON.stringify(tokens), {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb;">
          <div style="text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
            <h1 style="color: #111827; margin-bottom: 0.5rem;">Berhasil!</h1>
            <p style="color: #4b5563;">Autentikasi berhasil. Jendela ini akan tertutup otomatis.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                setTimeout(() => window.close(), 1000);
              } else {
                window.location.href = '/';
              }
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error exchanging code:", error);
    res.status(500).send("Authentication failed");
  }
});

app.get("/api/auth/status", (req, res) => {
  const tokens = req.cookies.google_tokens;
  res.json({ isAuthenticated: !!tokens });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("google_tokens", {
    secure: true,
    sameSite: "none"
  });
  res.json({ success: true });
});

// --- GOOGLE SHEETS PROXY ---

const SPREADSHEET_NAME = "Procurement_Data_App";
const PHOTOS_FOLDER_NAME = "Procurement_Photos";

app.post("/api/upload", upload.single("file"), async (req, res) => {
  const tokensStr = req.cookies.google_tokens;
  if (!tokensStr) return res.status(401).json({ error: "Unauthorized" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const tokens = JSON.parse(tokensStr);
    const auth = getAuthorizedClient(tokens);
    const drive = google.drive({ version: "v3", auth });

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
    const auth = getAuthorizedClient(tokens);
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
    const auth = getAuthorizedClient(tokens);
    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    // 1. Find or create spreadsheet
    let spreadsheetId = "";
    const response = await drive.files.list({
      q: `name = '${SPREADSHEET_NAME}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
      fields: "files(id, name)",
    });

    if (response.data.files && response.data.files.length > 0) {
      spreadsheetId = response.data.files[0].id!;
    } else {
      const createResp = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: SPREADSHEET_NAME },
          sheets: [{
            properties: { title: "Procurement" }
          }]
        }
      });
      spreadsheetId = createResp.data.spreadsheetId!;
      
      // Initialize headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Procurement!A1:P1",
        valueInputOption: "RAW",
        requestBody: {
          values: [["ID", "Timestamp", "Nama Barang", "Kuantitas", "Satuan", "Harga Satuan", "Harga Total", "Lokasi Store", "Prioritas", "Pemohon", "Deskripsi", "Link Referensi", "Foto Referensi", "Persetujuan", "Deskripsi Persetujuan", "Verifikator"]]
        }
      });
    }

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
    const auth = getAuthorizedClient(tokens);
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
      const auth = getAuthorizedClient(tokens);
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
    const auth = getAuthorizedClient(tokens);
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

app.post("/api/sheets/delete", async (req, res) => {
  const tokensStr = req.cookies.google_tokens;
  if (!tokensStr) return res.status(401).json({ error: "Unauthorized" });

  const { spreadsheetId, rowIndex, id, photoUrl } = req.body;
  try {
    const tokens = JSON.parse(tokensStr);
    const auth = getAuthorizedClient(tokens);
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
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
