"use client";

import { useState, useEffect } from "react";
import { ProgressBar } from "../../components/ProgressBar";
import { Card } from "../../components/Card";
import { orderService, machineService, socket } from "../../services/api";
import { drinks, sizes } from "../../constants/data";

export default function OrderWizard() {
  const [step, setStep] = useState(1);
  const [order, setOrder] = useState({ drink: "", size: "", ml: "", price: "", priceNum: 0, name: "", id: null, queue_number: "", payment_status: "Unpaid" });

  const [queueList, setQueueList] = useState([]);
  const [isPaying, setIsPaying] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [pourProgress, setPourProgress] = useState(0);
  const [isPouring, setIsPouring] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const [hasDroppedCup, setHasDroppedCup] = useState(false);
  const [isDroppingCup, setIsDroppingCup] = useState(false);
  const [isCupPlacedRealtime, setIsCupPlacedRealtime] = useState(false);

  // Hiển thị lỗi tạm thời (3 giây)
  const showError = (msg) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 3000);
  };

  // Đồng bộ trạng thái đơn hàng thời gian thực từ Database
  const syncOrderState = async (orderId) => {
    if (!orderId) return;
    try {
      const res = await orderService.getOrder(orderId);
      if (res.success && res.data) {
        const dbOrder = res.data;
        
        // Cập nhật thông tin order cục bộ
        setOrder(prev => {
          const updated = {
            ...prev,
            payment_status: dbOrder.payment_status,
            status: dbOrder.status
          };
          if (typeof window !== 'undefined') {
            localStorage.setItem('current_order', JSON.stringify(updated));
          }
          return updated;
        });

        // Tự động chuyển Step và khôi phục giao diện dựa trên trạng thái DB
        if (dbOrder.status === 'Done') {
          setStep(5);
          setIsDone(true);
          setPourProgress(100);
          setHasDroppedCup(true);
        } else if (dbOrder.status === 'Serving') {
          setStep(5);
          setIsPouring(true);
          setHasDroppedCup(true);
        } else if (dbOrder.status === 'Waiting') {
          setStep(4);
        }
      }
    } catch (err) {
      console.error('Lỗi đồng bộ trạng thái đơn hàng:', err);
    }
  };

  // Fetch Queue Real-time
  const fetchQueue = async () => {
    try {
      const res = await orderService.getQueue();
      if (res.success) setQueueList(res.data);
    } catch (err) {
      console.error('Lỗi tải hàng chờ:', err);
    }
  };

  useEffect(() => {
    const handleQueueUpdate = () => {
      fetchQueue();
      if (order.id) {
        syncOrderState(order.id);
      }
    };

    // Lắng nghe sự kiện từ Backend
    socket.on('queue_updated', handleQueueUpdate);
    socket.on('payment_success', (updatedOrder) => {
      if (Number(updatedOrder.id) === Number(order.id)) {
        setOrder(prev => {
          const nextOrder = { ...prev, payment_status: 'Paid' };
          if (typeof window !== 'undefined') {
            localStorage.setItem('current_order', JSON.stringify(nextOrder));
          }
          return nextOrder;
        });
      }
    });
    socket.on('sensor_update', (data) => {
      // Chỉ cập nhật tiến trình và trạng thái cốc nếu sự kiện realtime thuộc về chính đơn hàng này
      if (data && order.id && Number(data.order_id) === Number(order.id)) {
        if (typeof data.is_cup_placed !== 'undefined') {
          setIsCupPlacedRealtime(data.is_cup_placed);
        }
        if (typeof data.dispensing_progress !== 'undefined') {
          setPourProgress(data.dispensing_progress);
          setIsPouring(true);
          if (data.dispensing_progress >= 100) {
            setIsPouring(false);
            setIsDone(true);
          }
        }
      }
    });

    return () => {
      socket.off('queue_updated', handleQueueUpdate);
      socket.off('payment_success');
      socket.off('sensor_update');
    };
  }, [order.id]);

  // Kích hoạt cơ chế Polling dự phòng (Fallback Polling) để tự động đồng bộ trạng thái DB phòng trường hợp Socket.IO bị chập chờn
  useEffect(() => {
    let intervalId = null;

    if (order.id && (step === 4 || step === 5)) {
      // Thực hiện đồng bộ lập tức khi đổi sang màn hình chờ hoặc màn hình rót nước
      syncOrderState(order.id);
      fetchQueue();

      // Thiết lập Polling định kỳ mỗi 2 giây
      intervalId = setInterval(() => {
        syncOrderState(order.id);
        fetchQueue();
      }, 2000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [order.id, step]);

  // Tạo Order
  const handlePlaceOrder = async () => {
    try {
      const res = await orderService.createOrder({
        username: order.name,
        drink_name: order.drink,
        size: order.size
      });
      if (res.success) {
        const newOrder = { ...order, id: res.data.id, queue_number: res.data.queue_number, payment_status: res.data.payment_status };
        setOrder(newOrder);
        if (typeof window !== 'undefined') {
          localStorage.setItem('current_order', JSON.stringify(newOrder));
          localStorage.setItem('order_step', '4');
          localStorage.setItem('has_dropped_cup', 'false');
        }
        setHasDroppedCup(false);
        fetchQueue();
        setStep(4);
      }
    } catch (err) {
      showError('Không thể tạo đơn hàng. Vui lòng thử lại!');
    }
  };

  // Quản lý lưu trữ trạng thái bền vững (Persistence) qua localStorage để chống lỗi out app / reload trang
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedOrder = localStorage.getItem('current_order');
      const savedStep = localStorage.getItem('order_step');
      const savedHasDroppedCup = localStorage.getItem('has_dropped_cup');
      
      let parsed = null;
      if (savedOrder) {
        try {
          parsed = JSON.parse(savedOrder);
          if (parsed && parsed.id) {
            setOrder(parsed);
          }
        } catch (e) {
          console.error("Lỗi parse order từ localStorage", e);
        }
      }
      if (savedStep) {
        setStep(parseInt(savedStep));
      }
      if (savedHasDroppedCup) {
        setHasDroppedCup(savedHasDroppedCup === 'true');
      }
      
      fetchQueue();

      if (parsed && parsed.id) {
        syncOrderState(parsed.id);
      }
    }
  }, []);

  // Tự động lưu order vào localStorage khi thay đổi
  useEffect(() => {
    if (typeof window !== 'undefined' && order && order.id) {
      localStorage.setItem('current_order', JSON.stringify(order));
    }
  }, [order]);

  // Tự động lưu step vào localStorage khi thay đổi
  useEffect(() => {
    if (typeof window !== 'undefined' && step > 1) {
      localStorage.setItem('order_step', step.toString());
    }
  }, [step]);

  // Tự động lưu hasDroppedCup vào localStorage khi thay đổi
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('has_dropped_cup', hasDroppedCup ? 'true' : 'false');
    }
  }, [hasDroppedCup]);

  const handleResetSession = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('current_order');
      localStorage.removeItem('order_step');
      localStorage.removeItem('has_dropped_cup');
    }
    setStep(1);
    setOrder({ drink: "", size: "", ml: "", price: "", priceNum: 0, name: "", id: null, queue_number: "", payment_status: "Unpaid" });
    setPourProgress(0);
    setIsDone(false);
    setHasDroppedCup(false);
    setIsCupPlacedRealtime(false);
  };

  const renderStep1 = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800 text-center mb-6">Chọn loại nước</h2>
      <div className="grid grid-cols-2 gap-4">
        {drinks.map(d => (
          <Card key={d.id} selected={order.drink === d.id} badge={d.badge} onClick={() => { setOrder({ ...order, drink: d.id, name: d.name }); setTimeout(() => setStep(2), 300); }}>
            <div className="text-center py-2"><div className="text-4xl mb-2">{d.icon}</div><h3 className="font-bold text-gray-800">{d.name}</h3><p className="text-xs text-gray-500 mt-1">{d.desc}</p></div>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800 text-center mb-6">Chọn kích cỡ</h2>
      <div className="flex flex-col gap-3">
        {sizes.map(s => (
          <Card key={s.id} selected={order.size === s.id} onClick={() => { setOrder({ ...order, size: s.id, ml: s.ml, price: s.price, priceNum: s.priceNum }); setTimeout(() => setStep(3), 300); }}>
            <div className="flex justify-between items-center px-2"><div><h3 className="font-bold text-gray-800">{s.name}</h3><p className="text-sm text-gray-500">{s.ml}</p></div><span className="font-bold text-[#185FA5]">{s.price}</span></div>
          </Card>
        ))}
      </div>
      <button onClick={() => setStep(1)} className="w-full mt-4 py-3 font-medium text-gray-500 hover:text-gray-800">Quay lại</button>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800 text-center mb-2">Thông tin đơn hàng</h2>
      <div><label className="block text-sm font-medium text-gray-700 mb-2">Tên của bạn</label><input type="text" maxLength={20} value={order.name} onChange={e => setOrder({ ...order, name: e.target.value })} placeholder="VD: Tuấn Anh" className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:border-[#185FA5]"/></div>
      <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
        <h3 className="font-bold text-gray-800 mb-4 border-b border-gray-200 pb-2">Tóm tắt</h3>
        <div className="flex justify-between text-sm mb-2"><span className="text-gray-600">Thức uống:</span><span className="font-medium text-gray-800">{order.drink}</span></div>
        <div className="flex justify-between text-sm mb-2"><span className="text-gray-600">Size:</span><span className="font-medium text-gray-800">{order.size} ({order.ml})</span></div>
        <div className="flex justify-between text-base mt-4 pt-2 border-t border-gray-200"><span className="font-bold text-gray-800">Tổng tiền:</span><span className="font-bold text-[#185FA5]">{order.price}</span></div>
      </div>
      <div className="flex flex-col gap-3"><button disabled={!order.name.trim()} onClick={handlePlaceOrder} className="w-full py-3 bg-[#185FA5] text-white font-bold rounded-xl disabled:bg-gray-300 transition-colors">Tạo Đơn Hàng</button><button onClick={() => setStep(2)} className="w-full py-3 font-medium text-gray-500 hover:text-gray-800">Quay lại</button></div>
    </div>
  );

  const renderStep4 = () => {
    // Xác định người đang được phục vụ thực tế (đang rót nước)
    const servingOrder = queueList.find(q => q.status === 'Serving');
    
    // Lấy đơn hàng đầu tiên đã thanh toán và đang chờ phục vụ
    const firstPaidOrder = queueList.find(q => q.payment_status === 'Paid');
    
    // Là lượt của mình nếu:
    // 1. Máy đang phục vụ chính đơn của mình
    // 2. Hoặc máy chưa phục vụ ai, đơn của mình đã thanh toán và đứng đầu danh sách các đơn đã thanh toán
    const isMyTurn = servingOrder 
      ? Number(servingOrder.id) === Number(order.id)
      : (firstPaidOrder && Number(firstPaidOrder.id) === Number(order.id));

    const handlePayment = async () => { 
      setIsPaying(true); 
      try {
        await orderService.payOrder(order.id);
      } catch (err) {
        showError('Thanh toán thất bại. Vui lòng thử lại!');
      } finally {
        setIsPaying(false);
      }
    };

    const handleDropCup = async () => {
      setIsDroppingCup(true);
      try {
        await machineService.dropCup(order.id);
        setHasDroppedCup(true);
      } catch (err) {
        showError('Không thể nhả ly. Vui lòng thử lại!');
      } finally {
        setIsDroppingCup(false);
      }
    };

    const handleDispense = async () => {
      try {
        await machineService.dispenseDrink(order.id);
        setStep(5);
      } catch (err) {
        showError('Không thể bắt đầu rót nước. Vui lòng thử lại!');
      }
    };

    return (
      <div className="space-y-6">
        <div className="text-center"><p className="text-gray-500 font-medium mb-1">Số thứ tự của bạn</p><h1 className="text-5xl font-black text-[#185FA5]">{order.queue_number}</h1></div>
        
        <div className="border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-sm text-gray-500">Đang phục vụ số</p>
          <p className="text-2xl font-bold text-gray-800 mb-3">{servingOrder ? servingOrder.queue_number : "---"}</p>
          {isMyTurn ? <span className="inline-block px-3 py-1 bg-[#1D9E75] text-white text-sm font-bold rounded-full animate-pulse">Đến lượt bạn!</span> : <span className="inline-block px-3 py-1 bg-yellow-100 text-yellow-700 text-sm font-bold rounded-full">Đang chờ... (Còn {Math.max(0, queueList.findIndex(q => q.id === order.id))} người)</span>}
        </div>

        {order.payment_status === "Unpaid" ? (
          <button disabled={isPaying} onClick={handlePayment} className="w-full py-4 bg-[#185FA5] text-white font-bold rounded-xl disabled:bg-gray-300"> 
            {isPaying ? "Đang xử lý..." : "Xác nhận thanh toán"} 
          </button>
        ) : (
          <div className="text-center text-green-600 font-bold mb-4">✓ Đã thanh toán thành công</div>
        )}

        {isMyTurn && order.payment_status === "Paid" && !hasDroppedCup && (
          <button disabled={isDroppingCup} onClick={handleDropCup} className="w-full py-4 bg-[#185FA5] text-white font-bold rounded-xl disabled:bg-gray-300 transition-colors shadow-lg shadow-blue-100 flex items-center justify-center gap-2">
            {isDroppingCup ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Đang nhả ly...
              </>
            ) : (
              "BƯỚC 1: LẤY LY NƯỚC"
            )}
          </button>
        )}

        {isMyTurn && order.payment_status === "Paid" && hasDroppedCup && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 text-center text-xs font-semibold animate-pulse">
              ✓ Đã nhả ly thành công! Vui lòng đặt ly vào khay hứng bên dưới
            </div>
            <button onClick={handleDispense} className="w-full py-4 bg-[#1D9E75] text-white font-bold rounded-xl animate-bounce shadow-lg shadow-green-100">
              BƯỚC 2: BẮT ĐẦU RÓT NƯỚC
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderStep5 = () => (
    <div className="space-y-8 py-8 flex flex-col items-center text-center">
      {!isDone ? (
        <>
          <div className="text-7xl mb-4 animate-bounce">🥤</div>
          <h2 className="text-xl font-bold text-gray-800">Hệ thống đang rót nước</h2>
          <p className="text-gray-500">Vui lòng không rút ly nước ra khỏi khay...</p>
          
          <div className="w-full mt-8">
            <div className="flex justify-between text-sm font-bold text-[#185FA5] mb-2">
              <span>{pourProgress > 0 ? "Đang rót nước..." : "Đang kết nối tới máy..."}</span>
              <span>{pourProgress}%</span>
            </div>
            <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden shadow-inner border border-gray-200">
              <div 
                className="h-full bg-[#185FA5] transition-all duration-300 rounded-full" 
                style={{ width: `${pourProgress}%` }}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center text-green-500 text-5xl mb-4 shadow-lg shadow-green-50 border border-green-200 animate-scale-up">✓</div>
          <h2 className="text-2xl font-bold text-gray-800">Hoàn tất!</h2>
          <p className="text-gray-500">Chúc bạn ngon miệng với ly {order.drink}!</p>
          <button 
            onClick={() => { 
              if (typeof window !== 'undefined') {
                localStorage.removeItem('current_order');
                localStorage.removeItem('order_step');
                localStorage.removeItem('has_dropped_cup');
              }
              setStep(1); 
              setOrder({ drink: "", size: "", ml: "", price: "", priceNum: 0, name: "", id: null, queue_number: "", payment_status: "Unpaid" }); 
              setPourProgress(0); 
              setIsDone(false); 
              setHasDroppedCup(false); 
              setIsCupPlacedRealtime(false); 
            }} 
            className="w-full mt-8 py-4 bg-[#185FA5] text-white font-bold rounded-xl hover:bg-[#13497e] transition-all shadow-lg shadow-blue-100"
          >
            Mua thêm ly khác
          </button>
        </>
      )}
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-xl overflow-hidden p-6 relative">
        {/* Error Toast */}
        {errorMsg && (
          <div className="absolute top-4 left-4 right-4 z-50 bg-red-500 text-white text-sm font-bold px-4 py-3 rounded-xl shadow-lg animate-slide-up-fade">
            ⚠️ {errorMsg}
          </div>
        )}
        <div className="flex justify-between items-center mb-8">
          <h1 className="font-black text-2xl text-gray-800 tracking-tight">SMART <span className="text-[#185FA5]">VENDING</span></h1>
          <button 
            onClick={handleResetSession}
            title="Đặt lại phiên bản"
            className="text-xs font-semibold text-gray-500 hover:text-red-500 hover:border-red-200 transition-all flex items-center gap-1 border border-gray-200 rounded-full px-2.5 py-1 bg-gray-50 active:scale-95 cursor-pointer"
          >
            🔄 Reset
          </button>
        </div>
        <ProgressBar currentStep={step} />
        <div className="mt-8">
          <div key={step} className="animate-slide-up-fade">
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
            {step === 5 && renderStep5()}
          </div>
        </div>
      </div>
    </main>
  );
}
