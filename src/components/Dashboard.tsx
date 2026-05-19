import React, { useState, useEffect } from "react";
import { 
  Plus, 
  Trash2, 
  Edit3, 
  LogOut, 
  RefreshCw, 
  FileSpreadsheet, 
  CheckCircle2, 
  Clock, 
  Package,
  ChevronRight,
  Search,
  Cloud,
  Camera,
  Image as ImageIcon,
  Calendar,
  ExternalLink,
  Link,
  X,
  ShieldCheck
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ProcurementItem } from "../types";
import axios from "axios";
import imageCompression from "browser-image-compression";

import AccountManagement from "./AccountManagement";

interface DashboardProps {
  authStatus: {
    isAuthenticated: boolean;
    user?: {
      name: string;
      email: string;
      picture: string;
    };
    role?: 'ADMIN' | 'USER' | 'UNAUTHORIZED';
  };
}

export default function Dashboard({ authStatus }: DashboardProps) {
  const [activeMainTab, setActiveMainTab] = useState<"dashboard" | "accounts">("dashboard");
  const [items, setItems] = useState<ProcurementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProcurementItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"inventaris" | "disetujui" | "ditolak" | "transfer" | "realisasi">("inventaris");
  const [uploading, setUploading] = useState(false);
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<ProcurementItem | null>(null);
  const [verifyItem, setVerifyItem] = useState<{ item: ProcurementItem, status: 'APPROVED' | 'REJECTED' } | null>(null);
  const [transferItem, setTransferItem] = useState<ProcurementItem | null>(null);
  const [transferForm, setTransferForm] = useState({
    amount: "",
    note: "",
    evidenceLink: "",
    verifier: ""
  });
  const [transferPhotoUrl, setTransferPhotoUrl] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);
  const [realizeItem, setRealizeItem] = useState<ProcurementItem | null>(null);
  const [realizeForm, setRealizeForm] = useState({
    amount: "",
    purchasedBy: "",
    invoiceLink: "",
  });
  const [realizePhotoUrl, setRealizePhotoUrl] = useState("");
  const [realizeLoading, setRealizeLoading] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [cancelConfirmItem, setCancelConfirmItem] = useState<ProcurementItem | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [stores, setStores] = useState<string[]>([]);
  const [verificators, setVerificators] = useState<string[]>([]);
  const [formFields, setFormFields] = useState({
    quantity: 0,
    price: 0
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: dataResp } = await axios.get("/api/sheets/data", { withCredentials: true });
      // Fetch categories
      try {
        const { data: catData } = await axios.get("/api/sheets/categories", { withCredentials: true });
        setCategories(catData.categories || []);
        setStores(catData.stores || []);
        setVerificators(catData.verificators || []);
      } catch (catErr) {
        console.warn("Failed to fetch categories/stores/verificators:", catErr);
      }
      
      // Normalize photo URLs
      const normalizedItems = dataResp.items.map((item: ProcurementItem) => {
        // Log for debugging (only for non-empty photos)
        if (item.refPhoto && item.refPhoto.length > 5) {
          console.log(`Item ${item.id} has photo: ${item.refPhoto.substring(0, 30)}...`);
        }
        
        let photo = item.refPhoto || "";
        // Catch common "bad" string values
        if (photo === "undefined" || photo === "null" || photo === "[object Object]") {
          photo = "";
        }

        return {
          ...item,
          refPhoto: normalizeDriveUrl(photo)
        };
      });
      setItems(normalizedItems);
      setSpreadsheetId(dataResp.spreadsheetId);
    } catch (error) {
      console.error("Fetch error", error);
    } finally {
      setLoading(false);
    }
  };

  const normalizeDriveUrl = (url: string) => {
    if (!url) return "";
    if (url.startsWith("/api/drive/image/")) return url;
    
    // Check for drive.google.com/file/d/ID/view format
    if (url.includes("drive.google.com/file/d/")) {
      const parts = url.split("/file/d/");
      if (parts.length > 1) {
        const id = parts[1].split("/")[0].split("?")[0];
        if (id) return `/api/drive/image/${id}`;
      }
    }
    
    // Check for drive.google.com/uc?id=... or drive.google.com/open?id=...
    if (url.includes("drive.google.com")) {
      const match = url.match(/[?&]id=([^&]+)/);
      if (match && match[1]) {
        const id = match[1].split("&")[0]; // Ensure no extra params
        return `/api/drive/image/${id}`;
      }
    }
    return url;
  };

  useEffect(() => {
    fetchData();
    // Clear form on mount/refresh
    setEditingItem(null);
    setFormFields({ quantity: 0, price: 0 });
    setUploadedPhotoUrl("");
    setLocalPreviewUrl(null);
  }, []);

  useEffect(() => {
    if (editingItem) {
      setFormFields({
        quantity: Number(editingItem.quantity),
        price: Number(editingItem.price)
      });
      setUploadedPhotoUrl(editingItem.refPhoto || "");
      setLocalPreviewUrl(null);
    } else {
      setFormFields({ quantity: 0, price: 0 });
      setUploadedPhotoUrl("");
      setLocalPreviewUrl(null);
    }
  }, [editingItem]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Create local preview
    const localUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(localUrl);
    
    setUploading(true);
    
    try {
      // Compression options
      const options = {
        maxSizeMB: 0.8, // Target size under 800KB for faster loading
        maxWidthOrHeight: 1280, // Reasonable resolution for documents/refs
        useWebWorker: true,
      };
      
      const compressedFile = await imageCompression(file, options);
      
      const formData = new FormData();
      formData.append("file", compressedFile);

      const { data } = await axios.post("/api/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        withCredentials: true
      });
      
      if (data && data.url) {
        setUploadedPhotoUrl(normalizeDriveUrl(data.url));
      } else {
        console.error("Upload response missing URL:", data);
        throw new Error("Invalid response from server: URL missing");
      }
    } catch (error: any) {
      console.error("Upload error details:", error.response?.data || error.message);
      alert(`Gagal mengunggah foto: ${error.response?.data?.error || error.message}`);
      // If upload fails, we might want to keep the local preview or clear it
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = () => {
    if (confirm("Hapus lampiran foto ini?")) {
      setUploadedPhotoUrl("");
      setLocalPreviewUrl(null);
    }
  };

  const handleLogout = async () => {
    await axios.post("/api/auth/logout", {}, { withCredentials: true });
    window.location.reload();
  };

  const handleDelete = async (item: ProcurementItem) => {
    if (!item || !item.id) return;
    
    try {
      setLoading(true);
      console.log(`Executing deletion for item: ${item.id} at row: ${item.rowIndex}`, { spreadsheetId });
      
      const response = await axios.post("/api/sheets/delete", { 
        spreadsheetId, 
        id: item.id,
        rowIndex: item.rowIndex, 
        photoUrl: item.refPhoto 
      }, { withCredentials: true });
      
      if (response.data.success) {
        console.log("Delete successful");
        // Filter out locally for instant feedback
        setItems(prev => prev.filter(i => i.id !== item.id));
        // Re-fetch to ensure sync (since row indices change in Sheets after deletion)
        await fetchData();
        setIsFormOpen(false);
        setEditingItem(null);
        setDeleteConfirmItem(null);
      }
    } catch (error: any) {
      console.error("Delete failed", error);
      const errorDetail = error.response?.data?.detail || "";
      const errorMsg = error.response?.data?.error || error.message;
      
      let finalMsg = `Gagal menghapus: ${errorMsg}`;
      if (errorDetail) finalMsg += `\nDetail: ${errorDetail}`;
      
      if (errorMsg.includes("permissions") || errorDetail.includes("permission") || error.response?.status === 403) {
        finalMsg += "\n\nSaran: Coba LOGOUT dan LOGIN kembali untuk memperbarui izin akses (Google Drive Scope).";
      }
      
      alert(finalMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleAddOrUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const qty = Number(formData.get("quantity")) || 0;
    const price = Number(formData.get("price")) || 0;
    const itemData = {
      id: editingItem?.id || "",
      name: formData.get("name") as string,
      category: formData.get("category") as string,
      quantity: qty,
      unit: formData.get("unit") as string,
      price: price,
      totalPrice: qty * price,
      storeLocation: formData.get("storeLocation") as string,
      status: formData.get("status") as string,
      requester: formData.get("requester") as string,
      description: formData.get("description") as string,
      refLink: formData.get("refLink") as string,
      refPhoto: uploadedPhotoUrl,
      timestamp: editingItem?.id ? editingItem.timestamp : "",
      verificationStatus: editingItem?.verificationStatus || "PENDING",
      verificationReason: editingItem?.verificationReason || "",
      verifierName: editingItem?.verifierName || "",
    };

    try {
      if (editingItem) {
        await axios.post("/api/sheets/update", {
          spreadsheetId,
          rowIndex: editingItem.rowIndex,
          item: itemData
        }, { withCredentials: true });
      } else {
        await axios.post("/api/sheets/add", {
          spreadsheetId,
          item: itemData
        }, { withCredentials: true });
      }
      setIsFormOpen(false);
      setEditingItem(null);
      // Ensure state is fully reset
      setFormFields({ quantity: 0, price: 0 });
      setUploadedPhotoUrl("");
      setLocalPreviewUrl(null);
      if (e.currentTarget) {
        e.currentTarget.reset();
      }
      await fetchData();
    } catch (error) {
      alert("Gagal menyimpan");
    }
  };

  const handleApprove = (item: ProcurementItem) => {
    setVerifyItem({ item, status: 'APPROVED' });
  };

  const handleReject = (item: ProcurementItem) => {
    setVerifyItem({ item, status: 'REJECTED' });
  };

  const handleTransfer = (item: ProcurementItem) => {
    setTransferItem(item);
    setTransferForm({
      amount: item.totalPrice.toString(),
      note: "",
      evidenceLink: "",
      verifier: authStatus.user?.name || ""
    });
    setTransferPhotoUrl("");
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferItem) return;

    try {
      setTransferLoading(true);
      await axios.post("/api/sheets/transfer", {
        spreadsheetId,
        rowIndex: transferItem.rowIndex,
        transferData: {
          verifier: transferForm.verifier,
          amount: transferForm.amount,
          note: transferForm.note,
          evidenceLink: transferForm.evidenceLink,
          evidencePhoto: transferPhotoUrl
        }
      }, { withCredentials: true });
      
      setTransferItem(null);
      setTransferForm({
        amount: "",
        note: "",
        evidenceLink: "",
        verifier: ""
      });
      setTransferPhotoUrl("");
      await fetchData();
      alert("Item berhasil di-transfer ke tahap pengelolaan aset.");
    } catch (err) {
      alert("Gagal memproses transfer.");
    } finally {
      setTransferLoading(false);
    }
  };

  const handleRealizeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!realizeItem) return;

    try {
      setRealizeLoading(true);
      await axios.post("/api/sheets/realize", {
        spreadsheetId,
        rowIndex: realizeItem.rowIndex,
        realizationData: {
          amount: realizeForm.amount,
          purchasedBy: realizeForm.purchasedBy,
          invoiceLink: realizeForm.invoiceLink,
          photo: realizePhotoUrl
        }
      }, { withCredentials: true });
      
      setRealizeItem(null);
      setRealizeForm({
        amount: "",
        purchasedBy: "",
        invoiceLink: "",
      });
      setRealizePhotoUrl("");
      await fetchData();
      alert("Item berhasil direalisasikan.");
    } catch (err) {
      alert("Gagal memproses realisasi.");
    } finally {
      setRealizeLoading(false);
    }
  };

  const executeCancel = async (item: ProcurementItem, reason: string, verifier: string) => {
    const isApproved = item.verificationStatus === 'APPROVED';
    
    try {
      setLoading(true);
      await axios.post("/api/sheets/verify", {
        spreadsheetId,
        rowIndex: item.rowIndex,
        status: isApproved ? "REJECTED" : "PENDING",
        reason: reason || (isApproved ? "Pembatalan Persetujuan (Pindah ke Ditolak)" : "Pembatalan Penolakan"),
        verifier: verifier || ""
      }, { withCredentials: true });
      await fetchData();
      setCancelConfirmItem(null);
    } catch (err) {
      alert("Gagal memproses pembatalan.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!verifyItem) return;

    const formData = new FormData(e.currentTarget);
    const reason = formData.get("reason") as string;
    const verifier = formData.get("verifier") as string;

    try {
      setLoading(true);
      // Optimistic update
      setItems(prev => prev.map(i => i.id === verifyItem.item.id ? { 
        ...i, 
        verificationStatus: verifyItem.status,
        verificationReason: reason,
        verifierName: verifier
      } : i));
      
      await axios.post("/api/sheets/verify", {
        spreadsheetId,
        rowIndex: verifyItem.item.rowIndex,
        status: verifyItem.status,
        reason,
        verifier
      }, { withCredentials: true });
      setVerifyItem(null);
    } catch (error) {
      console.error("Verification failed", error);
      fetchData(); // Rollback by refetching
      alert("Gagal memproses verifikasi");
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter(item => {
    const name = item.name || "";
    const status = item.status || "";
    const search = searchQuery.toLowerCase();
    
    const matchesSearch = name.toLowerCase().includes(search) ||
                         status.toLowerCase().includes(search) ||
                         (item.id && item.id.toLowerCase().includes(search));
    
    let matchesTab = false;
    const vStatus = item.verificationStatus || "PENDING";
    
    if (activeTab === "inventaris") matchesTab = vStatus === "PENDING";
    else if (activeTab === "disetujui") matchesTab = vStatus === "APPROVED";
    else if (activeTab === "ditolak") matchesTab = vStatus === "REJECTED";
    else if (activeTab === "transfer") matchesTab = vStatus === "TRANSFERRED";
    else if (activeTab === "realisasi") matchesTab = vStatus === "REALIZED";
    
    return matchesSearch && matchesTab;
  });

  if (authStatus.role === 'UNAUTHORIZED') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-8 bg-white p-12 rounded-[40px] shadow-2xl shadow-black/5 border border-zinc-100">
          <div className="w-24 h-24 bg-red-50 text-red-500 rounded-[32px] flex items-center justify-center mx-auto shadow-inner">
            <ShieldCheck className="w-12 h-12" />
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-black uppercase tracking-tighter">Akses Ditolak</h1>
            <p className="text-zinc-500 text-sm font-medium leading-relaxed">
              Email <span className="font-bold text-black">{authStatus.user?.email}</span> belum terdaftar di sistem pusat. Silakan hubungi Admin untuk mendaftarkan akun Anda.
            </p>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full bg-black text-white py-5 rounded-[24px] font-black uppercase text-xs tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-black/20"
          >
            Keluar Sistem
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-zinc-900 font-sans overflow-hidden">
      {/* Header Section */}
      <header className="h-auto min-h-[5rem] flex flex-col md:flex-row items-stretch md:items-center justify-between px-4 sm:px-8 bg-white border-b border-zinc-100 shrink-0 gap-4 py-4 md:py-0">
        <div className="flex items-center justify-between md:justify-start gap-6 lg:gap-10">
          <div className="flex items-center gap-2 sm:gap-3 group cursor-pointer" onClick={() => setActiveMainTab("dashboard")}>
            <div className="bg-black p-2 sm:p-2.5 rounded-xl shadow-lg shadow-black/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <div className="relative w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center">
                <div className="absolute left-0 top-0 w-0.5 sm:w-1 h-2 sm:h-3 bg-white rounded-full"></div>
                <div className="absolute left-1 sm:left-1.5 top-0 w-0.5 sm:w-1 h-2 sm:h-3 bg-white rounded-full"></div>
                <div className="absolute w-5 sm:w-6 h-0.5 sm:h-1 bg-white rounded-full rotate-[135deg]"></div>
                <div className="absolute right-0 bottom-0 w-0.5 sm:w-1 h-2 sm:h-3 bg-white rounded-full"></div>
                <div className="absolute right-1 sm:right-1.5 bottom-0 w-0.5 sm:w-1 h-2 sm:h-3 bg-white rounded-full"></div>
              </div>
            </div>
            <div className="flex flex-col">
              <h1 className="text-lg sm:text-xl font-display font-black tracking-tighter leading-none uppercase">
                SEBELAS<span className="text-zinc-400">.FORM</span>
              </h1>
              <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-400 mt-0.5">Procurement System</span>
            </div>
          </div>
          
            <nav className="flex items-center gap-1 sm:gap-2 bg-zinc-50 p-1 rounded-2xl overflow-x-auto no-scrollbar max-w-[150px] sm:max-w-none">
            <button 
              onClick={() => {
                setActiveMainTab("dashboard");
                setActiveTab("inventaris");
              }}
              className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeMainTab === "dashboard" ? "bg-white shadow-sm border border-zinc-100 text-black" : "text-zinc-400 hover:text-black"}`}
            >
              <FileSpreadsheet className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
              <span>Dashboard</span>
            </button>
            {authStatus.role === 'ADMIN' && (
              <button 
                onClick={() => setActiveMainTab("accounts")}
                className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeMainTab === "accounts" ? "bg-white shadow-sm border border-zinc-100 text-black" : "text-zinc-400 hover:text-black"}`}
              >
                <ShieldCheck className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                <span>Akun</span>
              </button>
            )}
          </nav>
        </div>
        
        <div className="flex items-center justify-between md:justify-end gap-4 sm:gap-6">
          <div className="flex items-center gap-2 sm:gap-3 bg-zinc-50 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl border border-zinc-100">
            <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[9px] sm:text-[11px] font-bold text-zinc-500">Aktif</span>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={fetchData}
              className="p-2 sm:p-3 bg-zinc-50 hover:bg-zinc-100 rounded-2xl transition-all border border-zinc-100 group"
              title="Sinkronisasi Data"
            >
              <RefreshCw className={`w-3.5 sm:w-4 h-3.5 sm:h-4 text-zinc-400 group-hover:text-black transition-colors ${loading ? 'animate-spin text-black' : ''}`} />
            </button>
            <button 
              onClick={handleLogout}
              className="p-2 sm:p-3 bg-zinc-50 hover:bg-red-50 rounded-2xl transition-all border border-zinc-100 text-zinc-400 hover:text-red-600 group"
              title="Keluar"
            >
              <LogOut className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 flex overflow-hidden">
        {activeMainTab === "accounts" ? (
          <div className="flex-1 overflow-y-auto">
            <AccountManagement authStatus={authStatus} />
          </div>
        ) : (
          <>
            {/* List View Column */}
            <section className="flex-1 flex flex-col bg-slate-50 overflow-hidden relative">
          <div className="p-4 sm:p-8 pb-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="flex flex-col">
              <h2 className="text-sm font-bold text-zinc-400 mb-1">
                {activeTab === "inventaris" ? "Daftar Pengadaan Aktif" : 
                 activeTab === "disetujui" ? "Daftar Pengadaan Disetujui" : 
                 activeTab === "ditolak" ? "Daftar Pengadaan Ditolak" :
                 activeTab === "transfer" ? "Daftar Pengadaan Ditransfer" : "Daftar Pengadaan Direalisasi"}
              </h2>
              <div className="flex items-center gap-4">
                <span className="text-2xl sm:text-3xl font-display font-bold tracking-tight">
                  {activeTab === "inventaris" ? "Inventaris" : 
                   activeTab === "disetujui" ? "Disetujui" : 
                   activeTab === "ditolak" ? "Ditolak" :
                   activeTab === "transfer" ? "Transfer" : "Realisasi"}
                </span>
                <span className="px-3 py-1 bg-black text-white rounded-full text-[11px] font-bold">
                  {filteredItems.length}
                </span>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full lg:w-auto">
              {/* PC & Mobile Tab Switcher */}
              <div className="flex bg-zinc-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto no-scrollbar">
                 <button 
                  onClick={() => setActiveTab("inventaris")}
                  className={`flex-1 sm:px-6 py-2.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap ${activeTab === "inventaris" ? "bg-white text-black shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                 >
                   Inventaris
                 </button>
                 <button 
                  onClick={() => setActiveTab("disetujui")}
                  className={`flex-1 sm:px-6 py-2.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap ${activeTab === "disetujui" ? "bg-white text-black shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                 >
                   Disetujui
                 </button>
                 <button 
                  onClick={() => setActiveTab("ditolak")}
                  className={`flex-1 sm:px-6 py-2.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap ${activeTab === "ditolak" ? "bg-white text-black shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                 >
                   Ditolak
                 </button>
                 <button 
                  onClick={() => setActiveTab("transfer")}
                  className={`flex-1 sm:px-6 py-2.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap ${activeTab === "transfer" ? "bg-white text-black shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                 >
                   Transfer
                 </button>
                 <button 
                  onClick={() => setActiveTab("realisasi")}
                  className={`flex-1 sm:px-6 py-2.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap ${activeTab === "realisasi" ? "bg-white text-black shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                 >
                   Realisasi
                 </button>
              </div>

              <div className="relative w-full sm:w-60 lg:focus-within:w-80 transition-all duration-300">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300" />
                <input 
                  type="text" 
                  placeholder="Cari barang..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-5 py-3 bg-white border border-zinc-100 rounded-2xl focus:border-black outline-none text-sm font-medium transition-all shadow-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-4 space-y-4">
            {loading && items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-zinc-100 flex items-center justify-center mb-4">
                  <RefreshCw className="w-6 h-6 text-black animate-spin" />
                </div>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Sinkronisasi Data...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full bg-white rounded-[32px] border border-zinc-100 shadow-sm">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                  <Package className="w-10 h-10 text-zinc-200" />
                </div>
                <h3 className="text-lg font-display font-bold text-zinc-900">Belum ada data</h3>
                <p className="text-sm font-medium text-zinc-400 mt-2">Daftar pengadaan masih kosong atau tidak ditemukan.</p>
              </div>
            ) : (
              <div className="space-y-4 pb-12">
                <AnimatePresence mode="popLayout">
                  {filteredItems.map((item) => (
                    <motion.div 
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="group bg-white rounded-[24px] p-6 shadow-sm border border-zinc-100/50 hover:shadow-xl hover:shadow-black/5 transition-all flex flex-col sm:flex-row items-stretch sm:items-center gap-6"
                    >
                      {/* Photo Thumbnail */}
                      <div className="flex flex-col gap-3 shrink-0 w-full sm:w-32">
                        <div 
                          className={`w-full h-32 bg-zinc-50 rounded-2xl overflow-hidden border border-zinc-100 relative group ${item.refPhoto ? 'cursor-zoom-in' : ''}`}
                          onClick={() => item.refPhoto && setPreviewImageUrl(item.refPhoto)}
                        >
                          {item.refPhoto ? (
                            <>
                              <img 
                                src={item.refPhoto} 
                                alt={item.name} 
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = `https://placehold.co/400x400/f8fafc/94a3b8?text=Error+Loading`;
                                }}
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Search className="w-5 h-5 text-white" />
                              </div>
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-200">
                              <ImageIcon className="w-8 h-8 mb-1" />
                              <span className="text-[10px] font-bold uppercase tracking-tighter">Tanpa Foto</span>
                            </div>
                          )}
                        </div>

                        {/* Reference Link moved below photo */}
                        {item.refLink ? (
                          <a 
                            href={item.refLink} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="flex items-center justify-center gap-2 w-full py-2 bg-zinc-50 hover:bg-black hover:text-white rounded-xl border border-zinc-100 transition-all group"
                          >
                            <Link className="w-3 h-3 text-zinc-400 group-hover:text-white" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Buka Referensi</span>
                          </a>
                        ) : (
                           <div className="flex items-center justify-center gap-2 w-full py-2 bg-zinc-50/30 rounded-xl border border-zinc-100/50 cursor-not-allowed opacity-40">
                             <Link className="w-3 h-3 text-zinc-200" />
                             <span className="text-[9px] font-black uppercase tracking-widest text-zinc-300">No Referensi</span>
                           </div>
                        )}
                      </div>

                      <div className="flex-1 flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 w-full min-w-0">
                        <div className="w-full md:w-32 shrink-0 flex flex-row md:flex-col items-center md:items-start justify-between md:justify-center gap-2 border-b md:border-b-0 border-zinc-50 pb-3 md:pb-0">
                          <div className="space-y-1">
                            <div className="text-[8px] sm:text-[9px] font-bold text-zinc-400 uppercase tracking-widest leading-none">Waktu Pengadaan</div>
                            <div className="flex items-center gap-2 md:block">
                              <div className="text-[10px] sm:text-[11px] font-bold text-zinc-300 uppercase tracking-widest leading-none">{item.timestamp?.split(',')[0]}</div>
                              <div className="text-xs sm:text-sm font-bold text-zinc-900 leading-none">
                                {item.timestamp?.split(',')[1]?.trim().split(/[.:]/).slice(0, 2).join(':')}
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex-1 min-0 w-full">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className="text-[8px] sm:text-[9px] font-black bg-zinc-900 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter shrink-0">{item.id}</span>
                            {item.category && (
                               <span className="text-[8px] sm:text-[9px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded uppercase tracking-tighter shrink-0">{item.category}</span>
                            )}
                            <h4 className="text-base sm:text-lg font-display font-bold tracking-tight uppercase truncate max-w-full">{item.name}</h4>
                          </div>
                          <p className="text-[11px] sm:text-xs text-zinc-400 font-medium line-clamp-2 mb-4 leading-relaxed">{item.description || "Tidak ada deskripsi."}</p>
                          
                          <div className="flex flex-wrap gap-1.5 sm:gap-2">
                             <div className="flex items-center gap-1.5 sm:gap-2 bg-zinc-50 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-zinc-100">
                               <Package className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-zinc-400" />
                               <span className="text-[10px] sm:text-xs font-bold text-black">{item.quantity} <span className="text-[8px] uppercase text-zinc-400 ml-0.5">{item.unit || 'Unit'}</span></span>
                             </div>
                             <div className="flex items-center gap-1.5 sm:gap-2 bg-zinc-50 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-zinc-100">
                               <span className="text-[8px] sm:text-[10px] font-bold text-zinc-400 uppercase">Satuan:</span>
                               <span className="text-[10px] sm:text-xs font-bold text-black">Rp{Number(item.price).toLocaleString()}</span>
                             </div>
                             {item.storeLocation && (
                               <div className="flex items-center gap-1.5 sm:gap-2 bg-zinc-50 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-zinc-100">
                                 <span className="text-[8px] sm:text-[10px] font-bold text-zinc-400 uppercase">Store:</span>
                                 <span className="text-[8px] sm:text-[10px] font-bold uppercase text-black truncate max-w-[100px] sm:max-w-[150px]">{item.storeLocation}</span>
                               </div>
                             )}
                             <div className="flex items-center gap-1.5 sm:gap-2 bg-zinc-50 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-zinc-100">
                               <span className="text-[8px] sm:text-[10px] font-bold text-zinc-400 uppercase">Pemohon:</span>
                               <span className="text-[8px] sm:text-[10px] font-bold uppercase text-black truncate max-w-[80px] sm:max-w-[120px]">{item.requester}</span>
                             </div>
                             <div className="flex items-center gap-1.5 sm:gap-2 bg-zinc-50 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-zinc-100">
                               <span className="text-[8px] sm:text-[10px] font-bold text-zinc-400 uppercase">Prioritas:</span>
                               <span className={`text-[8px] sm:text-[10px] font-bold uppercase tracking-wider ${item.status.includes('Urgent') || item.status.includes('Mendesak') ? 'text-red-500' : 'text-zinc-600'}`}>
                                {item.status}
                              </span>
                            </div>
                            {(item.verificationStatus === 'TRANSFERRED' || item.verificationStatus === 'REALIZED') && (
                               <div className="mt-4 pt-3 border-t border-zinc-50 space-y-2.5">
                                 {/* Approval Stage Info */}
                                 <div className="flex flex-wrap items-center gap-2">
                                   <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                                     <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                     <span className="text-[9px] font-bold text-emerald-700 uppercase leading-none">Persetujuan: {item.verifierName}</span>
                                   </div>
                                   {item.verificationReason && (
                                      <div className="flex items-center gap-1.5 bg-zinc-50 px-2 py-1 rounded-lg border border-zinc-100 italic">
                                        <span className="text-[9px] font-medium text-zinc-500 truncate max-w-[180px]">"{item.verificationReason}"</span>
                                      </div>
                                   )}
                                 </div>

                                 {/* Transfer Stage Info */}
                                 <div className="flex flex-wrap items-center gap-2">
                                   <div className="flex items-center gap-1.5 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">
                                     <RefreshCw className="w-3 h-3 text-indigo-400" />
                                     <span className="text-[9px] font-bold text-indigo-700 uppercase leading-none">Transfer: {item.transferVerifier}</span>
                                   </div>
                                   {item.transferNote && (
                                      <div className="flex items-center gap-1.5 bg-zinc-50 px-2 py-1 rounded-lg border border-zinc-100 italic">
                                        <span className="text-[9px] font-medium text-zinc-500 truncate max-w-[180px]">"{item.transferNote}"</span>
                                      </div>
                                   )}
                                   <div className="flex gap-1 ml-auto">
                                      {item.transferEvidenceLink && (
                                        <a href={item.transferEvidenceLink} target="_blank" rel="noreferrer" className="p-1 px-1.5 bg-indigo-50 text-indigo-600 rounded-md border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all">
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      )}
                                      {item.transferEvidencePhoto && (
                                        <button onClick={() => setPreviewImageUrl(item.transferEvidencePhoto || "")} className="p-1 px-1.5 bg-indigo-50 text-indigo-600 rounded-md border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all">
                                          <ImageIcon className="w-3 h-3" />
                                        </button>
                                      )}
                                   </div>
                                 </div>

                                 {/* Realization Stage Info (if applicable) */}
                                 {item.verificationStatus === 'REALIZED' && (
                                   <div className="flex flex-wrap items-center gap-2">
                                     <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                                       <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                       <span className="text-[9px] font-bold text-emerald-700 uppercase leading-none">Dibeli: {item.purchasedBy}</span>
                                     </div>
                                     <div className="flex items-center gap-1.5 bg-zinc-50 px-2 py-1 rounded-lg border border-zinc-100">
                                        <span className="text-[9px] font-bold text-zinc-700 uppercase leading-none">Nilai: Rp{Number(item.realizationAmount).toLocaleString()}</span>
                                     </div>
                                     <div className="flex gap-1 ml-auto">
                                        {item.invoiceLink && (
                                          <a href={item.invoiceLink} target="_blank" rel="noreferrer" className="p-1 px-1.5 bg-emerald-50 text-emerald-600 rounded-md border border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all">
                                            <ExternalLink className="w-3 h-3" />
                                          </a>
                                        )}
                                        {item.realizationPhoto && (
                                          <button onClick={() => setPreviewImageUrl(item.realizationPhoto || "")} className="p-1 px-1.5 bg-emerald-50 text-emerald-600 rounded-md border border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all">
                                            <ImageIcon className="w-3 h-3" />
                                          </button>
                                        )}
                                     </div>
                                   </div>
                                 )}
                               </div>
                            )}
                            {item.verificationStatus !== "PENDING" && item.verificationStatus && item.verificationStatus !== 'TRANSFERRED' && item.verificationStatus !== 'REALIZED' && (
                               <div className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border ${item.verificationStatus === 'REJECTED' ? 'bg-red-50 border-red-100 text-red-700' : 'bg-green-50 border-green-100 text-green-700'}`}>
                                 <span className="text-[8px] sm:text-[10px] font-bold uppercase">Verif:</span>
                                 <span className="text-[8px] sm:text-[10px] font-bold uppercase truncate max-w-[60px] sm:max-w-[100px]">{item.verifierName}</span>
                               </div>
                             )}
                          </div>
                          {item.verificationReason && item.verificationStatus !== 'TRANSFERRED' && item.verificationStatus !== 'REALIZED' && (
                            <p className="mt-3 text-[9px] sm:text-[10px] font-medium text-zinc-400 italic line-clamp-2">" {item.verificationReason} "</p>
                          )}

                          {authStatus.role === 'ADMIN' && item.verificationStatus === 'PENDING' && (
                            <div className="mt-6 flex flex-row sm:flex-row gap-3 w-full sm:w-auto">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleApprove(item);
                                }}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl transition-all hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-emerald-600/20 group"
                              >
                                <CheckCircle2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                <span className="text-xs font-black uppercase tracking-widest">Setujui</span>
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReject(item);
                                }}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white text-rose-600 border-2 border-rose-100 rounded-2xl transition-all hover:bg-rose-50 hover:border-rose-200 active:scale-[0.98] group"
                              >
                                <X className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                                <span className="text-xs font-black uppercase tracking-widest">Tolak</span>
                              </button>
                            </div>
                          )}

                          {/* Batalkan button removed for REJECTED status per user request */}
                          {authStatus.role === 'ADMIN' && item.verificationStatus === 'REJECTED' && false && (
                             <div className="mt-6 flex flex-row sm:flex-row gap-3 w-full sm:w-auto">
                               <button 
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   setCancelConfirmItem(item);
                                 }}
                                 className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white text-zinc-600 border-2 border-zinc-100 rounded-2xl transition-all hover:bg-zinc-50 hover:border-zinc-200 active:scale-[0.98] group"
                               >
                                 <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                                 <span className="text-xs font-black uppercase tracking-widest">Batalkan</span>
                               </button>
                             </div>
                          )}

                          {authStatus.role === 'ADMIN' && item.verificationStatus === 'APPROVED' && (
                            <div className="mt-6 flex flex-row sm:flex-row gap-3 w-full sm:w-auto">
                               <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTransfer(item);
                                }}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl transition-all hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-indigo-600/20 group"
                              >
                                <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-700" />
                                <span className="text-xs font-black uppercase tracking-widest">Transfer</span>
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCancelConfirmItem(item);
                                }}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white text-zinc-600 border-2 border-zinc-100 rounded-2xl transition-all hover:bg-zinc-50 hover:border-zinc-200 active:scale-[0.98] group"
                              >
                                <X className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                <span className="text-xs font-black uppercase tracking-widest">Batalkan</span>
                              </button>
                            </div>
                          )}
                        </div>
 
                         <div className="text-left md:text-right shrink-0 w-full md:w-auto border-t md:border-t-0 border-zinc-50 pt-3 md:pt-0">
                           {(item.verificationStatus === 'TRANSFERRED' || item.verificationStatus === 'REALIZED') && (
                             <div className="mb-2">
                               <p className="text-[8px] sm:text-[9px] font-bold text-zinc-300 uppercase tracking-widest leading-none mb-1">Pengajuan Awal</p>
                               <p className="text-[10px] sm:text-xs font-bold text-zinc-400 leading-none line-through">Rp{Number(item.totalPrice).toLocaleString()}</p>
                             </div>
                           )}
                           {item.verificationStatus === 'REALIZED' && item.transferAmount && (
                             <div className="mb-2">
                               <p className="text-[8px] sm:text-[9px] font-bold text-zinc-300 uppercase tracking-widest leading-none mb-1">Dana Ditransfer</p>
                               <p className="text-[10px] sm:text-xs font-bold text-indigo-400 leading-none line-through">Rp{Number(item.transferAmount).toLocaleString()}</p>
                             </div>
                           )}
                           <p className="text-[8px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1 leading-none">
                             {item.verificationStatus === 'REALIZED' ? "Nilai Realisasi" : (item.verificationStatus === 'TRANSFERRED' ? "Dana Terkirim" : "Total Pengajuan")}
                           </p>
                           <p className={`text-xl sm:text-2xl font-display font-bold tracking-tight leading-none ${item.verificationStatus === 'TRANSFERRED' ? 'text-indigo-600' : item.verificationStatus === 'REALIZED' ? 'text-emerald-600' : 'text-zinc-900'}`}>
                             Rp{Number(item.verificationStatus === 'REALIZED' ? item.realizationAmount : (item.verificationStatus === 'TRANSFERRED' ? item.transferAmount : item.totalPrice)).toLocaleString()}
                           </p>
                           {(activeTab === 'transfer' || activeTab === 'realisasi') && (
                             <p className={`mt-2 text-[8px] sm:text-[9px] font-black uppercase tracking-widest ${item.verificationStatus === 'REALIZED' ? 'text-emerald-600' : 'text-indigo-600'}`}>
                               Status: {item.verificationStatus === 'REALIZED' ? 'Terealisasi' : 'Dana Terkirim'}
                             </p>
                           )}
                           {item.verificationStatus === 'TRANSFERRED' && (
                             <button 
                               onClick={(e) => {
                                 e.stopPropagation();
                                 setRealizeItem(item);
                                 setRealizeForm({
                                   amount: item.transferAmount?.toString() || item.totalPrice.toString(),
                                   purchasedBy: "",
                                   invoiceLink: "",
                                 });
                                 setRealizePhotoUrl("");
                               }}
                               className="mt-2 inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition-all font-display shadow-lg shadow-emerald-600/20 group"
                             >
                               <CheckCircle2 className="w-3 h-3 group-hover:scale-110 transition-transform" />
                               <span className="text-[9px] font-black uppercase tracking-widest">Konfirmasi Realisasi</span>
                             </button>
                           )}
                           {item.verificationStatus === 'REALIZED' && (
                             <div className="mt-2 inline-block bg-emerald-600 text-white px-2 py-1 rounded-md">
                               <span className="text-[9px] font-black uppercase tracking-widest">Terealisasi</span>
                             </div>
                           )}
                        </div>
                      </div>

                      <div className="w-full lg:w-auto flex flex-row lg:flex-col items-center justify-center gap-2 border-t lg:border-t-0 lg:border-l border-zinc-50/50 pt-4 lg:pt-0 lg:pl-6 shrink-0">
                        {/* Action buttons removed link since it's now under photo */}
                        
                        {/* Role Based Access Control for Edit/Delete */}
                        {(authStatus.role === 'ADMIN' || (authStatus.role === 'USER' && (item.verificationStatus === 'PENDING' || !item.verificationStatus))) ? (
                          <>
                            <button 
                              onClick={() => {
                                setEditingItem(item);
                                setIsFormOpen(true);
                              }}
                              className="flex-1 lg:flex-none w-full lg:min-w-[44px] h-12 lg:h-11 rounded-xl lg:rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-400 hover:bg-black hover:text-white transition-all shadow-sm"
                              title="Ubah Data"
                            >
                              <Edit3 className="w-4 h-4 sm:w-5 sm:h-5" />
                              <span className="lg:hidden ml-2 text-xs font-bold uppercase">Ubah</span>
                            </button>
                            <button 
                              onClick={() => setDeleteConfirmItem(item)}
                              className="flex-1 lg:flex-none w-full lg:min-w-[44px] h-12 lg:h-11 rounded-xl lg:rounded-2xl bg-red-50 flex items-center justify-center text-red-300 hover:bg-red-600 hover:text-white transition-all shadow-sm"
                              title="Hapus Data"
                            >
                              <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                              <span className="lg:hidden ml-2 text-xs font-bold uppercase">Hapus</span>
                            </button>
                          </>
                        ) : (
                          <div className="flex-[2] lg:flex-none w-full lg:w-11 lg:h-24 bg-zinc-50 rounded-xl lg:rounded-2xl border border-zinc-100 flex items-center justify-center px-2">
                             <div className="rotate-0 lg:-rotate-90 italic text-[8px] sm:text-[9px] font-black text-zinc-300 uppercase tracking-tighter whitespace-nowrap">
                                Akses Terkunci
                             </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </section>

          </>
        )}
      </main>

      {/* Footer Info */}
      <footer className="h-10 bg-white border-t border-zinc-100 flex items-center justify-between px-8 shrink-0">
        <div className="flex gap-6">
          <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Sebelas Engine v3.0</span>
          <span className="hidden sm:inline text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Verified Assets</span>
        </div>
        <div className="flex gap-2 items-center">
          <div className="w-1.5 h-1.5 bg-zinc-900 rounded-full animate-pulse" />
          <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Secure Handshake</span>
        </div>
      </footer>

      {/* Form Interaction Layer (Responsive Modal/Drawer) */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-end md:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsFormOpen(false)}
            />
            <motion.div 
              initial={{ x: "100%", opacity: 0.5 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0.5 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="relative bg-white w-full md:max-w-xl h-full md:h-[calc(100vh-3rem)] md:rounded-[40px] shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-8 pb-4 shrink-0 flex items-center justify-between border-b border-zinc-50">
                <div>
                  <h3 className="text-3xl font-display font-bold tracking-tight">
                    {editingItem ? "Edit Data" : "Tambah Item"}
                  </h3>
                  <p className="text-sm font-medium text-zinc-400 mt-1">Lengkapi form pengadaan di bawah.</p>
                </div>
                <button 
                  onClick={() => setIsFormOpen(false)}
                  className="p-3 bg-zinc-50 hover:bg-zinc-100 rounded-full transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 pb-12">
                <form key={editingItem?.id || "modal-new"} onSubmit={handleAddOrUpdate} className="grid grid-cols-1 gap-6" autoComplete="off">
                  {editingItem && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">ID Unik</label>
                      <div className="w-full bg-zinc-100 border border-zinc-200 px-5 py-4 rounded-[20px] font-mono text-[10px] font-bold text-zinc-500">
                        {editingItem.id}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Nama Barang</label>
                    <input name="name" defaultValue={editingItem?.name} required className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-black transition-all" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Jumlah</label>
                      <input 
                        name="quantity" 
                        type="number" 
                        defaultValue={editingItem?.quantity} 
                        onChange={(e) => setFormFields(prev => ({ ...prev, quantity: Number(e.target.value) || 0 }))} 
                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                        required 
                        className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-black transition-all" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Satuan</label>
                      <input name="unit" defaultValue={editingItem?.unit} required className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-black transition-all" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Harga Satuan (Rp)</label>
                    <input 
                      name="price" 
                      type="number" 
                      defaultValue={editingItem?.price} 
                      onChange={(e) => setFormFields(prev => ({ ...prev, price: Number(e.target.value) || 0 }))} 
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      required 
                      className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-black transition-all" 
                    />
                  </div>

                  <div className="bg-black rounded-[32px] p-8 flex flex-col justify-between shadow-xl shadow-black/20">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Total Estimasi Biaya</span>
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-sm font-bold text-zinc-500 uppercase">IDR</span>
                      <span className="text-3xl font-display font-bold text-white tracking-tight truncate">
                        {(formFields.quantity * formFields.price).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Lokasi Store</label>
                    <select 
                      name="storeLocation" 
                      defaultValue={editingItem?.storeLocation || ""} 
                      required 
                      className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-black transition-all appearance-none cursor-pointer"
                    >
                      <option value="" disabled>Pilih Lokasi Store...</option>
                      {stores.map(store => (
                        <option key={store} value={store}>{store}</option>
                      ))}
                      {!stores.length && <option disabled>Tidak ada lokasi di spreadsheet</option>}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Pemohon</label>
                    <input name="requester" defaultValue={editingItem?.requester} required className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-black transition-all" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Kategori</label>
                    <select 
                      name="category" 
                      defaultValue={editingItem?.category || ""} 
                      required 
                      className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-black transition-all appearance-none cursor-pointer"
                    >
                      <option value="" disabled>Pilih Kategori...</option>
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      {!categories.length && <option disabled>Tidak ada kategori di spreadsheet</option>}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Urgensi</label>
                    <div className="relative">
                      <select name="status" defaultValue={editingItem?.status || "Penting (5x24 Jam)"} className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-black appearance-none">
                        <option value="Urgent (2x24 Jam)">Mendesak (2x24 Jam)</option>
                        <option value="Penting (5x24 Jam)">Penting (5x24 Jam)</option>
                      </select>
                      <ChevronRight className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 rotate-90 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Keterangan</label>
                    <textarea 
                      name="description" 
                      defaultValue={editingItem?.description} 
                      rows={3}
                      placeholder="Catatan tambahan..."
                      className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[24px] font-medium text-sm outline-none focus:bg-white focus:border-black transition-all resize-none" 
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Link Ref</label>
                    <input name="refLink" defaultValue={editingItem?.refLink} placeholder="https://..." className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-black transition-all" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Lampiran Visual</label>
                    {(!uploadedPhotoUrl && !localPreviewUrl) ? (
                      <label htmlFor="photo-upload-universal" className="w-full border-2 border-dashed border-zinc-100 aspect-video rounded-[32px] flex flex-col items-center justify-center gap-3 bg-zinc-50 hover:border-black transition-colors cursor-pointer">
                        <input id="photo-upload-universal" type="file" accept="image/*" capture="environment" onChange={handleFileUpload} className="hidden" />
                        {uploading ? <RefreshCw className="w-8 h-8 animate-spin text-black" /> : <Camera className="w-8 h-8 text-zinc-300" />}
                        <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Ambil/Unggah Foto</span>
                      </label>
                    ) : (
                      <div className="relative aspect-video bg-zinc-100 rounded-[32px] overflow-hidden cursor-zoom-in group">
                        <img 
                          src={localPreviewUrl || uploadedPhotoUrl} 
                          alt="Pratinjau" 
                          referrerPolicy="no-referrer"
                          className={`w-full h-full object-cover ${uploading ? 'opacity-50 grayscale' : ''}`} 
                          onClick={() => setPreviewImageUrl(localPreviewUrl || uploadedPhotoUrl)}
                        />
                        {uploading && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <RefreshCw className="w-10 h-10 animate-spin text-white drop-shadow-lg" />
                          </div>
                        )}
                        <button type="button" onClick={handleDeletePhoto} className="absolute top-4 right-4 bg-red-500 p-3 rounded-full text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-5 h-5" /></button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4 pt-6">
                    {editingItem && (authStatus.role === 'ADMIN' || (authStatus.role === 'USER' && (editingItem.verificationStatus === 'PENDING' || !editingItem.verificationStatus))) && (
                      <button 
                        type="button" 
                        onClick={() => {
                          setDeleteConfirmItem(editingItem);
                        }}
                        className="flex-1 bg-red-50 text-red-600 font-bold py-6 rounded-[24px] text-lg active:scale-95 transition-all"
                      >
                        Hapus
                      </button>
                    )}

                    {(!editingItem || authStatus.role === 'ADMIN' || (authStatus.role === 'USER' && (editingItem.verificationStatus === 'PENDING' || !editingItem.verificationStatus))) ? (
                      <button type="submit" className="flex-[2] bg-black text-white font-display font-bold py-6 rounded-[24px] text-xl active:scale-95 transition-all shadow-xl shadow-black/20">
                        {editingItem ? "Ubah Data" : "Simpan Data"}
                      </button>
                    ) : (
                      <div className="w-full bg-zinc-100 text-zinc-400 font-bold py-6 rounded-[24px] text-center text-sm border border-zinc-200">
                        Terkunci (Sudah Terverifikasi)
                      </div>
                    )}
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Verification Confirmation Overlay */}
      <AnimatePresence>
        {verifyItem && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => setVerifyItem(null)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl"
            >
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${verifyItem.status === 'APPROVED' ? 'bg-green-50 text-green-500' : 'bg-red-50 text-red-500'}`}>
                {verifyItem.status === 'APPROVED' ? <CheckCircle2 className="w-10 h-10" /> : <X className="w-10 h-10" />}
              </div>
              <h3 className="text-2xl font-display font-bold tracking-tight mb-2 text-center">
                {verifyItem.status === 'APPROVED' ? "Konfirmasi Setujui" : "Konfirmasi Tolak"}
              </h3>
              <p className="text-sm text-zinc-400 font-medium mb-8 text-center">
                Lengkapi alasan dan nama verifikator untuk item <span className="text-zinc-900 font-bold">"{verifyItem.item.name}"</span>.
              </p>
              
              <form onSubmit={handleVerifySubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Alasan Verifikasi</label>
                  <textarea 
                    name="reason" 
                    required 
                    placeholder="Contoh: Stok tersedia / Harga terlalu mahal..."
                    className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[24px] font-medium text-sm outline-none focus:bg-white focus:border-black transition-all resize-none" 
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Nama Verifikator</label>
                  <select 
                    name="verifier" 
                    required 
                    className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-black transition-all appearance-none cursor-pointer"
                  >
                    <option value="" disabled>Pilih Nama Verifikator...</option>
                    {verificators.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                    {!verificators.length && <option value={authStatus.user?.name}>{authStatus.user?.name || "Pilih Verifikator..."}</option>}
                  </select>
                </div>
                
                <div className="flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setVerifyItem(null)}
                    className="flex-1 bg-zinc-50 text-zinc-400 font-bold py-5 rounded-[24px] text-sm hover:bg-zinc-100 transition-colors"
                  >
                    Batal
                  </button>
                  <button 
                    type="submit"
                    className={`flex-1 text-white font-display font-bold py-5 rounded-[24px] text-lg shadow-xl transition-all ${verifyItem.status === 'APPROVED' ? 'bg-green-600 shadow-green-600/20' : 'bg-red-600 shadow-red-600/20'}`}
                  >
                    {verifyItem.status === 'APPROVED' ? "Setuju" : "Tolak"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transfer Popup Form */}
      <AnimatePresence>
        {transferItem && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => setTransferItem(null)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-xl rounded-[40px] p-6 sm:p-10 shadow-2xl my-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                   <h3 className="text-2xl font-display font-bold tracking-tight">Konfirmasi Transfer</h3>
                   <p className="text-sm text-zinc-400 font-medium">Lengkapi rincian transfer dana untuk item ini.</p>
                </div>
                <button onClick={() => setTransferItem(null)} className="p-3 bg-zinc-50 rounded-full hover:bg-zinc-100 transition-all text-zinc-400">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleTransferSubmit} className="space-y-6 text-left">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Nama Verifikator</label>
                    <div className="relative">
                      <select 
                        required 
                        value={transferForm.verifier}
                        onChange={(e) => setTransferForm({...transferForm, verifier: e.target.value})}
                        className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-black transition-all appearance-none cursor-pointer"
                      >
                        <option value="" disabled>Pilih Verifikator...</option>
                        {verificators.map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                        {!verificators.length && authStatus.user?.name && <option value={authStatus.user.name}>{authStatus.user.name}</option>}
                      </select>
                      <ChevronRight className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300 pointer-events-none rotate-90" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Nominal Transfer (Rp)</label>
                    <input 
                      type="number"
                      required
                      value={transferForm.amount}
                      onChange={(e) => setTransferForm({...transferForm, amount: e.target.value})}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-black transition-all" 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Keterangan Transfer (Opsional)</label>
                  <textarea 
                    value={transferForm.note}
                    onChange={(e) => setTransferForm({...transferForm, note: e.target.value})}
                    placeholder="Contoh: Transfer via Mandiri / Bukti terlampir..."
                    className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[24px] font-medium text-sm outline-none focus:bg-white focus:border-black transition-all resize-none" 
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Upload Link Bukti (Opsional)</label>
                  <div className="relative">
                    <Link className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300" />
                    <input 
                      type="url"
                      value={transferForm.evidenceLink}
                      onChange={(e) => setTransferForm({...transferForm, evidenceLink: e.target.value})}
                      placeholder="https://..."
                      className="w-full bg-zinc-50 border border-zinc-100 pl-12 pr-5 py-4 rounded-[20px] font-medium text-sm outline-none focus:bg-white focus:border-black transition-all" 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Foto Bukti (Kamera/File)</label>
                  <div className="flex items-center gap-4">
                    <button 
                      type="button"
                      onClick={() => document.getElementById('transfer-photo-upload')?.click()}
                      className="flex-1 flex items-center justify-center gap-3 py-4 bg-zinc-900 text-white rounded-[20px] font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all shadow-lg shadow-black/10"
                    >
                      <Camera className="w-4 h-4" />
                      <span>{transferLoading ? "Sedang Proses..." : "Ambil Foto / File"}</span>
                    </button>
                    <input 
                      id="transfer-photo-upload"
                      type="file" 
                      accept="image/*" 
                      capture="environment"
                      className="hidden" 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setTransferLoading(true);
                        try {
                          const options = { maxSizeMB: 0.8, maxWidthOrHeight: 1280, useWebWorker: true };
                          const compressedFile = await imageCompression(file, options);
                          const formData = new FormData();
                          formData.append("file", compressedFile);
                          const { data } = await axios.post("/api/upload", formData, {
                            headers: { "Content-Type": "multipart/form-data" },
                            withCredentials: true
                          });
                          setTransferPhotoUrl(normalizeDriveUrl(data.url));
                        } catch (err) {
                          alert("Upload bukti gagal.");
                        } finally {
                          setTransferLoading(false);
                        }
                      }}
                    />
                  </div>
                  {transferPhotoUrl && (
                    <div className="mt-4 p-4 bg-emerald-50 rounded-[24px] border border-emerald-100 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
                       <div className="w-full h-40 bg-zinc-900 rounded-xl overflow-hidden border border-emerald-100 relative group">
                          <img src={transferPhotoUrl} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                             <button type="button" onClick={() => setPreviewImageUrl(transferPhotoUrl)} className="p-2 bg-white rounded-full text-zinc-900 shadow-xl">
                               <ExternalLink className="w-4 h-4" />
                             </button>
                          </div>
                       </div>
                       <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-200 rounded-xl overflow-hidden flex items-center justify-center">
                               <ImageIcon className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Bukti Terunggah</span>
                              <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-tight">Siap dikirim ke database</span>
                            </div>
                          </div>
                          <button type="button" onClick={() => setTransferPhotoUrl("")} className="p-2 bg-white text-red-400 hover:text-red-600 rounded-full shadow-sm border border-emerald-100 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                       </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setTransferItem(null)}
                    className="flex-1 py-5 rounded-[24px] font-black uppercase text-[11px] tracking-widest text-zinc-400 border border-zinc-200 hover:bg-zinc-50 hover:text-black transition-all"
                  >
                    Batal
                  </button>
                  <button 
                    type="submit"
                    disabled={transferLoading}
                    className="flex-[2] bg-indigo-600 text-white py-5 rounded-[24px] font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-3 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-indigo-600/20 disabled:opacity-50 disabled:scale-100"
                  >
                    {transferLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span>Kirim & Transfer Data</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Realize Popup Form */}
      <AnimatePresence>
        {realizeItem && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => setRealizeItem(null)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-xl rounded-[40px] p-6 sm:p-10 shadow-2xl my-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                   <h3 className="text-2xl font-display font-bold tracking-tight">Konfirmasi Realisasi</h3>
                   <p className="text-sm text-zinc-400 font-medium">Lengkapi rincian belanja aset untuk item ini.</p>
                </div>
                <button onClick={() => setRealizeItem(null)} className="p-3 bg-zinc-50 rounded-full hover:bg-zinc-100 transition-all text-zinc-400">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRealizeSubmit} className="space-y-6 text-left">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Nilai Realisasi (Rp)</label>
                    <input 
                      type="number"
                      required
                      value={realizeForm.amount}
                      onChange={(e) => setRealizeForm({...realizeForm, amount: e.target.value})}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      placeholder="Masukkan nominal realisasi..."
                      className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-black transition-all" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Dibelanjakan Oleh</label>
                    <input 
                      type="text"
                      required
                      value={realizeForm.purchasedBy}
                      onChange={(e) => setRealizeForm({...realizeForm, purchasedBy: e.target.value})}
                      placeholder="Masukkan nama pembeli..."
                      className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-black transition-all" 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Upload Invoice (Link)</label>
                  <div className="relative">
                    <Link className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300" />
                    <input 
                      type="url"
                      value={realizeForm.invoiceLink}
                      onChange={(e) => setRealizeForm({...realizeForm, invoiceLink: e.target.value})}
                      placeholder="https://..."
                      className="w-full bg-zinc-50 border border-zinc-100 pl-12 pr-5 py-4 rounded-[20px] font-medium text-sm outline-none focus:bg-white focus:border-black transition-all" 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Upload Bukti Foto (Kamera/File)</label>
                  <div className="flex items-center gap-4">
                    <button 
                      type="button"
                      onClick={() => document.getElementById('realize-photo-upload')?.click()}
                      className="flex-1 flex items-center justify-center gap-3 py-4 bg-zinc-900 text-white rounded-[20px] font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all shadow-lg shadow-black/10"
                    >
                      <Camera className="w-4 h-4" />
                      <span>{realizeLoading ? "Sedang Proses..." : "Ambil Foto / File"}</span>
                    </button>
                    <input 
                      id="realize-photo-upload"
                      type="file" 
                      accept="image/*" 
                      capture="environment"
                      className="hidden" 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setRealizeLoading(true);
                        try {
                          const options = { maxSizeMB: 0.8, maxWidthOrHeight: 1280, useWebWorker: true };
                          const compressedFile = await imageCompression(file, options);
                          const formData = new FormData();
                          formData.append("file", compressedFile);
                          const { data } = await axios.post("/api/upload", formData, {
                            headers: { "Content-Type": "multipart/form-data" },
                            withCredentials: true
                          });
                          setRealizePhotoUrl(normalizeDriveUrl(data.url));
                        } catch (err) {
                          alert("Upload bukti gagal.");
                        } finally {
                          setRealizeLoading(false);
                        }
                      }}
                    />
                  </div>
                  {realizePhotoUrl && (
                    <div className="mt-4 p-4 bg-emerald-50 rounded-[24px] border border-emerald-100 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
                       <div className="w-full h-40 bg-zinc-900 rounded-xl overflow-hidden border border-emerald-100 relative group">
                          <img src={realizePhotoUrl} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                             <button type="button" onClick={() => setPreviewImageUrl(realizePhotoUrl)} className="p-2 bg-white rounded-full text-zinc-900 shadow-xl">
                               <ExternalLink className="w-4 h-4" />
                             </button>
                          </div>
                       </div>
                       <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-200 rounded-xl overflow-hidden flex items-center justify-center">
                               <ImageIcon className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div className="flex flex-col">
                               <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Bukti Terunggah</span>
                               <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-tight">Siap dikirim ke database</span>
                            </div>
                          </div>
                          <button type="button" onClick={() => setRealizePhotoUrl("")} className="p-2 bg-white text-red-400 hover:text-red-600 rounded-full shadow-sm border border-emerald-100 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                       </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setRealizeItem(null)}
                    className="flex-1 py-5 rounded-[24px] font-black uppercase text-[11px] tracking-widest text-zinc-400 border border-zinc-200 hover:bg-zinc-50 hover:text-black transition-all"
                  >
                    Batal
                  </button>
                  <button 
                    type="submit"
                    disabled={realizeLoading}
                    className="flex-[2] bg-emerald-600 text-white py-5 rounded-[24px] font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-3 hover:bg-emerald-700 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-emerald-600/20 disabled:opacity-50 disabled:scale-100"
                  >
                    {realizeLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span>Simpan & Selesaikan Realisasi</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Overlay */}
      <AnimatePresence>
        {deleteConfirmItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => setDeleteConfirmItem(null)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-sm rounded-[40px] p-10 text-center shadow-2xl"
            >
              <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-display font-bold tracking-tight mb-3">Konfirmasi Hapus</h3>
              <p className="text-sm text-zinc-400 font-medium mb-8">
                Apakah Anda yakin ingin menghapus <span className="text-zinc-900 font-bold">"{deleteConfirmItem.name}"</span>? Tindakan ini tidak dapat dibatalkan.
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => handleDelete(deleteConfirmItem)}
                  className="w-full bg-red-600 text-white font-display font-bold py-5 rounded-[24px] text-lg hover:bg-black transition-colors shadow-xl shadow-red-600/20"
                >
                  Ya, Hapus Sekarang
                </button>
                <button 
                  onClick={() => setDeleteConfirmItem(null)}
                  className="w-full bg-zinc-50 text-zinc-400 font-bold py-4 rounded-[24px] text-sm hover:bg-zinc-100 transition-colors"
                >
                  Batalkan
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {cancelConfirmItem && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => setCancelConfirmItem(null)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl"
            >
              <div className="w-20 h-20 bg-zinc-50 text-zinc-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <RefreshCw className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-display font-bold tracking-tight mb-2 text-center">Konfirmasi Pembatalan</h3>
              <p className="text-sm text-zinc-400 font-medium mb-8 text-center">
                {cancelConfirmItem.verificationStatus === 'REJECTED' 
                  ? `Lengkapi alasan pembatalan penolakan untuk "${cancelConfirmItem.name}".`
                  : `Lengkapi alasan pembatalan persetujuan untuk "${cancelConfirmItem.name}".`}
              </p>

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  executeCancel(
                    cancelConfirmItem, 
                    formData.get("reason") as string, 
                    formData.get("verifier") as string
                  );
                }} 
                className="space-y-6"
              >
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Alasan Pembatalan</label>
                  <textarea 
                    name="reason" 
                    required 
                    placeholder="Contoh: Salah klik / Ada perubahan data..."
                    className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[24px] font-medium text-sm outline-none focus:bg-white focus:border-black transition-all resize-none" 
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Nama Verifikator</label>
                  <select 
                    name="verifier" 
                    required 
                    className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-black transition-all appearance-none cursor-pointer"
                  >
                    <option value="" disabled>Pilih Nama Verifikator...</option>
                    {verificators.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                    {!verificators.length && <option value={authStatus.user?.name}>{authStatus.user?.name || "Pilih Verifikator..."}</option>}
                  </select>
                </div>
                
                <div className="flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setCancelConfirmItem(null)}
                    className="flex-1 bg-zinc-50 text-zinc-400 font-bold py-5 rounded-[24px] text-sm hover:bg-zinc-100 transition-colors"
                  >
                    Batal
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-black text-white font-display font-bold py-5 rounded-[24px] text-lg shadow-xl shadow-black/20 hover:bg-zinc-800 transition-all"
                  >
                    Batalkan
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Fullscreen Image Preview */}
      <AnimatePresence>
        {previewImageUrl && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-10">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/95 backdrop-blur-xl"
              onClick={() => setPreviewImageUrl(null)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-5xl w-full h-full flex items-center justify-center"
            >
              <img 
                src={previewImageUrl} 
                alt="Fullscreen Preview" 
                referrerPolicy="no-referrer"
                className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
              />
              <button 
                onClick={() => setPreviewImageUrl(null)}
                className="absolute top-0 right-0 sm:-top-12 sm:-right-12 p-4 text-white hover:text-zinc-400 transition-colors"
              >
                <X className="w-8 h-8" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <button 
        onClick={() => {
          setEditingItem(null);
          setUploadedPhotoUrl("");
          setLocalPreviewUrl("");
          setFormFields({ quantity: 0, price: 0 });
          setIsFormOpen(true);
        }}
        className="fixed bottom-8 right-8 sm:bottom-10 sm:right-10 flex items-center gap-3 bg-black text-white px-6 sm:px-8 h-18 sm:h-20 rounded-[24px] sm:rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] active:scale-95 transition-all z-[100] border-2 border-white/20 hover:scale-105 group"
      >
        <div className="flex flex-col items-start leading-none">
          <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-1">Tambah Item</span>
          <span className="text-sm sm:text-lg font-display font-black uppercase tracking-tight">Input</span>
        </div>
        <div className="bg-white/10 p-2 sm:p-3 rounded-xl sm:rounded-2xl group-hover:bg-white group-hover:text-black transition-all">
          <Plus className="w-6 h-6 sm:w-8 sm:h-8 group-hover:rotate-90 transition-transform duration-500" />
        </div>
      </button>

      {/* Role Navigation (Desktop & Mobile) ONLY for Admin */}
      {authStatus.role === 'ADMIN' && (
        <div className="fixed bottom-10 left-10 flex gap-2 z-40">
           <button 
            onClick={() => setActiveMainTab(activeMainTab === "dashboard" ? "accounts" : "dashboard")}
            className="w-14 h-14 bg-white text-black border-2 border-zinc-100 rounded-2xl shadow-xl flex items-center justify-center active:scale-90 transition-all hover:bg-zinc-50"
            title={activeMainTab === "dashboard" ? "Kelola Akun" : "Kembali ke Dashboard"}
           >
             {activeMainTab === "dashboard" ? <ShieldCheck className="w-6 h-6" /> : <Package className="w-6 h-6" />}
           </button>
        </div>
      )}
    </div>
  );
}
