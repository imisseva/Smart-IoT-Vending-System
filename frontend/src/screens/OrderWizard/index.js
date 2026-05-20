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

  // Hiển thị lỗi tạm thời (3 giây)
  const showError = (msg) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 3000);
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
    // Lắng nghe sự kiện từ Backend
    socket.on('queue_updated', fetchQueue);
    socket.on('payment_success', (updatedOrder) => {
      if (updatedOrder.id === order.id) {
        setOrder(prev => ({ ...prev, payment_status: 'Paid' }));
      }
    });

    return () => {
      socket.off('queue_updated');
      socket.off('payment_success');
    };
  }, [order.id]);

  // Tạo Order
  const handlePlaceOrder = async () => {
    try {
      const res = await orderService.createOrder({
        username: order.name,
        drink_name: order.drink,
        size: order.size
      });
      if (res.success) {
        setOrder(prev => ({ ...prev, id: res.data.id, queue_number: res.data.queue_number, payment_status: res.data.payment_status }));
        fetchQueue();
        setStep(4);
      }
    } catch (err) {
      showError('Không thể tạo đơn hàng. Vui lòng thử lại!');
    }
  };

  // Logic: Pouring Simulation
  useEffect(() => {
    if (isPouring && pourProgress < 100) {
      const timer = setTimeout(() => setPourProgress(prev => prev + 10), 300);
      return () => clearTimeout(timer);
    } else if (pourProgress >= 100 && isPouring) {
      setIsPouring(false);
      setIsDone(true);
      (async () => {
        try {
          await machineService.completeOrder(order.id);
        } catch (err) {
          console.error('Lỗi hoàn tất order:', err);
        }
      })();
    }
  }, [isPouring, pourProgress]);

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
    // Xác định người đang được phục vụ
    const servingOrder = queueList.find(q => q.status === 'Serving');
    
    // Xác định xem có phải lượt của mình không (Đứng đầu mảng queueList và chưa ai Serving)
    const isMyTurn = queueList.length > 0 && queueList[0].id === order.id;

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

        {isMyTurn && order.payment_status === "Paid" && (
          <button onClick={handleDispense} className="w-full py-4 bg-[#1D9E75] text-white font-bold rounded-xl animate-bounce">
            BẮT ĐẦU RÓT NƯỚC
          </button>
        )}
      </div>
    );
  };

  const renderStep5 = () => (
    <div className="space-y-8 py-8 flex flex-col items-center text-center">
      {!isDone ? (
        <>
          <div className="text-7xl mb-4">🥤</div><h2 className="text-xl font-bold text-gray-800">Hệ thống đang rót nước</h2><p className="text-gray-500">Vui lòng chờ giây lát...</p>
          {!isPouring ? (
             <button onClick={() => setIsPouring(true)} className="w-full mt-8 py-4 bg-[#185FA5] text-white font-bold rounded-xl">Xác nhận đã đặt ly</button>
          ) : (
            <div className="w-full mt-8"><div className="flex justify-between text-sm font-bold text-[#185FA5] mb-2"><span>Đang rót...</span><span>{pourProgress}%</span></div><div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-[#185FA5] transition-all duration-300" style={{ width: `${pourProgress}%` }}/></div></div>
          )}
        </>
      ) : (
        <>
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center text-green-500 text-5xl mb-4">✓</div><h2 className="text-2xl font-bold text-gray-800">Hoàn tất!</h2><p className="text-gray-500">Chúc bạn ngon miệng với ly {order.drink}!</p>
          <button onClick={() => { setStep(1); setOrder({ drink: "", size: "", ml: "", price: "", priceNum: 0, name: "", id: null, queue_number: "", payment_status: "Unpaid" }); setPourProgress(0); setIsDone(false); }} className="w-full mt-8 py-4 bg-[#185FA5] text-white font-bold rounded-xl">Mua thêm ly khác</button>
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
        <h1 className="text-center font-black text-2xl text-gray-800 tracking-tight mb-8">SMART <span className="text-[#185FA5]">VENDING</span></h1>
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
