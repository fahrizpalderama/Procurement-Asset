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
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ProcurementItem } from "../types";
import axios from "axios";
import imageCompression from "browser-image-compression";

export default function Dashboard() {
  const [items, setItems] = useState<ProcurementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProcurementItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"inventaris" | "disetujui" | "ditolak">("inventaris");
  const [uploading, setUploading] = useState(false);
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState("");
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<ProcurementItem | null>(null);
  const [verifyItem, setVerifyItem] = useState<{ item: ProcurementItem, status: 'APPROVED' | 'REJECTED' } | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [formFields, setFormFields] = useState({
    quantity: 0,
    price: 0
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/sheets/data");
      // Normalize photo URLs
      const normalizedItems = data.items.map((item: ProcurementItem) => ({
        ...item,
        refPhoto: normalizeDriveUrl(item.refPhoto)
      }));
      setItems(normalizedItems);
      setSpreadsheetId(data.spreadsheetId);
    } catch (error) {
      console.error("Fetch error", error);
    } finally {
      setLoading(false);
    }
  };

  const normalizeDriveUrl = (url: string) => {
    if (!url) return "";
    if (url.startsWith("/api/drive/image/")) return url;
    
    // Check for drive.google.com/uc?id=... or drive.google.com/open?id=...
    if (url.includes("drive.google.com")) {
      const match = url.match(/[?&]id=([^&]+)/);
      if (match && match[1]) {
        return `/api/drive/image/${match[1]}`;
      }
    }
    return url;
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (editingItem) {
      setFormFields({
        quantity: Number(editingItem.quantity),
        price: Number(editingItem.price)
      });
      setUploadedPhotoUrl(editingItem.refPhoto || "");
    } else {
      setFormFields({ quantity: 0, price: 0 });
      setUploadedPhotoUrl("");
    }
  }, [editingItem]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
        headers: { "Content-Type": "multipart/form-data" }
      });
      setUploadedPhotoUrl(normalizeDriveUrl(data.url));
    } catch (error) {
      console.error("Upload error", error);
      alert("Gagal mengunggah foto");
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = () => {
    if (confirm("Hapus lampiran foto ini?")) {
      setUploadedPhotoUrl("");
    }
  };

  const handleLogout = async () => {
    await axios.post("/api/auth/logout");
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
      });
      
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
      quantity: qty,
      unit: formData.get("unit") as string,
      price: price,
      totalPrice: qty * price,
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
        });
      } else {
        await axios.post("/api/sheets/add", {
          spreadsheetId,
          item: itemData
        });
      }
      setIsFormOpen(false);
      setEditingItem(null);
      fetchData();
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
      });
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
    
    return matchesSearch && matchesTab;
  });

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-zinc-900 font-sans overflow-hidden">
      {/* Header Section */}
      <header className="h-20 flex items-center justify-between px-8 bg-white border-b border-zinc-100 shrink-0">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-3">
            <div className="bg-black p-2.5 rounded-xl shadow-lg shadow-black/10 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-xl font-display font-bold tracking-tight leading-none">
                PROCURE<span className="text-zinc-400">.SYNC</span>
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-0.5">Pusat Kontrol</span>
            </div>
          </div>
          
          <nav className="hidden lg:flex items-center gap-2 bg-zinc-50 p-1 rounded-2xl">
            <button 
              onClick={() => setActiveTab("inventaris")}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === "inventaris" ? "bg-white shadow-sm border border-zinc-100 text-black" : "text-zinc-400 hover:text-black"}`}
            >
              <Package className="w-3.5 h-3.5" />
              Inventaris
            </button>
            <button 
              onClick={() => setActiveTab("disetujui")}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === "disetujui" ? "bg-white shadow-sm border border-zinc-100 text-black" : "text-zinc-400 hover:text-black"}`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Disetujui
            </button>
            <button 
              onClick={() => setActiveTab("ditolak")}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === "ditolak" ? "bg-white shadow-sm border border-zinc-100 text-black" : "text-zinc-400 hover:text-black"}`}
            >
              <X className="w-3.5 h-3.5" />
              Ditolak
            </button>
          </nav>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden sm:flex items-center gap-3 bg-zinc-50 px-4 py-2 rounded-2xl border border-zinc-100">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[11px] font-bold text-zinc-500">Database Terhubung</span>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={fetchData}
              className="p-3 bg-zinc-50 hover:bg-zinc-100 rounded-2xl transition-all border border-zinc-100 group"
              title="Sinkronisasi Data"
            >
              <RefreshCw className={`w-4 h-4 text-zinc-400 group-hover:text-black transition-colors ${loading ? 'animate-spin text-black' : ''}`} />
            </button>
            <button 
              onClick={handleLogout}
              className="p-3 bg-zinc-50 hover:bg-red-50 rounded-2xl transition-all border border-zinc-100 text-zinc-400 hover:text-red-600 group"
              title="Keluar"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 flex overflow-hidden">
        {/* List View Column */}
        <section className="flex-1 md:w-[65%] flex flex-col bg-slate-50 overflow-hidden relative">
          <div className="p-8 pb-4 flex justify-between items-center">
            <div className="flex flex-col">
              <h2 className="text-sm font-bold text-zinc-400 mb-1">
                {activeTab === "inventaris" ? "Daftar Pengadaan Aktif" : activeTab === "disetujui" ? "Daftar Pengadaan Disetujui" : "Daftar Pengadaan Ditolak"}
              </h2>
              <div className="flex items-center gap-4">
                <span className="text-3xl font-display font-bold tracking-tight">
                  {activeTab === "inventaris" ? "Inventaris" : activeTab === "disetujui" ? "Disetujui" : "Ditolak"}
                </span>
                <span className="px-3 py-1 bg-black text-white rounded-full text-[11px] font-bold">
                  {filteredItems.length}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Mobile Tab Switcher */}
              <div className="lg:hidden flex bg-zinc-100 p-1 rounded-xl">
                 <button 
                  onClick={() => setActiveTab("inventaris")}
                  className={`px-4 py-2 rounded-lg text-[10px] font-bold transition-all ${activeTab === "inventaris" ? "bg-white text-black shadow-sm" : "text-zinc-400"}`}
                 >
                   Inv
                 </button>
                 <button 
                  onClick={() => setActiveTab("disetujui")}
                  className={`px-4 py-2 rounded-lg text-[10px] font-bold transition-all ${activeTab === "disetujui" ? "bg-white text-black shadow-sm" : "text-zinc-400"}`}
                 >
                   Suju
                 </button>
                 <button 
                  onClick={() => setActiveTab("ditolak")}
                  className={`px-4 py-2 rounded-lg text-[10px] font-bold transition-all ${activeTab === "ditolak" ? "bg-white text-black shadow-sm" : "text-zinc-400"}`}
                 >
                   Tolak
                 </button>
              </div>

              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300" />
                <input 
                  type="text" 
                  placeholder="Cari barang..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-11 pr-5 py-3 bg-white border border-zinc-100 rounded-2xl focus:border-black outline-none text-sm font-medium transition-all w-60 focus:w-80 shadow-sm"
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
                      <div 
                        className="w-full sm:w-32 h-32 bg-zinc-50 rounded-2xl overflow-hidden shrink-0 border border-zinc-100 cursor-zoom-in"
                        onClick={() => item.refPhoto && setPreviewImageUrl(item.refPhoto)}
                      >
                        {item.refPhoto ? (
                          <img 
                            src={item.refPhoto} 
                            alt={item.name} 
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover hover:scale-110 transition-transform duration-500"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `https://placehold.co/400x400/f8fafc/94a3b8?text=Error+Loading`;
                            }}
                          />
                        ) : (
                          <div className="w-full sm:h-full flex flex-col items-center justify-center text-zinc-200">
                            <ImageIcon className="w-8 h-8 mb-1" />
                            <span className="text-[10px] font-bold uppercase tracking-tighter">Tanpa Foto</span>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 flex flex-col sm:flex-row items-start sm:items-center gap-6">
                        <div className="w-full sm:w-28 shrink-0 flex sm:flex-col items-center sm:items-start justify-between sm:justify-center gap-2">
                          <div>
                            <div className="text-[11px] font-bold text-zinc-300 uppercase tracking-widest mb-1">{item.timestamp?.split(',')[0]}</div>
                            <div className="text-xs font-bold text-zinc-900">{item.timestamp?.split(',')[1]}</div>
                          </div>
                          {item.verificationStatus === 'PENDING' && (
                            <div className="flex gap-2">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleApprove(item);
                                }}
                                className="p-2.5 rounded-full transition-all border bg-white border-zinc-100 text-zinc-300 hover:bg-zinc-50 hover:text-green-500"
                                title="Setujui Pengadaan"
                              >
                                <CheckCircle2 className="w-5 h-5" />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReject(item);
                                }}
                                className="p-2.5 rounded-full transition-all border bg-white border-zinc-100 text-zinc-300 hover:bg-zinc-50 hover:text-red-500"
                                title="Tolak Pengadaan"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] font-black bg-zinc-100 text-zinc-400 px-1.5 py-0.5 rounded uppercase tracking-tighter shrink-0">{item.id}</span>
                            <h4 className="text-lg font-display font-bold tracking-tight uppercase truncate">{item.name}</h4>
                          </div>
                          <p className="text-xs text-zinc-400 font-medium line-clamp-1 mb-3">{item.description || "Tidak ada deskripsi."}</p>
                          
                          <div className="flex flex-wrap gap-2">
                             <div className="flex items-center gap-2 bg-zinc-50 px-3 py-1 rounded-lg border border-zinc-100">
                               <Package className="w-3.5 h-3.5 text-zinc-400" />
                               <span className="text-xs font-bold">{item.quantity}</span>
                             </div>
                             <div className="flex items-center gap-2 bg-zinc-50 px-3 py-1 rounded-lg border border-zinc-100">
                               <span className="text-[10px] font-bold text-zinc-400 uppercase">Prioritas:</span>
                               <span className={`text-[10px] font-bold uppercase tracking-wider ${item.status.includes('Urgent') || item.status.includes('Mendesak') ? 'text-red-500' : 'text-zinc-600'}`}>
                                 {item.status}
                               </span>
                             </div>
                             {item.verificationStatus !== "PENDING" && item.verificationStatus && (
                               <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${item.verificationStatus === 'APPROVED' ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                                 <span className="text-[10px] font-bold uppercase">Verifikator:</span>
                                 <span className="text-[10px] font-bold uppercase truncate max-w-[80px]">{item.verifierName}</span>
                               </div>
                             )}
                          </div>
                          {item.verificationReason && (
                            <p className="mt-2 text-[10px] font-medium text-zinc-500 italic">" {item.verificationReason} "</p>
                          )}
                        </div>
 
                        <div className="text-right shrink-0">
                           <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Total Valuasi</p>
                           <p className="text-xl font-display font-bold tracking-tight">Rp{Number(item.totalPrice).toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="w-full sm:w-auto grid grid-cols-3 sm:flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-zinc-100 pt-4 sm:pt-0 sm:pl-6 shrink-0">
                        {item.refLink ? (
                          <a 
                            href={item.refLink} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="w-full sm:w-12 sm:h-12 py-4 sm:py-0 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-400 hover:bg-black hover:text-white transition-all shadow-sm group"
                            title="Tautan Referensi"
                          >
                            <ExternalLink className="w-5 h-5" />
                          </a>
                        ) : (
                          <div className="w-full sm:w-12 sm:h-12 py-4 sm:py-0 rounded-2xl bg-zinc-50/50 flex items-center justify-center text-zinc-200 cursor-not-allowed">
                            <ExternalLink className="w-5 h-5 opacity-20" />
                          </div>
                        )}
                        <button 
                          onClick={() => {
                            setEditingItem(item);
                            setIsFormOpen(true);
                          }}
                          className="w-full sm:w-12 sm:h-12 py-4 sm:py-0 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-400 hover:bg-black hover:text-white transition-all shadow-sm"
                          title="Ubah Data"
                        >
                          <Edit3 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => setDeleteConfirmItem(item)}
                          className="w-full sm:w-12 sm:h-12 py-4 sm:py-0 rounded-2xl bg-red-50 flex items-center justify-center text-red-300 hover:bg-red-600 hover:text-white transition-all shadow-sm"
                          title="Hapus Data"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </section>

        {/* Form Column */}
        <aside className="hidden md:flex flex-col w-[35%] bg-white border-l border-zinc-100 overflow-hidden shadow-[0_0_100px_-20px_rgba(0,0,0,0.05)]">
          <div className="p-10 flex-1 overflow-y-auto">
            <div className="mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-zinc-50 border border-zinc-100 rounded-full mb-4">
                <div className="w-1.5 h-1.5 bg-black rounded-full" />
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Modul Input</span>
              </div>
              <h2 className="text-4xl font-display font-bold tracking-tight">
                {editingItem ? "Ubah Data" : "Tambah Baru"}
              </h2>
              <p className="text-sm font-medium text-zinc-400 mt-2">Lengkapi detail pengadaan logistik di bawah ini.</p>
            </div>

            <form onSubmit={handleAddOrUpdate} className="space-y-8">
              {editingItem && (
                <div className="space-y-3">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block ml-1">ID Unik</label>
                  <div className="w-full bg-zinc-100 border border-zinc-200 px-5 py-4 rounded-[20px] font-mono text-[10px] font-bold text-zinc-500">
                    {editingItem.id}
                  </div>
                </div>
              )}
              <div className="space-y-3">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block ml-1">Identitas Barang</label>
                <input 
                  name="name"
                  defaultValue={editingItem?.name}
                  required
                  placeholder="Nama barang..."
                  className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm focus:bg-white focus:border-black outline-none transition-all placeholder:text-zinc-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block ml-1">Kuantitas</label>
                  <input 
                    name="quantity"
                    type="number"
                    defaultValue={editingItem?.quantity}
                    onChange={(e) => setFormFields(prev => ({ ...prev, quantity: Number(e.target.value) || 0 }))}
                    required
                    className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm focus:bg-white focus:border-black outline-none transition-all"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block ml-1">Satuan</label>
                  <input 
                    name="unit"
                    defaultValue={editingItem?.unit}
                    required
                    placeholder="Unit..."
                    className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm focus:bg-white focus:border-black outline-none transition-all placeholder:text-zinc-300 uppercase"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block ml-1">Harga Satuan (Rp)</label>
                <input 
                  name="price"
                  type="number"
                  defaultValue={editingItem?.price}
                  onChange={(e) => setFormFields(prev => ({ ...prev, price: Number(e.target.value) || 0 }))}
                  required
                  className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm focus:bg-white focus:border-black outline-none transition-all"
                />
              </div>

              <div className="bg-black rounded-[32px] p-8 flex flex-col justify-between shadow-xl shadow-black/10">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Total Estimasi Biaya</span>
                <div className="flex items-baseline justify-between gap-4">
                   <span className="text-sm font-bold text-zinc-500 uppercase">IDR</span>
                   <span className="text-3xl font-display font-bold text-white tracking-tight truncate">
                    {(formFields.quantity * formFields.price).toLocaleString()}
                   </span>
                </div>
              </div>

              <div className="space-y-6">
                 <div className="space-y-3">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block ml-1">Pemohon</label>
                    <input 
                      name="requester"
                      defaultValue={editingItem?.requester}
                      required
                      placeholder="Nama pemohon..."
                      className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm focus:bg-white focus:border-black outline-none transition-all placeholder:text-zinc-300"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block ml-1">Urgensi</label>
                    <div className="relative">
                      <select 
                        name="status"
                        defaultValue={editingItem?.status || "Penting (5x24 Jam)"}
                        className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm focus:bg-white focus:border-black outline-none transition-all cursor-pointer appearance-none"
                      >
                        <option value="Urgent (2x24 Jam)">Mendesak (2x24 Jam)</option>
                        <option value="Penting (5x24 Jam)">Penting (5x24 Jam)</option>
                      </select>
                      <ChevronRight className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 rotate-90 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block ml-1">Keterangan</label>
                    <textarea 
                      name="description"
                      defaultValue={editingItem?.description}
                      rows={3}
                      placeholder="Spesifikasi atau catatan tambahan..."
                      className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[24px] font-medium text-sm focus:bg-white focus:border-black outline-none transition-all placeholder:text-zinc-300 resize-none"
                    />
                  </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block ml-1">Link Ref</label>
                  <input 
                    name="refLink"
                    defaultValue={editingItem?.refLink}
                    placeholder="https://..."
                    className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] text-xs font-bold focus:bg-white focus:border-black outline-none transition-all"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block ml-1">Lampiran</label>
                  {!uploadedPhotoUrl ? (
                    <div className="relative h-[54px]">
                      <input 
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="photo-upload"
                      />
                      <label 
                        htmlFor="photo-upload"
                        className="h-full border border-zinc-100 rounded-[20px] bg-zinc-50 flex items-center justify-center gap-2 cursor-pointer hover:bg-white hover:border-black transition-all group"
                      >
                        {uploading ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Camera className="w-4 h-4 text-zinc-400 group-hover:text-black transition-colors" />
                        )}
                        <span className="text-xs font-bold text-zinc-400 group-hover:text-black">
                          {uploading ? "Sinking..." : "Lampirkan"}
                        </span>
                      </label>
                    </div>
                  ) : (
                    <div className="relative group border border-zinc-100 rounded-[20px] h-[54px] overflow-hidden cursor-zoom-in">
                       <img 
                        src={uploadedPhotoUrl} 
                        alt="Preview" 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-all"
                        onClick={() => setPreviewImageUrl(uploadedPhotoUrl)}
                      />
                      <div className="absolute inset-0 bg-black/80 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button type="button" onClick={handleDeletePhoto} className="p-2 bg-red-500 rounded-full text-white hover:scale-110 transition-transform">
                           <X className="w-4 h-4" />
                         </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-6 flex flex-col gap-3">
                <div className="flex gap-3">
                  {editingItem && (
                    <button 
                      type="button"
                      onClick={() => setDeleteConfirmItem(editingItem)}
                      className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold py-5 rounded-[24px] text-sm transition-all"
                    >
                      Hapus
                    </button>
                  )}
                  <button 
                    type="submit"
                    className={`${editingItem ? 'flex-[2]' : 'flex-1'} bg-black hover:scale-[1.02] active:scale-[0.98] text-white font-display font-bold py-5 rounded-[24px] text-lg shadow-xl shadow-black/10 transition-all`}
                  >
                    {editingItem ? "Ubah Data" : "Simpan Data"}
                  </button>
                </div>
                {editingItem && (
                  <button 
                    type="button"
                    onClick={() => {
                      setEditingItem(null);
                      setIsFormOpen(false);
                    }}
                    className="w-full bg-zinc-50 hover:bg-zinc-100 text-zinc-400 font-bold py-4 rounded-[20px] text-xs transition-all"
                  >
                    Batalkan Perubahan
                  </button>
                )}
              </div>
            </form>
          </div>
        </aside>
      </main>

      {/* Footer Info */}
      <footer className="h-10 bg-white border-t border-zinc-100 flex items-center justify-between px-8 shrink-0">
        <div className="flex gap-6">
          <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">ProcureSync Engine v2.4</span>
          <span className="hidden sm:inline text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Aktif: 99.9%</span>
        </div>
        <div className="flex gap-2 items-center">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
          <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Sesi Terenkripsi</span>
        </div>
      </footer>

      {/* Mobile Interaction Layer */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
              onClick={() => setIsFormOpen(false)}
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative bg-white w-full rounded-t-[40px] p-8 pb-12 shadow-2xl max-h-[95vh] overflow-y-auto"
            >
              <div className="w-12 h-1.5 bg-zinc-100 rounded-full mx-auto mb-8" />
              <div className="mb-8">
                <h3 className="text-3xl font-display font-bold tracking-tight">
                  {editingItem ? "Edit Data" : "Tambah Item"}
                </h3>
                <p className="text-sm font-medium text-zinc-400 mt-1">Lengkapi form pengadaan di bawah.</p>
              </div>
              
              <form onSubmit={handleAddOrUpdate} className="grid grid-cols-1 gap-6">
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
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Pemohon</label>
                  <input name="requester" defaultValue={editingItem?.requester} required className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-black transition-all" />
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
                  {!uploadedPhotoUrl ? (
                    <label className="w-full border-2 border-dashed border-zinc-100 aspect-video rounded-[32px] flex flex-col items-center justify-center gap-3 bg-zinc-50 active:bg-zinc-100 transition-colors">
                      <input type="file" accept="image/*" capture="environment" onChange={handleFileUpload} className="hidden" />
                      {uploading ? <RefreshCw className="w-8 h-8 animate-spin text-black" /> : <Camera className="w-8 h-8 text-zinc-300" />}
                      <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Ambil Foto</span>
                    </label>
                  ) : (
                    <div className="relative aspect-video bg-zinc-100 rounded-[32px] overflow-hidden cursor-zoom-in group">
                      <img 
                        src={uploadedPhotoUrl} 
                        alt="Pratinjau" 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover" 
                        onClick={() => setPreviewImageUrl(uploadedPhotoUrl)}
                      />
                      <button type="button" onClick={handleDeletePhoto} className="absolute top-4 right-4 bg-red-500 p-3 rounded-full text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-5 h-5" /></button>
                    </div>
                  )}
                </div>
                <div className="flex gap-4 pt-6">
                  {editingItem && (
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
                  <button type="submit" className={`${editingItem ? 'flex-[2]' : 'w-full'} bg-black text-white font-display font-bold py-6 rounded-[24px] text-xl active:scale-95 transition-all shadow-xl shadow-black/20`}>
                    {editingItem ? "Ubah Data" : "Simpan Data"}
                  </button>
                </div>
              </form>
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
                  <input 
                    name="verifier" 
                    required 
                    placeholder="Nama lengkap..." 
                    className="w-full bg-zinc-50 border border-zinc-100 px-5 py-4 rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-black transition-all" 
                  />
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
          setIsFormOpen(true);
        }}
        className="md:hidden fixed bottom-10 right-10 w-20 h-20 bg-black text-white rounded-full shadow-2xl shadow-black/30 flex items-center justify-center active:scale-90 transition-all z-40 border-4 border-white"
      >
        <Plus className="w-10 h-10" />
      </button>
    </div>
  );
}
