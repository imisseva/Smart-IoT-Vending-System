"use client";

import React from "react";

export function VirtualCup({ progress = 0, isPouring = false, drinkType = "coca" }) {
  // Chuẩn hóa progress từ 0 đến 100
  const normalizedProgress = Math.min(100, Math.max(0, progress));
  
  // Xác định màu nước dựa vào loại đồ uống
  const isCoca = drinkType.toLowerCase().includes("coca");
  const liquidBg = isCoca
    ? "linear-gradient(to top, #4A0E0E 0%, #C8102E 70%, #E31C3D 100%)" // Coca đỏ đậm đà sang đỏ tươi
    : "linear-gradient(to top, #0A1C3A 0%, #004B87 70%, #005691 100%)"; // Pepsi xanh dương đại dương sâu thẳm

  return (
    <div className="flex flex-col items-center justify-center p-4 my-2">
      {/* Vòi nước mô phỏng phía trên cốc */}
      <div className="relative w-12 h-6 bg-slate-300 rounded-t-lg shadow-inner flex items-center justify-center border-b-2 border-slate-400">
        <div className="w-4 h-3 bg-slate-500 rounded-b-md"></div>
        
        {/* Dòng chảy rót nước từ vòi xuống cốc */}
        {isPouring && normalizedProgress < 100 && (
          <div 
            className="absolute top-8 w-1.5 bg-white/70 animate-pulse"
            style={{
              height: "100px",
              left: "50%",
              transform: "translateX(-50%)",
              backgroundImage: isCoca 
                ? "linear-gradient(to bottom, rgba(200, 16, 46, 0.8), rgba(227, 28, 61, 0.4))"
                : "linear-gradient(to bottom, rgba(0, 75, 135, 0.8), rgba(0, 86, 145, 0.4))",
              boxShadow: "0 0 8px rgba(255,255,255,0.5)",
              zIndex: 5
            }}
          ></div>
        )}
      </div>

      {/* Cốc nước Glassmorphic */}
      <div 
        className="relative w-44 h-56 mt-2 rounded-b-[40px] rounded-t-[10px] border-4 border-slate-200/80 shadow-2xl bg-white/10 backdrop-blur-[2px] overflow-hidden flex flex-col justify-end"
        style={{
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.15), inset 0 -20px 30px -10px rgba(255,255,255,0.6)",
        }}
      >
        {/* Vành cốc thủy tinh sáng */}
        <div className="absolute top-0 left-0 right-0 h-3 bg-white/40 border-b border-white/20 rounded-t-[6px]"></div>

        {/* Khối chất lỏng dâng lên */}
        <div 
          className="relative w-full rounded-b-[36px] transition-all duration-300 ease-out overflow-hidden"
          style={{
            height: `${normalizedProgress}%`,
            background: liquidBg,
            boxShadow: "inset 0 10px 20px rgba(255,255,255,0.2)",
          }}
        >
          {/* Lớp bọt trắng nổi ở mặt nước */}
          {normalizedProgress > 0 && (
            <div 
              className="absolute top-0 left-0 right-0 h-4 bg-white/30 backdrop-blur-[1px] animate-pulse flex items-center justify-center"
              style={{
                boxShadow: "0 -2px 10px rgba(255,255,255,0.8), inset 0 2px 4px rgba(255,255,255,0.4)"
              }}
            >
              {/* Bọt tăm li ti ở bề mặt */}
              <div className="flex gap-1">
                <span className="w-1 h-1 bg-white rounded-full opacity-60 animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-white rounded-full opacity-80 animate-bounce delay-75"></span>
                <span className="w-1 h-1 bg-white rounded-full opacity-50 animate-bounce delay-150"></span>
              </div>
            </div>
          )}

          {/* Các bong bóng khí sủi lên khi đang rót hoặc khi đã rót xong */}
          {normalizedProgress > 0 && (
            <div className="absolute inset-0 z-10 pointer-events-none">
              <span className={`bubble ${!isCoca ? 'bubble-pepsi' : ''}`}></span>
              <span className={`bubble ${!isCoca ? 'bubble-pepsi' : ''}`}></span>
              <span className={`bubble ${!isCoca ? 'bubble-pepsi' : ''}`}></span>
              <span className={`bubble ${!isCoca ? 'bubble-pepsi' : ''}`}></span>
              <span className={`bubble ${!isCoca ? 'bubble-pepsi' : ''}`}></span>
              <span className={`bubble ${!isCoca ? 'bubble-pepsi' : ''}`}></span>
            </div>
          )}
        </div>

        {/* % Tiến trình hiển thị chìm giữa cốc */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <span 
            className="text-4xl font-black transition-all duration-300 drop-shadow-md"
            style={{
              color: normalizedProgress > 45 ? "rgba(255,255,255,0.85)" : "#185FA5",
            }}
          >
            {normalizedProgress}%
          </span>
        </div>
      </div>

      {/* Chân đế khay đựng cốc của máy */}
      <div className="w-56 h-4 bg-slate-700 rounded-lg shadow-md border-t border-slate-600 relative overflow-hidden flex items-center justify-center">
        <div className="w-48 h-1 bg-slate-800 rounded"></div>
        {/* Ánh sáng LED xanh lá chiếu lên nếu phát hiện có cốc đặt đúng chỗ */}
        <div 
          className="absolute inset-0 opacity-40 transition-all duration-500 pointer-events-none"
          style={{
            background: isPouring 
              ? "radial-gradient(circle, rgba(29,158,117,0.6) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(24,95,165,0.3) 0%, transparent 70%)"
          }}
        ></div>
      </div>
    </div>
  );
}
