"use client";

import React, { useState, useEffect } from "react";
import { machineService, socket } from "../services/api";

export function AnalyticsPanel() {
  const [activeTab, setActiveTab] = useState("daily");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await machineService.getAnalytics();
      if (res && res.success) {
        setAnalytics(res.data);
      } else {
        throw new Error("Không thể tải dữ liệu phân tích");
      }
    } catch (err) {
      console.error("[AnalyticsPanel Error] Lỗi fetch:", err);
      setError(err.message || "Đã xảy ra lỗi khi kết nối cơ sở dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Tải dữ liệu ban đầu
    fetchAnalytics();

    // 2. Lắng nghe WebSocket để tự động cập nhật ngầm thời gian thực (Silent Refresh)
    if (socket) {
      const handleQueueUpdate = () => {
        console.log("[Socket.IO] Phát hiện thay đổi hệ thống! Tự động cập nhật ngầm dữ liệu thống kê...");
        machineService.getAnalytics()
          .then(res => {
            if (res && res.success) {
              setAnalytics(res.data);
            }
          })
          .catch(err => console.error("[Socket.IO Auto-Refresh Error]:", err));
      };

      socket.on("queue_updated", handleQueueUpdate);

      // Clean up listener khi component unmount
      return () => {
        socket.off("queue_updated", handleQueueUpdate);
      };
    }
  }, []);

  if (loading) {
    return (
      <div className="glass-panel rounded-3xl p-8 mt-8 w-full max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[350px] animate-pulse">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-semibold text-slate-500 mt-4">Đang truy vấn dữ liệu từ Aiven Cloud...</p>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="glass-panel rounded-3xl p-8 mt-8 w-full max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[300px]">
        <span className="text-4xl">⚠️</span>
        <p className="text-base font-bold text-red-500 mt-3">Lỗi tải dữ liệu thống kê</p>
        <p className="text-xs text-gray-500 mt-1 max-w-md text-center">{error}</p>
        <button
          onClick={fetchAnalytics}
          className="mt-6 px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-bold hover:shadow-lg transition-all hover:scale-105"
        >
          🔄 Thử lại ngay
        </button>
      </div>
    );
  }

  const { summary, dailyData, hourlyData } = analytics;
  const totalWeeklyOrders = summary.coca_total + summary.pepsi_total;

  // Tính giá trị lớn nhất cho biểu đồ ngày
  const maxDailyVal = Math.max(...dailyData.map(d => Math.max(d.coca, d.pepsi, 1)), 5);
  // Tính giá trị lớn nhất cho biểu đồ giờ
  const maxHourlyVal = Math.max(...hourlyData.map(h => Math.max(h.total, 1)), 5);

  // Vẽ biểu đồ Area Chart cho 24h
  const width24h = 700;
  const height24h = 160;
  const padding = 20;

  // Tạo điểm vẽ Area Chart 24h
  const points24h = hourlyData.map((h, i) => {
    const x = padding + (i / 23) * (width24h - 2 * padding);
    const y = height24h - padding - (h.total / maxHourlyVal) * (height24h - 2 * padding);
    return { x, y, ...h };
  });

  const pathD = points24h.length > 0 
    ? `M ${points24h[0].x} ${points24h[0].y} ` + points24h.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ")
    : "";

  const areaD = points24h.length > 0
    ? `${pathD} L ${points24h[points24h.length - 1].x} ${height24h - padding} L ${points24h[0].x} ${height24h - padding} Z`
    : "";

  return (
    <div className="glass-panel rounded-3xl p-6 mt-8 w-full max-w-4xl mx-auto overflow-hidden animate-slide-up-fade">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-5 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl animate-bounce">📊</span>
            <h2 className="text-xl font-bold text-gray-800 tracking-tight">Trực Quan Hóa Hoạt Động Bán Hàng</h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">Dữ liệu phân tích thực tế từ Database trong 1 tuần qua</p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={fetchAnalytics}
            title="Tải lại dữ liệu từ DB"
            className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-all hover:scale-105 active:scale-95 text-sm"
          >
            🔄 Làm mới
          </button>

          {/* Tab Navigation */}
          <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-semibold">
            <button 
              onClick={() => setActiveTab("daily")} 
              className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === "daily" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
            >
              7 Ngày Gần Nhất
            </button>
            <button 
              onClick={() => setActiveTab("hourly")} 
              className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === "hourly" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
            >
              Khung Giờ 24H
            </button>
          </div>
        </div>
      </div>

      {/* Thẻ Chỉ Số Thông Minh (WOW Cards) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        
        {/* Card 1: Bán chạy nhất */}
        <div className="bg-gradient-to-br from-red-50/80 to-blue-50/40 p-4 rounded-2xl border border-red-100/50 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Yêu Thích Nhất</span>
          <div className="my-2">
            <span className="text-lg font-black text-slate-800 block">
              {summary.most_sold_drink}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <span className="w-2 h-2 rounded-full bg-red-500"></span> Coca: {summary.coca_total}
            <span className="w-2 h-2 rounded-full bg-blue-500"></span> Pepsi: {summary.pepsi_total}
          </div>
        </div>

        {/* Card 2: Peak Hour */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50/40 p-4 rounded-2xl border border-orange-100/50 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Khung Giờ Cao Điểm</span>
          <div className="my-2">
            <span className="text-xl font-black text-slate-800 block">
              {summary.peak_hour}
            </span>
          </div>
          <span className="text-[10px] text-orange-600 font-semibold">
            Đỉnh điểm: {summary.peak_hour_count} ly bán được
          </span>
        </div>

        {/* Card 3: Peak Day */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50/40 p-4 rounded-2xl border border-emerald-100/50 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Ngày Mua Nhiều Nhất</span>
          <div className="my-2">
            <span className="text-xl font-black text-slate-800 block">
              {summary.peak_day}
            </span>
          </div>
          <span className="text-[10px] text-emerald-600 font-semibold">
            Đã bán: {summary.peak_day_count} ly nước
          </span>
        </div>

        {/* Card 4: Tổng ly */}
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50/40 p-4 rounded-2xl border border-purple-100/50 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Tổng Nước Bán Ra</span>
          <div className="my-2">
            <span className="text-2xl font-black text-slate-800 block">
              {totalWeeklyOrders} <span className="text-xs font-normal text-gray-500">ly</span>
            </span>
          </div>
          <span className="text-[10px] text-purple-600 font-semibold">
            Trong vòng 7 ngày qua
          </span>
        </div>
      </div>

      {/* Main Charts Area */}
      <div className="bg-white/60 border border-slate-100 rounded-2xl p-5 shadow-sm">
        
        {activeTab === "daily" ? (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <span className="text-blue-500">📅</span> Lượng Nước Tiêu Thụ Hàng Ngày (7 Ngày Qua)
              </h3>
              <div className="flex gap-4 text-xs font-semibold">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500"></span>Coca-Cola</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-500"></span>Pepsi</span>
              </div>
            </div>

            {/* SVG Grouped Bar Chart */}
            <div className="relative w-full overflow-x-auto">
              <svg viewBox="0 0 700 220" className="w-full min-w-[600px] h-auto">
                <defs>
                  {/* Gradients */}
                  <linearGradient id="coca-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EF4444" />
                    <stop offset="100%" stopColor="#B91C1C" />
                  </linearGradient>
                  <linearGradient id="pepsi-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" />
                    <stop offset="100%" stopColor="#1D4ED8" />
                  </linearGradient>
                </defs>

                {/* Grid Lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                  const y = 20 + ratio * 150;
                  const label = Math.round(maxDailyVal * (1 - ratio));
                  return (
                    <g key={idx} className="opacity-40">
                      <line x1="40" y1={y} x2="680" y2={y} stroke="#E2E8F0" strokeDasharray="3 3" strokeWidth="1" />
                      <text x="15" y={y + 4} fill="#64748B" fontSize="10" fontWeight="bold" textAnchor="middle">{label}</text>
                    </g>
                  );
                })}

                {/* Bars */}
                {dailyData.map((d, idx) => {
                  const colWidth = 90;
                  const startX = 40 + idx * colWidth + 10;
                  
                  // Chiều cao cột Coca
                  const cocaHeight = (d.coca / maxDailyVal) * 150;
                  const cocaY = 170 - cocaHeight;
                  
                  // Chiều cao cột Pepsi
                  const pepsiHeight = (d.pepsi / maxDailyVal) * 150;
                  const pepsiY = 170 - pepsiHeight;

                  return (
                    <g key={idx} className="group cursor-pointer">
                      {/* Cột Coca */}
                      <rect 
                        x={startX + 10} 
                        y={cocaY} 
                        width="20" 
                        height={cocaHeight} 
                        rx="4" 
                        fill="url(#coca-grad)" 
                        className="transition-all duration-500 hover:opacity-80"
                      />
                      {/* Tooltip số lượng Coca */}
                      {d.coca > 0 && (
                        <text x={startX + 20} y={cocaY - 5} fill="#EF4444" fontSize="9" fontWeight="bold" textAnchor="middle">
                          {d.coca}
                        </text>
                      )}

                      {/* Cột Pepsi */}
                      <rect 
                        x={startX + 34} 
                        y={pepsiY} 
                        width="20" 
                        height={pepsiHeight} 
                        rx="4" 
                        fill="url(#pepsi-grad)" 
                        className="transition-all duration-500 hover:opacity-80"
                      />
                      {/* Tooltip số lượng Pepsi */}
                      {d.pepsi > 0 && (
                        <text x={startX + 44} y={pepsiY - 5} fill="#3B82F6" fontSize="9" fontWeight="bold" textAnchor="middle">
                          {d.pepsi}
                        </text>
                      )}

                      {/* Label ngày */}
                      <text x={startX + 32} y="195" fill="#1E293B" fontSize="11" fontWeight="bold" textAnchor="middle">
                        {d.label}
                      </text>
                      <text x={startX + 32} y="210" fill="#94A3B8" fontSize="8" textAnchor="middle">
                        {d.date.substring(5)}
                      </text>
                    </g>
                  );
                })}
                <line x1="40" y1="170" x2="680" y2="170" stroke="#CBD5E1" strokeWidth="1.5" />
              </svg>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <span className="text-indigo-500">⏰</span> Tần Suất Đặt Hàng Theo Khung Giờ (24 Giờ Qua)
              </h3>
              <span className="text-xs bg-indigo-50 text-indigo-600 font-bold px-3 py-1 rounded-full border border-indigo-100">
                Phân tích lưu lượng mua hàng cao điểm
              </span>
            </div>

            {/* SVG Area Line Chart */}
            <div className="relative w-full overflow-x-auto">
              <svg viewBox="0 0 700 180" className="w-full min-w-[600px] h-auto">
                <defs>
                  {/* Area Gradient */}
                  <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366F1" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#6366F1" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid Lines */}
                {[0, 0.5, 1].map((ratio, idx) => {
                  const y = padding + ratio * (height24h - 2 * padding);
                  const label = Math.round(maxHourlyVal * (1 - ratio));
                  return (
                    <g key={idx} className="opacity-30">
                      <line x1={padding} y1={y} x2={width24h - padding} y2={y} stroke="#94A3B8" strokeDasharray="3 3" strokeWidth="1" />
                      <text x="10" y={y + 3} fill="#64748B" fontSize="9" fontWeight="bold">{label}</text>
                    </g>
                  );
                })}

                {/* Area under curve */}
                {areaD && (
                  <path d={areaD} fill="url(#area-grad)" />
                )}

                {/* Line Path */}
                {pathD && (
                  <path d={pathD} fill="none" stroke="#6366F1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                )}

                {/* Dots & Tooltips */}
                {points24h.map((p, idx) => {
                  // Chỉ hiển thị dot khi có nước hoặc cách 2h hiển thị nhãn một lần
                  const shouldShowDot = p.total > 0;
                  const isPeak = p.hour === parseInt(summary.peak_hour);

                  return (
                    <g key={idx} className="group cursor-pointer">
                      {shouldShowDot && (
                        <>
                          <circle 
                            cx={p.x} 
                            cy={p.y} 
                            r={isPeak ? "6" : "4"} 
                            fill={isPeak ? "#F59E0B" : "#4F46E5"} 
                            stroke="#FFFFFF" 
                            strokeWidth="2" 
                            className={`transition-all duration-300 ${isPeak ? "animate-pulse" : "group-hover:scale-150"}`}
                          />
                          {/* Tooltip khi hover */}
                          <g className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <rect x={p.x - 25} y={p.y - 26} width="50" height="18" rx="4" fill="#1E293B" />
                            <text x={p.x} y={p.y - 14} fill="#FFFFFF" fontSize="9" fontWeight="bold" textAnchor="middle">
                              {p.total} ly
                            </text>
                          </g>
                        </>
                      )}
                      
                      {/* Nhãn trục X dưới đáy */}
                      {p.hour % 2 === 0 && (
                        <text x={p.x} y={height24h - 2} fill="#94A3B8" fontSize="9" fontWeight="bold" textAnchor="middle">
                          {p.hour}h
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
