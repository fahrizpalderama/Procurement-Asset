import React, { useState, useEffect } from "react";
import axios from "axios";
import { UserPlus, Trash2, Mail, User, Clock, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ManagedUser {
  rowIndex: number;
  email: string;
  name: string;
  role: string;
  addedAt: string;
}

interface AccountManagementProps {
  authStatus: {
    user?: {
      email: string;
    };
  };
}

export default function AccountManagement({ authStatus }: AccountManagementProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [roleInput, setRoleInput] = useState("USER");
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const ADMIN_UTAMA = "asset.sebelas11@gmail.com";
  const isMainAdmin = authStatus.user?.email.toLowerCase().trim() === ADMIN_UTAMA.toLowerCase().trim();

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get("/api/admin/users", { withCredentials: true });
      setUsers(data);
      setStatusMsg(null);
    } catch (error: any) {
      console.error("Failed to fetch users", error);
      setStatusMsg({ 
        type: 'error', 
        text: `Gagal memuat daftar user: ${error.response?.data?.details || error.message}` 
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) return;
    
    setSubmitting(true);
    setStatusMsg(null);
    try {
      await axios.post("/api/admin/users/add", { 
        email: emailInput, 
        name: nameInput,
        role: roleInput
      }, { withCredentials: true });
      
      setEmailInput("");
      setNameInput("");
      setRoleInput("USER");
      setStatusMsg({ type: 'success', text: "Akun berhasil didaftarkan!" });
      await fetchUsers();
    } catch (error: any) {
      console.error("Failed to add user:", error.response?.data || error);
      setStatusMsg({ 
        type: 'error', 
        text: `Gagal mendaftarkan akun: ${error.response?.data?.details || error.message}` 
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (email: string, rowIndex: number) => {
    if (!confirm(`Hapus akses untuk ${email}?`)) return;
    
    try {
      await axios.post("/api/admin/users/delete", { rowIndex, email }, { withCredentials: true });
      await fetchUsers();
    } catch (error: any) {
      console.error("Delete user error:", error);
      alert(`Gagal menghapus user: ${error.response?.data?.details || error.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Memuat Data Akun...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-12">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tighter">Manajemen Akun</h2>
        </div>
        <p className="text-sm font-medium text-zinc-400">Kelola daftar email yang diberikan izin akses ke sistem.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Form Add User */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-zinc-50 p-6 rounded-[32px] border border-zinc-100 space-y-6">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-black" />
              <span className="text-xs font-black uppercase tracking-widest">Tambah Akses</span>
            </div>
            
            <form onSubmit={handleAddUser} className="space-y-4">
              {statusMsg && (
                <div className={`p-4 rounded-2xl flex gap-3 ${statusMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-[11px] font-bold leading-tight">{statusMsg.text}</p>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Email Google</label>
                <input 
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="example@gmail.com"
                  className="w-full bg-white border border-zinc-200 px-4 py-3 rounded-2xl text-sm font-bold outline-none focus:border-black transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Nama (Opsional)</label>
                <input 
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Nama Pengguna"
                  className="w-full bg-white border border-zinc-200 px-4 py-3 rounded-2xl text-sm font-bold outline-none focus:border-black transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Role / Hak Akses</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRoleInput("USER")}
                    className={`py-3 rounded-2xl text-[10px] font-black uppercase transition-all border ${roleInput === "USER" ? "bg-black text-white border-black" : "bg-white text-zinc-400 border-zinc-100"}`}
                  >
                    User
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleInput("ADMIN")}
                    className={`py-3 rounded-2xl text-[10px] font-black uppercase transition-all border ${roleInput === "ADMIN" ? "bg-black text-white border-black" : "bg-white text-zinc-400 border-zinc-100"}`}
                  >
                    Admin
                  </button>
                </div>
              </div>
              
              <button 
                type="submit" 
                disabled={submitting}
                className="w-full bg-black text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
              >
                {submitting ? "Memproses..." : "Daftarkan Akun"}
              </button>
            </form>
          </div>

          <div className="bg-blue-50 p-6 rounded-[32px] border border-blue-100 flex gap-4">
            <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-[11px] font-medium text-blue-700 leading-relaxed">
              <strong>Catatan:</strong> Email yang didaftarkan akan otomatis diberikan akses edit (writer) ke Google Sheet database utama.
            </p>
          </div>
        </div>

        {/* User List */}
        <div className="md:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-2">
             <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Daftar Terdaftar ({users.length})</span>
          </div>

          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {users.map((user) => (
                <motion.div 
                  key={user.email}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="group bg-white border border-zinc-100 p-5 rounded-[28px] hover:border-black/10 hover:shadow-xl hover:shadow-black/5 transition-all flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-300 group-hover:bg-zinc-100 group-hover:text-black transition-all">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black uppercase tracking-tight">{user.name || "Tanpa Nama"}</h4>
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest ${user.role === 'ADMIN' ? 'bg-black text-white' : 'bg-zinc-100 text-zinc-400'}`}>
                          {user.role}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-zinc-400">{user.email}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="hidden sm:flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                        <Clock className="w-3 h-3" />
                        {user.addedAt}
                      </div>
                    </div>
                    {isMainAdmin && (
                      <button 
                        onClick={() => handleDeleteUser(user.email, user.rowIndex)}
                        className="p-3 bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}

              {users.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-zinc-100 rounded-[32px] gap-3">
                  <User className="w-8 h-8 text-zinc-100" />
                  <p className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Belum ada user terdaftar</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
