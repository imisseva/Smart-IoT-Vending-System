"use client";

import { useState, useEffect } from "react";
import { machineService, orderService, socket } from "../../services/api";
import { AnalyticsPanel } from "../../components/AnalyticsPanel";

export default function AdminPage() {
  const [cocaLevel, setCocaLevel] = useState(5000);
  const [pepsiLevel, setPepsiLevel] = useState(5000);
  const [queueList, setQueueList] = useState([]);
  const [cocaInput, setCocaInput] = useState("");
  const [pepsiInput, setPepsiInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // States quản lý đăng nhập Admin
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const maxCapacity = 10000; // 10L

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const showError = (msg) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 4000);
  };

  // Tải trạng thái bình chứa từ DB
  const fetchMachineStatus = async () => {
    try {
      const res = await machineService.getMachineStatus();
      if (res.success && Array.isArray(res.data)) {
        const coca = res.data.find((d) => Number(d.id) === 1);
        const pepsi = res.data.find((d) => Number(d.id) === 2);
        if (coca) setCocaLevel(coca.water_level);
        if (pepsi) setPepsiLevel(pepsi.water_level);
      }
    } catch (err) {
      console.error("Lỗi khi fetch trạng thái bình chứa:", err);
    }
  };

  // Tải hàng chờ
  const fetchQueue = async () => {
    try {
      const res = await orderService.getQueue();
      if (res.success) {
        setQueueList(res.data);
      }
    } catch (err) {
      console.error("Lỗi khi fetch hàng chờ:", err);
    }
  };

  // Kiểm tra đăng nhập ban đầu
  useEffect(() => {
    const isLogged = localStorage.getItem("admin_logged_in") === "true";
    if (isLogged) {
      setIsLoggedIn(true);
    }
    setCheckingAuth(false);
  }, []);

  // Đồng bộ Socket IO và Polling khi đã đăng nhập
  useEffect(() => {
    if (!isLoggedIn) return;

    fetchMachineStatus();
    fetchQueue();

    const handleQueueUpdate = () => {
      fetchQueue();
      fetchMachineStatus();
    };

    socket.on("queue_updated", handleQueueUpdate);

    socket.on("sensor_update", (data) => {
      if (data && Array.isArray(data.statuses)) {
        const coca = data.statuses.find((d) => Number(d.id) === 1);
        const pepsi = data.statuses.find((d) => Number(d.id) === 2);
        if (coca) setCocaLevel(coca.water_level);
        if (pepsi) setPepsiLevel(pepsi.water_level);
      }
    });

    // Polling dự phòng mỗi 4 giây
    const intervalId = setInterval(() => {
      fetchMachineStatus();
      fetchQueue();
    }, 4000);

    return () => {
      socket.off("queue_updated", handleQueueUpdate);
      socket.off("sensor_update");
      clearInterval(intervalId);
    };
  }, [isLoggedIn]);

  // Xử lý đăng nhập Admin
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!usernameInput.trim() || !passwordInput.trim()) {
      setLoginError("Vui lòng điền đầy đủ tài khoản và mật khẩu!");
      return;
    }

    setLoginLoading(true);
    setLoginError("");
    try {
      const res = await machineService.loginAdmin(usernameInput.trim(), passwordInput.trim());
      if (res && res.success) {
        localStorage.setItem("admin_logged_in", "true");
        localStorage.setItem("admin_user", res.admin.username);
        setIsLoggedIn(true);
        showSuccess("Đăng nhập tài khoản Admin thành công!");
      } else {
        setLoginError("Tên đăng nhập hoặc mật khẩu không chính xác.");
      }
    } catch (err) {
      console.error("[Login Admin Error]", err);
      setLoginError(err.response?.data?.error || "Tên đăng nhập hoặc mật khẩu không đúng.");
    } finally {
      setLoginLoading(false);
    }
  };

  // Xử lý đăng xuất
  const handleLogout = () => {
    localStorage.removeItem("admin_logged_in");
    localStorage.removeItem("admin_user");
    setIsLoggedIn(false);
    showSuccess("Đã đăng xuất tài khoản Admin.");
  };

  // Xử lý nạp nước
  const handleRefill = async (id, level) => {
    if (level === "" || isNaN(level) || level < 0 || level > maxCapacity) {
      showError(`Vui lòng nhập dung tích hợp lệ từ 0 đến ${maxCapacity}ml!`);
      return;
    }

    setLoading(true);
    try {
      const res = await machineService.refillWater(id, Math.round(level));
      if (res.success) {
        showSuccess(`Đã cập nhật mực nước bình ${id === 1 ? "Coca-Cola" : "Pepsi"} thành ${level}ml!`);
        if (id === 1) setCocaInput("");
        if (id === 2) setPepsiInput("");
        fetchMachineStatus();
      } else {
        showError("Cập nhật mực nước thất bại.");
      }
    } catch (err) {
      showError("Có lỗi xảy ra khi gọi API nạp nước.");
    } finally {
      setLoading(false);
    }
  };

  // Thanh toán hộ
  const handlePayOrder = async (orderId) => {
    try {
      const res = await orderService.payOrder(orderId);
      if (res.success) {
        showSuccess("Thanh toán đơn hàng thành công!");
        fetchQueue();
      }
    } catch (err) {
      showError("Lỗi thanh toán đơn hàng.");
    }
  };

  // Hoàn tất phục vụ/Hủy phục vụ cưỡng bức
  const handleCompleteOrder = async (orderId) => {
    try {
      const res = await machineService.completeOrder(orderId);
      if (res.success) {
        showSuccess("Đã hoàn tất phục vụ đơn hàng!");
        fetchQueue();
      }
    } catch (err) {
      showError("Lỗi hoàn tất phục vụ.");
    }
  };

  // Tính phần trăm mực nước
  const cocaPercent = Math.min(100, Math.max(0, (cocaLevel / maxCapacity) * 100));
  const pepsiPercent = Math.min(100, Math.max(0, (pepsiLevel / maxCapacity) * 100));

  // Render màn hình loading auth
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#185FA5] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Render màn hình đăng nhập nếu chưa authenticate
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-6 relative overflow-hidden">
        {/* Decorative background blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-100/50 rounded-full blur-[120px] pointer-events-none opacity-60"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-100/50 rounded-full blur-[120px] pointer-events-none opacity-60"></div>

        <div className="w-full max-w-md bg-white/80 backdrop-blur-xl rounded-[32px] p-8 border border-white/60 shadow-2xl shadow-indigo-100/30 relative z-10 animate-slide-up-fade">
          {/* Logo & Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-tr from-[#185FA5] to-[#4096ee] rounded-2xl flex items-center justify-center text-3xl mx-auto shadow-lg shadow-blue-200 animate-pulse">
              🥤
            </div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight mt-4 uppercase">
              Admin Dispenser Hub
            </h1>
            <p className="text-xs text-gray-500 mt-1">Vui lòng đăng nhập tài khoản quản trị để tiếp tục</p>
          </div>

          {/* Form đăng nhập */}
          <form onSubmit={handleLogin} className="space-y-5">
            {loginError && (
              <div className="bg-red-50 text-red-600 text-xs font-bold p-3.5 rounded-2xl border border-red-100 flex items-center gap-1.5 animate-shake">
                <span>⚠️</span> {loginError}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-gray-600 ml-1">Tên đăng nhập</label>
              <input 
                type="text" 
                placeholder="Nhập tên đăng nhập admin..."
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 text-xs font-semibold transition-all bg-white/50"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-gray-600 ml-1">Mật khẩu</label>
              <input 
                type="password" 
                placeholder="Nhập mật khẩu..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 text-xs font-semibold transition-all bg-white/50"
                required
              />
            </div>

            <button 
              type="submit"
              disabled={loginLoading}
              className="w-full py-3.5 bg-gradient-to-r from-[#185FA5] to-[#4096ee] text-white font-extrabold text-xs rounded-2xl hover:shadow-xl hover:shadow-blue-200 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
            >
              {loginLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <span>ĐĂNG NHẬP ADMIN HUB</span>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <a 
              href="/" 
              className="text-[11px] font-extrabold text-[#185FA5] hover:underline"
            >
              ← Quay lại trang phục vụ nước
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 sm:p-10">
      {/* HEADER QUẢN TRỊ */}
      <div className="max-w-6xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <span>⚙️</span>
            <span>SMART DISPENSER <span className="text-[#185FA5]">ADMIN</span> HUB</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">Trang quản lý vận hành, tiếp nước và giám sát hàng chờ thời gian thực.</p>
        </div>

        {/* Trạng thái máy và Đăng xuất */}
        <div className="flex items-center gap-3">


          <button 
            onClick={handleLogout}
            className="px-4 py-2 bg-white hover:bg-red-50 text-red-600 border border-slate-200 hover:border-red-200 font-extrabold text-xs rounded-2xl active:scale-95 transition-all shadow-sm flex items-center gap-1.5"
          >
            🚪 Đăng xuất
          </button>
        </div>
      </div>

      {/* TOAST THÔNG BÁO CHUNG */}
      <div className="max-w-6xl mx-auto relative">
        {successMsg && (
          <div className="absolute -top-4 left-0 right-0 z-50 bg-emerald-500 text-white text-xs font-bold px-4 py-3.5 rounded-xl shadow-lg flex items-center gap-2 animate-slide-up-fade">
            <span>✓</span> {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="absolute -top-4 left-0 right-0 z-50 bg-red-500 text-white text-xs font-bold px-4 py-3.5 rounded-xl shadow-lg flex items-center gap-2 animate-slide-up-fade">
            <span>⚠️</span> {errorMsg}
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* KHU VỰC 1: TRỰC QUAN HÓA 2 BÌNH CHỨA 3D VÀ FORM TIẾP NƯỚC */}
        <div className="lg:col-span-2 space-y-8">
          
          <div className="glass-panel rounded-3xl p-6 sm:p-8">
            <h2 className="text-base font-extrabold text-slate-800 mb-6 uppercase tracking-wider border-b border-slate-100 pb-3 flex items-center gap-2">
              <span>💧</span> GIÁM SÁT MỰC NƯỚC BÌNH CHỨA
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* BÌNH CHỨA COCA-COLA (ID: 1) */}
              <div className="flex flex-col items-center bg-red-50/20 border border-red-100/50 p-6 rounded-3xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-red-100/20 rounded-full blur-xl pointer-events-none"></div>
                <span className="bg-red-600 text-white font-extrabold text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider mb-4 shadow-sm">
                  COCA-COLA (Bình 1)
                </span>

                {/* Cylinder 3D Visual */}
                <div className="relative w-36 h-64 bg-slate-200/80 rounded-[20px] border-4 border-slate-300 shadow-inner flex flex-col justify-end overflow-hidden mb-5">
                  <div className="absolute top-0 left-0 right-0 h-4 bg-slate-300/40 border-b border-slate-400/20 rounded-t-[10px] z-20"></div>
                  
                  {/* Liquid volume */}
                  <div 
                    className="relative w-full rounded-b-[14px] transition-all duration-500 ease-out overflow-hidden"
                    style={{
                      height: `${cocaPercent}%`,
                      background: "linear-gradient(to top, #4A0E0E 0%, #C8102E 70%, #ff204e 100%)",
                      boxShadow: "inset 0 6px 12px rgba(255, 255, 255, 0.25)"
                    }}
                  >
                    {/* Floating Bubbles */}
                    {cocaPercent > 0 && (
                      <div className="absolute inset-0 z-10 pointer-events-none">
                        <span className="bubble"></span>
                        <span className="bubble"></span>
                        <span className="bubble"></span>
                        <span className="bubble"></span>
                        <span className="bubble"></span>
                      </div>
                    )}

                    {/* Liquid Top surface highlight */}
                    {cocaPercent > 0 && (
                      <div className="absolute top-0 left-0 right-0 h-3 bg-white/30 backdrop-blur-[0.5px] border-b border-white/20"></div>
                    )}
                  </div>

                  {/* Text display */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20 text-center">
                    <span className="text-3xl font-black text-slate-800 drop-shadow-sm bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/50 shadow-sm">
                      {cocaPercent.toFixed(1)}%
                    </span>
                    <span className="text-xs font-bold text-slate-600 mt-2 bg-slate-50/80 backdrop-blur-md px-2 py-0.5 rounded-full border border-slate-100/50">
                      {cocaLevel}ml / {maxCapacity}ml
                    </span>
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="w-full text-center mb-4">
                  {cocaLevel < 330 ? (
                    <span className="inline-block px-3 py-1 bg-red-100 text-red-600 border border-red-200 text-xs font-bold rounded-full animate-pulse">
                      🚨 HẾT NƯỚC COCA
                    </span>
                  ) : (
                    <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 text-xs font-bold rounded-full">
                      ✓ Đang sẵn sàng
                    </span>
                  )}
                </div>

                {/* Form nạp nước */}
                <div className="w-full space-y-3">
                  <div className="flex gap-2">
                    <input 
                      type="number"
                      placeholder="Dung tích ml..."
                      value={cocaInput}
                      onChange={(e) => setCocaInput(e.target.value)}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 text-xs font-semibold"
                    />
                    <button 
                      disabled={loading}
                      onClick={() => handleRefill(1, cocaInput)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl active:scale-95 transition-all shadow-md shadow-red-100"
                    >
                      Lưu
                    </button>
                  </div>

                  {/* Nút tắt */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <button 
                      onClick={() => handleRefill(1, 5000)}
                      className="py-1 px-2 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-300 text-[10px] font-bold text-slate-600 hover:text-red-600 rounded-lg transition-all"
                    >
                      + 5,000ml (50%)
                    </button>
                    <button 
                      onClick={() => handleRefill(1, 10000)}
                      className="py-1 px-2 bg-gradient-to-r from-red-600 to-red-500 text-white text-[10px] font-black rounded-lg transition-all hover:shadow-md active:scale-95"
                    >
                      ĐẦY BÌNH (10L)
                    </button>
                  </div>
                </div>

              </div>

              {/* BÌNH CHỨA PEPSI (ID: 2) */}
              <div className="flex flex-col items-center bg-blue-50/20 border border-blue-100/50 p-6 rounded-3xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-100/20 rounded-full blur-xl pointer-events-none"></div>
                <span className="bg-[#004B87] text-white font-extrabold text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider mb-4 shadow-sm">
                  PEPSI (Bình 2)
                </span>

                {/* Cylinder 3D Visual */}
                <div className="relative w-36 h-64 bg-slate-200/80 rounded-[20px] border-4 border-slate-300 shadow-inner flex flex-col justify-end overflow-hidden mb-5">
                  <div className="absolute top-0 left-0 right-0 h-4 bg-slate-300/40 border-b border-slate-400/20 rounded-t-[10px] z-20"></div>
                  
                  {/* Liquid volume */}
                  <div 
                    className="relative w-full rounded-b-[14px] transition-all duration-500 ease-out overflow-hidden"
                    style={{
                      height: `${pepsiPercent}%`,
                      background: "linear-gradient(to top, #0A1C3A 0%, #004B87 70%, #0080ff 100%)",
                      boxShadow: "inset 0 6px 12px rgba(255, 255, 255, 0.25)"
                    }}
                  >
                    {/* Floating Bubbles */}
                    {pepsiPercent > 0 && (
                      <div className="absolute inset-0 z-10 pointer-events-none">
                        <span className="bubble bubble-pepsi"></span>
                        <span className="bubble bubble-pepsi"></span>
                        <span className="bubble bubble-pepsi"></span>
                        <span className="bubble bubble-pepsi"></span>
                        <span className="bubble bubble-pepsi"></span>
                      </div>
                    )}

                    {/* Liquid Top surface highlight */}
                    {pepsiPercent > 0 && (
                      <div className="absolute top-0 left-0 right-0 h-3 bg-white/30 backdrop-blur-[0.5px] border-b border-white/20"></div>
                    )}
                  </div>

                  {/* Text display */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20 text-center">
                    <span className="text-3xl font-black text-slate-800 drop-shadow-sm bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/50 shadow-sm">
                      {pepsiPercent.toFixed(1)}%
                    </span>
                    <span className="text-xs font-bold text-slate-600 mt-2 bg-slate-50/80 backdrop-blur-md px-2 py-0.5 rounded-full border border-slate-100/50">
                      {pepsiLevel}ml / {maxCapacity}ml
                    </span>
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="w-full text-center mb-4">
                  {pepsiLevel < 330 ? (
                    <span className="inline-block px-3 py-1 bg-red-100 text-red-600 border border-red-200 text-xs font-bold rounded-full animate-pulse">
                      🚨 HẾT NƯỚC PEPSI
                    </span>
                  ) : (
                    <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 text-xs font-bold rounded-full">
                      ✓ Đang sẵn sàng
                    </span>
                  )}
                </div>

                {/* Form nạp nước */}
                <div className="w-full space-y-3">
                  <div className="flex gap-2">
                    <input 
                      type="number"
                      placeholder="Dung tích ml..."
                      value={pepsiInput}
                      onChange={(e) => setPepsiInput(e.target.value)}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs font-semibold"
                    />
                    <button 
                      disabled={loading}
                      onClick={() => handleRefill(2, pepsiInput)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl active:scale-95 transition-all shadow-md shadow-blue-100"
                    >
                      Lưu
                    </button>
                  </div>

                  {/* Nút tắt */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <button 
                      onClick={() => handleRefill(2, 5000)}
                      className="py-1 px-2 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-[10px] font-bold text-slate-600 hover:text-blue-600 rounded-lg transition-all"
                    >
                      + 5,000ml (50%)
                    </button>
                    <button 
                      onClick={() => handleRefill(2, 10000)}
                      className="py-1 px-2 bg-gradient-to-r from-blue-700 to-blue-600 text-white text-[10px] font-black rounded-lg transition-all hover:shadow-md active:scale-95"
                    >
                      ĐẦY BÌNH (10L)
                    </button>
                  </div>
                </div>

              </div>

            </div>
          </div>

        </div>

        {/* KHU VỰC 2: GIÁM SÁT HÀNG CHỜ VÀ ĐIỀU KHIỂN NHANH */}
        <div className="space-y-8">
          
          <div className="glass-panel rounded-3xl p-6">
            <h2 className="text-base font-extrabold text-slate-800 mb-4 uppercase tracking-wider border-b border-slate-100 pb-3 flex items-center gap-2">
              <span>📋</span> DANH SÁCH HÀNG CHỜ
            </h2>

            {queueList.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                <span className="text-3xl">☕</span>
                <p className="text-xs text-gray-500 font-bold mt-2.5">Không có khách hàng trong hàng chờ</p>
                <p className="text-[10px] text-gray-400 mt-1">Đơn đặt mới sẽ hiển thị tại đây.</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
                {queueList.map((order) => {
                  const isCoca = order.drink_name.includes("Coca");
                  const isServing = order.status === "Serving";

                  return (
                    <div 
                      key={order.id} 
                      className={`p-4 rounded-2xl border transition-all relative overflow-hidden bg-white shadow-sm flex flex-col justify-between ${
                        isServing 
                          ? "border-emerald-300 ring-2 ring-emerald-100" 
                          : "border-slate-100"
                      }`}
                    >
                      {/* Live flashing glow when serving */}
                      {isServing && (
                        <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500 animate-pulse"></div>
                      )}

                      <div className="flex justify-between items-start mb-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-[#185FA5]">#{order.queue_number}</span>
                            <span className="text-xs font-extrabold text-slate-800">{order.username}</span>
                          </div>
                          <span className="text-[10px] text-gray-400 font-mono mt-0.5 block">ID: {order.id}</span>
                        </div>

                        {/* Status Label */}
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full uppercase">
                            MIỄN PHÍ
                          </span>

                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            isServing 
                              ? "bg-emerald-500 text-white" 
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            {isServing ? "ĐANG RÓT" : "ĐANG CHỜ"}
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center bg-[#F8FAFC]/80 px-3 py-1.5 rounded-xl border border-slate-100/50 text-[11px] mb-3 font-semibold text-slate-700">
                        <span className="flex items-center gap-1">
                          <span className={isCoca ? "text-red-500" : "text-blue-500"}>●</span>
                          {order.drink_name}
                        </span>
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-gray-500 font-bold">{order.size}</span>
                      </div>

                      {/* Admin action controls */}
                      <div className="flex gap-2 pt-2 border-t border-slate-100">
                        <div className="flex-1 text-[10px] text-emerald-600 font-black flex items-center justify-center bg-emerald-50/50 border border-emerald-100 rounded-lg px-2 py-1 select-none">
                          ✓ Vé Hợp Lệ
                        </div>
                        <button 
                          onClick={() => handleCompleteOrder(order.id)}
                          className="px-3 py-1 bg-slate-800 hover:bg-red-600 text-white hover:text-white text-[10px] font-bold rounded-lg transition-all active:scale-95 flex items-center justify-center"
                        >
                          ✕ Xóa Hàng Chờ
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick controls panel */}
          <div className="glass-panel rounded-3xl p-6">
            <h3 className="text-xs font-bold text-slate-800 mb-3.5 uppercase tracking-wider border-b border-slate-100 pb-2">
              🛠️ ĐIỀU KHIỂN KHẨN CẤP
            </h3>
            <div className="space-y-3">
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Các phím tắt khôi phục an toàn dùng trong vận hành thực tế khi máy gặp sự cố kẹt cơ cấu nhả cốc hoặc rơ-le bơm nước.
              </p>
              
              <button 
                onClick={async () => {
                  try {
                    const activeOrders = queueList.filter(q => q.status === 'Serving');
                    if (activeOrders.length > 0) {
                      for (const o of activeOrders) {
                        await machineService.completeOrder(o.id);
                      }
                      showSuccess("Đã cưỡng bức reset rơ-le máy thành công!");
                      fetchQueue();
                    } else {
                      showError("Hiện tại không có đơn hàng nào đang chạy.");
                    }
                  } catch (e) {
                    showError("Lỗi cưỡng bức reset.");
                  }
                }}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-950 text-white font-extrabold text-xs rounded-xl transition-all shadow-md active:scale-98"
              >
                🔄 CƯỠNG BỨC RESET MÁY BƠM (VE MÁY CHỜ)
              </button>

              <a 
                href="/" 
                className="w-full block text-center py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-800 font-extrabold text-xs rounded-xl transition-all"
              >
                ← Quay lại trang bán nước
              </a>
            </div>
          </div>

        </div>

      </div>

      {/* BIỂU ĐỒ TRỰC QUAN HÓA THỐNG KÊ 1 TUẦN */}
      <div className="max-w-6xl mx-auto mt-8">
        <AnalyticsPanel />
      </div>
    </main>
  );
}
