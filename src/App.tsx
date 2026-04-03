/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { History, Plus, Image as ImageIcon, Video, Copy, Upload, Trash2, Loader2, Check, LogOut, LogIn, Key } from 'lucide-react';
import { generateScript } from './lib/gemini';
import { GeneratedResult, HistoryItem } from './types';
import { cn } from './lib/utils';
import { auth, googleProvider, db, firebaseConfig } from './lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, query, where, onSnapshot, orderBy, deleteDoc, doc, writeBatch } from 'firebase/firestore';

interface AccessCodeInfo {
  fullName: string;
  expirationDate: string;
}

// Danh sách mã code hợp lệ (Bạn có thể thêm/sửa mã ở đây)
const VALID_CODES: Record<string, AccessCodeInfo> = {
  "DEMO123": { fullName: "Giáo viên Demo", expirationDate: "10/04/2026" },
  "VIP2026": { fullName: "Khách hàng VIP", expirationDate: "01/06/2027" },
  "PHAMNA": { fullName: "Phạm Na", expirationDate: "Vĩnh viễn" },
  "CHIEN123": { fullName: "Văn Chiến", expirationDate: "Vĩnh viễn" }
};

const isCodeExpired = (expirationDate: string) => {
  if (expirationDate.toLowerCase() === 'vĩnh viễn') return false;
  
  const parts = expirationDate.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Tháng trong JS bắt đầu từ 0
    const year = parseInt(parts[2], 10);
    
    const expDate = new Date(year, month, day);
    expDate.setHours(23, 59, 59, 999); // Hết hạn vào cuối ngày
    
    return new Date() > expDate;
  }
  return false;
};

export default function App() {
  const [isRemixUnlocked, setIsRemixUnlocked] = useState(() => {
    return localStorage.getItem('remixUnlocked') === 'true';
  });
  const [remixPassword, setRemixPassword] = useState('');
  const [showRemixWarning, setShowRemixWarning] = useState(false);
  
  // Nếu projectId khác với bản gốc, tức là app đã bị Remix sang một project khác
  const isRemixed = firebaseConfig?.projectId && firebaseConfig.projectId !== "gen-lang-client-0877461876";

  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [codeInfo, setCodeInfo] = useState<AccessCodeInfo | null>(null);
  const [codeError, setCodeError] = useState('');

  const [idea, setIdea] = useState('');
  const [audience, setAudience] = useState('THCS');
  const [style, setStyle] = useState('Hoạt hình 3D');
  const [duration, setDuration] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<'image' | 'video'>('image');
  const [videoEngine, setVideoEngine] = useState<'veo3' | 'grok'>('veo3');
  const [copiedScene, setCopiedScene] = useState<number | null>(null);

  useEffect(() => {
    const savedCode = localStorage.getItem('eduMasterCode');
    if (savedCode && VALID_CODES[savedCode]) {
      if (!isCodeExpired(VALID_CODES[savedCode].expirationDate)) {
        setCodeInfo(VALID_CODES[savedCode]);
      } else {
        localStorage.removeItem('eduMasterCode');
      }
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    const code = accessCodeInput.trim().toUpperCase();
    const codeData = VALID_CODES[code];
    
    if (codeData) {
      if (isCodeExpired(codeData.expirationDate)) {
        setCodeError('Code bạn nhập đã hết hạn, vui lòng liên hệ tác giả');
      } else {
        setCodeInfo(codeData);
        localStorage.setItem('eduMasterCode', code);
        setCodeError('');
      }
    } else {
      setCodeError('Mã code không hợp lệ.');
    }
  };

  useEffect(() => {
    if (!isAuthReady || !user) {
      setHistory([]);
      return;
    }

    const q = query(
      collection(db, 'history'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const historyData: HistoryItem[] = [];
      snapshot.forEach((doc) => {
        historyData.push({ id: doc.id, ...doc.data() } as HistoryItem);
      });
      setHistory(historyData);
    }, (error) => {
      console.error("Error fetching history:", error);
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login error:", error);
      alert("Đăng nhập thất bại. Vui lòng thử lại.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setResult(null);
      setIdea('');
      setFiles([]);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const saveHistory = async (ideaText: string, res: GeneratedResult) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'history'), {
        userId: user.uid,
        date: new Date().toLocaleString('vi-VN'),
        idea: ideaText,
        result: res,
        createdAt: Date.now()
      });
    } catch (error) {
      console.error("Error saving history:", error);
    }
  };

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'history', id));
    } catch (error) {
      console.error("Error deleting history item:", error);
    }
  };

  const deleteAllHistory = async () => {
    if (!user || history.length === 0) return;
    if (!window.confirm("Bạn có chắc chắn muốn xóa tất cả lịch sử?")) return;
    
    try {
      const batch = writeBatch(db);
      history.forEach((item) => {
        batch.delete(doc(db, 'history', item.id));
      });
      await batch.commit();
    } catch (error) {
      console.error("Error deleting all history:", error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      setFiles(prev => [...prev, ...Array.from(e.clipboardData.files)]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idea.trim()) return;

    setIsLoading(true);
    try {
      const res = await generateScript(idea, audience, style, duration, files);
      setResult(res);
      await saveHistory(idea, res);
      setActiveTab('image');
    } catch (error) {
      console.error(error);
      alert('Có lỗi xảy ra khi tạo kịch bản. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const copySceneJson = (scene: any) => {
    navigator.clipboard.writeText(JSON.stringify(scene, null, 2));
    setCopiedScene(scene.scene);
    setTimeout(() => setCopiedScene(null), 2000);
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setIdea(item.idea);
    setResult(item.result);
    setActiveTab('image');
  };

  if (isRemixed && !isRemixUnlocked) {
    if (showRemixWarning) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
          <div className="bg-white p-8 rounded-2xl max-w-2xl w-full text-center shadow-2xl border-4 border-red-600">
            <h2 className="text-2xl md:text-3xl font-black text-red-600 uppercase leading-relaxed">
              BẠN ĐANG VI PHẠM LUẬT AN NINH MẠNG: SAO CHÉP TRÁI PHÉP. NẾU TIẾP TỤC, CÔNG AN SẼ VÀO CUỘC
            </h2>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Copy size={32} />
          </div>
          <h3 className="text-xl font-bold mb-2 text-gray-900">Phát hiện bản sao chép (Remix)</h3>
          <p className="text-gray-600 mb-6 text-sm">Ứng dụng này đã được sao chép từ bản gốc. Vui lòng nhập mã bảo mật của tác giả để được phép sử dụng.</p>
          <input 
            type="password" 
            value={remixPassword}
            onChange={e => setRemixPassword(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (remixPassword === "Chien89@") {
                  setIsRemixUnlocked(true);
                  localStorage.setItem('remixUnlocked', 'true');
                } else {
                  setShowRemixWarning(true);
                }
              }
            }}
            className="w-full p-3 border border-gray-300 rounded-xl mb-6 focus:ring-2 focus:ring-blue-500 outline-none text-center tracking-widest"
            placeholder="Nhập mã bảo mật..."
            autoFocus
          />
          <button 
            onClick={() => {
              if (remixPassword === "Chien89@") {
                setIsRemixUnlocked(true);
                localStorage.setItem('remixUnlocked', 'true');
              } else {
                setShowRemixWarning(true);
              }
            }}
            className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold transition-colors"
          >
            Xác nhận
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  if (!codeInfo) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 max-w-md w-full text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-600 text-white p-3 rounded-xl flex items-center justify-center">
              <Key size={32} />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Nhập mã truy cập</h1>
          <p className="text-gray-500 mb-6 text-sm">
            Nếu bạn chưa có mã code vui lòng liên hệ tác giả qua Zalo <strong className="text-blue-600">0977722961</strong>.
          </p>
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <input
                type="text"
                value={accessCodeInput}
                onChange={(e) => { setAccessCodeInput(e.target.value); setCodeError(''); }}
                placeholder="Nhập mã code của bạn..."
                className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center uppercase font-medium tracking-wider"
              />
              {codeError && <p className="text-red-500 text-sm mt-2">{codeError}</p>}
            </div>
            <button
              type="submit"
              disabled={!accessCodeInput.trim()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              Xác nhận
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 max-w-md w-full text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-600 text-white p-3 rounded-xl flex items-center justify-center">
              <Video size={32} />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Chào mừng {codeInfo.fullName} đến với Edu Master
          </h1>
          <p className="text-gray-500 mb-4 text-sm">
            Ứng dụng tạo kịch bản video truyền cảm hứng cho tiết học bằng AI. Vui lòng đăng nhập để tiếp tục và lưu lịch sử của bạn.
          </p>
          <div className="bg-blue-50 text-blue-700 py-2 px-4 rounded-lg inline-block mb-8 text-sm font-medium border border-blue-100">
            Bạn được sử dụng Edu Master đến: {codeInfo.expirationDate}
          </div>
          <button
            onClick={handleLogin}
            className="w-full py-3 px-4 bg-white border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-3 shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Đăng nhập bằng Google
          </button>
          
          <button 
            onClick={() => {
              setCodeInfo(null);
              localStorage.removeItem('eduMasterCode');
            }}
            className="mt-6 text-sm text-gray-400 hover:text-gray-600 underline"
          >
            Nhập mã code khác
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h1 className="font-bold text-lg flex items-center gap-2">
            <span className="bg-blue-600 text-white p-1 rounded">Edu</span>
            Master
          </h1>
          <button 
            onClick={() => { setResult(null); setIdea(''); setFiles([]); }}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="Tạo mới"
          >
            <Plus size={20} />
          </button>
        </div>
        
        {/* User Profile Area */}
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            {user.photoURL ? (
              <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                {user.email?.[0].toUpperCase()}
              </div>
            )}
            <div className="truncate">
              <p className="text-sm font-medium truncate">{user.displayName || 'Người dùng'}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors flex-shrink-0"
            title="Đăng xuất"
          >
            <LogOut size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <History size={14} /> Lịch sử
            </h2>
            {history.length > 0 && (
              <button 
                onClick={deleteAllHistory}
                className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
              >
                Xóa tất cả
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Chưa có lịch sử</p>
          ) : (
            history.map(item => (
              <div 
                key={item.id} 
                onClick={() => loadHistoryItem(item)}
                className="group relative p-3 bg-gray-50 hover:bg-blue-50 border border-gray-100 rounded-lg cursor-pointer transition-colors pr-8"
              >
                <p className="text-sm font-medium line-clamp-2 mb-1">{item.idea}</p>
                <p className="text-xs text-gray-400">{item.date}</p>
                <button
                  onClick={(e) => deleteHistoryItem(item.id, e)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                  title="Xóa"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="p-4 border-t border-gray-200 text-center text-xs text-gray-500 font-medium">
          Design by Văn Chiến
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 lg:p-10">
          <div className="max-w-4xl mx-auto space-y-8">
            
            {/* Input Form */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold mb-4">Khởi tạo kịch bản</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ý tưởng câu chuyện *</label>
                  <textarea 
                    value={idea}
                    onChange={e => setIdea(e.target.value)}
                    onPaste={handlePaste}
                    placeholder="Nhập ý tưởng của bạn (có thể paste ảnh vào đây)..."
                    className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px] resize-y"
                    required
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Đối tượng</label>
                    <select 
                      value={audience} 
                      onChange={e => setAudience(e.target.value)}
                      className="w-full p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Tiểu học">Tiểu học</option>
                      <option value="THCS">THCS</option>
                      <option value="THPT">THPT</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phong cách</label>
                    <select 
                      value={style} 
                      onChange={e => setStyle(e.target.value)}
                      className="w-full p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Hoạt hình 3D">Hoạt hình 3D</option>
                      <option value="Phim chân thực">Phim chân thực</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Thời lượng (tùy chọn)</label>
                    <input 
                      type="text" 
                      value={duration} 
                      onChange={e => setDuration(e.target.value)}
                      placeholder="VD: 2 phút"
                      className="w-full p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tài liệu tham khảo (Ảnh, PDF, DOCX)</label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl cursor-pointer transition-colors">
                      <Upload size={18} />
                      <span className="text-sm font-medium">Tải lên</span>
                      <input 
                        type="file" 
                        multiple 
                        accept="image/*,.pdf,.docx" 
                        onChange={handleFileChange}
                        className="hidden" 
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {files.map((file, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                          <span className="max-w-[150px] truncate">{file.name}</span>
                          <button type="button" onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="hover:text-blue-900">
                            <Trash2 size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button 
                    type="submit" 
                    disabled={isLoading || !idea.trim()}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Tạo Kịch Bản'}
                  </button>
                </div>
              </form>
            </div>

            {/* Results Area */}
            {result && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="flex border-b border-gray-200">
                  <button 
                    onClick={() => setActiveTab('image')}
                    className={cn(
                      "flex-1 py-4 px-6 font-medium text-sm flex items-center justify-center gap-2 transition-colors",
                      activeTab === 'image' ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600" : "text-gray-500 hover:bg-gray-50"
                    )}
                  >
                    <ImageIcon size={18} /> Tạo Ảnh (Nano Banana)
                  </button>
                  <button 
                    onClick={() => setActiveTab('video')}
                    className={cn(
                      "flex-1 py-4 px-6 font-medium text-sm flex items-center justify-center gap-2 transition-colors",
                      activeTab === 'video' ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600" : "text-gray-500 hover:bg-gray-50"
                    )}
                  >
                    <Video size={18} /> Tạo Video
                  </button>
                </div>

                <div className="p-6">
                  {activeTab === 'image' && (
                    <div className="space-y-6">
                      <h3 className="text-lg font-bold">Prompt tạo hình ảnh nhân vật</h3>
                      <p className="text-sm text-gray-500 mb-4">Sử dụng các prompt này trên Nano Banana (Gemini 2.5 Flash Image) để tạo nhân vật đồng nhất.</p>
                      
                      <div className="grid gap-4">
                        {result.imagePrompts.map((prompt, idx) => (
                          <div key={idx} className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                            <h4 className="font-bold text-blue-700 mb-2">{prompt.characterName}</h4>
                            <p className="text-sm text-gray-700 font-mono bg-white p-3 rounded border border-gray-200 whitespace-pre-wrap">
                              {prompt.nanoBananaPrompt}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTab === 'video' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                          <button 
                            onClick={() => setVideoEngine('veo3')}
                            className={cn(
                              "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
                              videoEngine === 'veo3' ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                            )}
                          >
                            Veo3 (8s)
                          </button>
                          <button 
                            onClick={() => setVideoEngine('grok')}
                            className={cn(
                              "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
                              videoEngine === 'grok' ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                            )}
                          >
                            Grok (10s)
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {result.videoScript[videoEngine].map((scene, idx) => (
                          <div key={idx} className="flex gap-4 p-4 border border-gray-200 rounded-xl hover:border-blue-300 transition-colors">
                            <div className="flex-shrink-0 w-16 h-16 bg-blue-100 text-blue-700 rounded-xl flex flex-col items-center justify-center font-bold">
                              <span className="text-xs font-normal opacity-70">Cảnh</span>
                              <span>{scene.scene}</span>
                            </div>
                            <div className="flex-1 space-y-2">
                              <div className="flex justify-between items-start">
                                <h4 className="font-bold text-gray-900">Nhân vật: <span className="font-normal text-gray-700">{scene.character}</span></h4>
                                <button 
                                  onClick={() => copySceneJson(scene)}
                                  className="text-xs font-mono bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded border border-blue-200 transition-colors flex items-center gap-1 cursor-pointer"
                                  title="Click để copy JSON phân cảnh này"
                                >
                                  {copiedScene === scene.scene ? <Check size={12} /> : <Copy size={12} />}
                                  {copiedScene === scene.scene ? 'Đã copy' : scene.timeline}
                                </button>
                              </div>
                              <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                <p className="text-sm">
                                  <span className="font-semibold text-gray-700">Thoại: </span>
                                  <span className="italic text-gray-600">"{scene.dialogue}"</span>
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-8 pt-6 border-t border-gray-200">
                        <h3 className="text-lg font-bold mb-3">Lời thuyết minh (Voiceover)</h3>
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                            {result.voiceover}
                          </p>
                        </div>
                      </div>

                      {result.references && (
                        <div className="mt-6 pt-6 border-t border-gray-200">
                          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Tài liệu tham khảo / Ghi chú</h3>
                          <p className="text-sm text-gray-600 whitespace-pre-wrap">{result.references}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
