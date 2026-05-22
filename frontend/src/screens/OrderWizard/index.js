"use client";

import { useState, useEffect } from "react";
import { ProgressBar } from "../../components/ProgressBar";
import { Card } from "../../components/Card";
import { VirtualCup } from "../../components/VirtualCup";
import { AnalyticsPanel } from "../../components/AnalyticsPanel";
import { orderService, machineService, socket } from "../../services/api";
import { drinks, sizes } from "../../constants/data";

export default function OrderWizard() {
  const [step, setStep] = useState(1);
  const [order, setOrder] = useState({ 
    drink: "", 
    size: "", 
    ml: "", 
    price: "", 
    priceNum: 0, 
    name: "", 
    id: null, 
    queue_number: "", 
    payment_status: "Unpaid" 
  });

  const [queueList, setQueueList] = useState([]);
  const [isPaying, setIsPaying] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [pourProgress, setPourProgress] = useState(0);
  const [isPouring, setIsPouring] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [currentWaterLevel, setCurrentWaterLevel] = useState(0);

  const [hasDroppedCup, setHasDroppedCup] = useState(false);
  const [isDroppingCup, setIsDroppingCup] = useState(false);
  const [isCupPlacedRealtime, setIsCupPlacedRealtime] = useState(false);

  // Mức nước của từng bình nước ảo độc lập (Coca-Cola: id=1, Pepsi: id=2)
  const [cocaLevel, setCocaLevel] = useState(5000);
  const [pepsiLevel, setPepsiLevel] = useState(5000);
  const [countdown, setCountdown] = useState(10);

  // Hiển thị lỗi tạm thời (3 giây)
  const showError = (msg) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 4000);
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

  // Lấy lượng nước của 2 bình từ DB
  const fetchMachineStatus = async () => {
    try {
      const res = await machineService.getMachineStatus();
      if (res.success && Array.isArray(res.data)) {
        const coca = res.data.find(d => Number(d.id) === 1);
        const pepsi = res.data.find(d => Number(d.id) === 2);
        if (coca) setCocaLevel(coca.water_level);
        if (pepsi) setPepsiLevel(pepsi.water_level);
      }
    } catch (err) {
      console.error('Lỗi tải trạng thái bình nước chính:', err);
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

  // Trình lắng nghe sự kiện Socket.IO
  useEffect(() => {
    const handleQueueUpdate = () => {
      fetchQueue();
      fetchMachineStatus();
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
      if (data) {
        // Đồng bộ mức nước ảo trong bình chứa bất kể sự kiện thuộc về order nào
        if (Array.isArray(data.statuses)) {
          const coca = data.statuses.find(d => Number(d.id) === 1);
          const pepsi = data.statuses.find(d => Number(d.id) === 2);
          if (coca) setCocaLevel(coca.water_level);
          if (pepsi) setPepsiLevel(pepsi.water_level);
        }

        // Chỉ cập nhật tiến trình và trạng thái cốc nếu sự kiện realtime thuộc về chính đơn hàng này
        if (order.id && Number(data.order_id) === Number(order.id)) {
          if (typeof data.is_cup_placed !== 'undefined') {
            setIsCupPlacedRealtime(data.is_cup_placed);
          }
          if (typeof data.water_level !== 'undefined') {
            setCurrentWaterLevel(data.water_level);
          }
          if (typeof data.dispensing_progress !== 'undefined') {
            const prog = parseInt(data.dispensing_progress);
            setPourProgress(prog);
            setIsPouring(prog > 0 && prog < 100);
            if (prog >= 100) {
              setIsPouring(false);
              setIsDone(true);
            }
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

  // Kích hoạt cơ chế Polling dự phòng
  useEffect(() => {
    let intervalId = null;

    if (order.id && (step === 4 || step === 5)) {
      syncOrderState(order.id);
      fetchQueue();
      fetchMachineStatus();

      intervalId = setInterval(() => {
        syncOrderState(order.id);
        fetchQueue();
        fetchMachineStatus();
      }, 2000);
    } else {
      fetchQueue();
      fetchMachineStatus();
      intervalId = setInterval(() => {
        fetchQueue();
        fetchMachineStatus();
      }, 4000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [order.id, step]);

  // Bộ đếm ngược 10 giây cho phiên thao tác khi đến lượt
  useEffect(() => {
    let timerId = null;

    const servingOrder = queueList.find(q => q.status === 'Serving');
    const firstPaidOrder = queueList.find(q => q.payment_status === 'Paid');
    const isMyTurn = servingOrder 
      ? Number(servingOrder.id) === Number(order.id)
      : (firstPaidOrder && Number(firstPaidOrder.id) === Number(order.id));

    if (step === 4 && isMyTurn) {
      timerId = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timerId);
            // Tự động hủy phiên khi hết thời gian
            handleResetSession();
            showError("Hết thời gian chờ thao tác (10s)! Hệ thống đã tự động hủy lượt để nhường cho người tiếp theo.");
            return 10;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // Đặt lại đếm ngược về 10 khi không ở Step 4 hoặc không phải lượt của mình
      setCountdown(10);
    }

    return () => {
      if (timerId) {
        clearInterval(timerId);
      }
    };
  }, [step, queueList, order.id]);

  // Tạo Order
  const handlePlaceOrder = async () => {
    // Ngăn chặn nếu loại nước được chọn bị hết nước (< 330ml)
    const isCoca = order.drink.includes("Coca");
    const chosenWaterLevel = isCoca ? cocaLevel : pepsiLevel;
    if (chosenWaterLevel < 330) {
      showError(`Thức uống ${order.drink} đã hết nước trong bình máy. Vui lòng chọn loại nước giải khát khác!`);
      return;
    }

    try {
      const res = await orderService.createOrder({
        username: order.name,
        drink_name: order.drink,
        size: order.size
      });
      if (res.success) {
        const newOrder = { 
          ...order, 
          id: res.data.id, 
          queue_number: res.data.queue_number, 
          payment_status: res.data.payment_status 
        };
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

  // Quản lý lưu trữ trạng thái bền vững qua localStorage để chống lỗi reload trang
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
      fetchMachineStatus();

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

  // Đặt lại phiên mua hàng
  const handleResetSession = async () => {
    // Nếu có đơn hàng đang bị kẹt và chưa hoàn tất, chủ động gửi lệnh giải phóng máy về Backend
    if (order.id && !isDone) {
      try {
        await machineService.completeOrder(order.id, 'Failed');
        console.log("Đã chủ động gửi lệnh giải phóng máy bán nước khỏi đơn hàng cũ.");
      } catch (err) {
        console.error("Lỗi khi gửi lệnh giải phóng máy bán nước:", err);
      }
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem('current_order');
      localStorage.removeItem('order_step');
      localStorage.removeItem('has_dropped_cup');
    }
    setStep(1);
    setOrder({ drink: "", size: "", ml: "", price: "", priceNum: 0, name: "", id: null, queue_number: "", payment_status: "Unpaid" });
    setPourProgress(0);
    setCurrentWaterLevel(0);
    setIsDone(false);
    setHasDroppedCup(false);
    setIsCupPlacedRealtime(false);
  };

  // GIAO DIỆN STEP 1: CHỌN NƯỚC UỐNG
  const renderStep1 = () => (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-lg font-bold text-gray-800">Chọn Thức Uống Của Bạn</h2>
        <p className="text-xs text-gray-500 mt-1">100% hương vị tươi ngon sảng khoái</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {drinks.map(d => {
          const isCoca = d.id.includes("Coca");
          const isOutOfWater = isCoca ? (cocaLevel < 330) : (pepsiLevel < 330);

          return (
            <Card 
              key={d.id} 
              selected={order.drink === d.id} 
              badge={isOutOfWater ? "Hết Nước" : d.badge}
              onClick={() => { 
                if (isOutOfWater) {
                  showError(`Thức uống ${d.name} hiện tại ĐÃ HẾT NƯỚC. Vui lòng chọn loại nước giải khát khác!`);
                  return;
                }
                setOrder({ ...order, drink: d.id, name: d.name }); 
                setTimeout(() => setStep(2), 250); 
              }}
            >
              <div className={`text-center py-4 flex flex-col items-center group relative transition-all duration-300 ${
                isOutOfWater ? "filter grayscale brightness-50 opacity-70" : ""
              }`}>
                {/* Bình lon nước 3D giả lập bằng CSS */}
                <div 
                  className={`w-12 h-20 rounded-xl relative mb-3 transition-all duration-300 shadow-md group-hover:scale-105 group-hover:rotate-3 ${
                    isCoca 
                      ? "bg-gradient-to-r from-red-600 to-red-500 border-red-700" 
                      : "bg-gradient-to-r from-blue-700 to-blue-500 border-blue-800"
                  }`}
                  style={{ borderWidth: "2px 1px" }}
                >
                  <div className="absolute -top-1 left-1.5 right-1.5 h-1.5 bg-slate-300 rounded-t-md border-b border-slate-400"></div>
                  <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                    <span className="text-[11px] font-black text-white/95 uppercase tracking-widest rotate-90 select-none">
                      {isCoca ? "COCA" : "PEPSI"}
                    </span>
                  </div>
                  <div className="absolute -bottom-1 left-1.5 right-1.5 h-1 bg-slate-300 rounded-b-md"></div>
                </div>
                <h3 className="font-extrabold text-sm text-gray-800 tracking-tight">{d.name}</h3>
                <p className="text-[10px] text-gray-500 mt-1">{d.desc}</p>

                {/* Nhãn HẾT NƯỚC phủ lên trên nếu hết nước */}
                {isOutOfWater && (
                  <div className="absolute inset-0 flex items-center justify-center bg-transparent">
                    <span className="bg-red-600 text-white font-extrabold text-[10px] px-3 py-1 rounded-full uppercase tracking-wider rotate-12 shadow-md">
                      HẾT NƯỚC
                    </span>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );

  // GIAO DIỆN STEP 2: CHỌN SIZE LY
  const renderStep2 = () => (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-lg font-bold text-gray-800">Chọn Kích Cỡ Ly Nước</h2>
        <p className="text-xs text-gray-500 mt-1">Dung tích nước tăng dần theo kích cỡ</p>
      </div>
      <div className="flex flex-col gap-3">
        {sizes.map(s => {
          const heightClass = s.id === "S" ? "h-8 w-6" : s.id === "M" ? "h-10 w-7" : "h-12 w-8";
          return (
            <Card 
              key={s.id} 
              selected={order.size === s.id} 
              onClick={() => { 
                setOrder({ ...order, size: s.id, ml: s.ml, price: s.price, priceNum: s.priceNum }); 
                setTimeout(() => setStep(3), 250); 
              }}
            >
              <div className="flex justify-between items-center px-2 py-1 w-full">
                <div className="flex items-center gap-3.5">
                  <div className="flex items-end justify-center w-10">
                    <div className={`border-2 border-[#185FA5] rounded-b-md rounded-t-sm bg-blue-50/50 flex flex-col justify-end overflow-hidden ${heightClass}`}>
                      <div className="w-full h-1/2 bg-blue-400/30"></div>
                    </div>
                  </div>
                  <div className="text-left">
                    <h3 className="font-extrabold text-sm text-gray-800">{s.name}</h3>
                    <p className="text-xs font-semibold text-gray-400">{s.ml}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-black text-xs text-[#1d9e75] bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1">
                    MIỄN PHÍ
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <button 
        onClick={() => setStep(1)} 
        className="w-full mt-4 py-3 text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center gap-1.5"
      >
        <span>←</span> Quay lại chọn nước
      </button>
    </div>
  );

  // GIAO DIỆN STEP 3: NHẬP TÊN VÀ XÁC NHẬN ĐƠN HÀNG
  const renderStep3 = () => (
    <div className="space-y-5">
      <div className="text-center mb-4">
        <h2 className="text-lg font-bold text-gray-800">Thông Tin Khách Hàng</h2>
        <p className="text-xs text-gray-500 mt-1">Vui lòng cung cấp tên để in lên vé xếp hàng</p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-gray-600">TÊN CỦA BẠN</label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">👤</span>
          <input 
            type="text" 
            maxLength={18} 
            value={order.name} 
            onChange={e => setOrder({ ...order, name: e.target.value })} 
            placeholder="VD: Tuấn Anh, Lan Vy..." 
            className="w-full pl-9 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-[#185FA5] focus:ring-2 focus:ring-blue-100/50 text-sm font-semibold transition-all"
          />
        </div>
      </div>

      <div className="border border-slate-100 bg-[#F8FAFC]/90 rounded-2xl p-4 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/30 rounded-full blur-xl pointer-events-none"></div>
        <h3 className="font-extrabold text-xs text-slate-800 mb-3 uppercase tracking-wider border-b border-slate-200 pb-1.5">
          Tóm Tắt Đơn Hàng
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-gray-500">Nước giải khát:</span>
            <span className="text-slate-800 flex items-center gap-1 font-bold">
              {order.drink}
            </span>
          </div>
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-gray-500">Kích cỡ ly:</span>
            <span className="text-slate-800">{order.size} ({order.ml})</span>
          </div>
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-gray-500">Mức nước bình máy:</span>
            <span className="text-emerald-600">Sẵn sàng rót</span>
          </div>
          <div className="flex justify-between text-sm mt-3 pt-2.5 border-t border-dashed border-slate-200">
            <span className="font-extrabold text-slate-800">CHI PHÍ:</span>
            <span className="font-black text-sm text-[#1d9e75] bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-100">MIỄN PHÍ</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 pt-2">
        <button 
          disabled={!order.name.trim()} 
          onClick={handlePlaceOrder} 
          className="w-full py-3.5 bg-gradient-to-r from-[#185FA5] to-[#2572bd] text-white font-extrabold text-sm rounded-xl disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none hover:shadow-lg hover:shadow-blue-100 transition-all active:scale-[0.98] cursor-pointer"
        >
          Xác Nhận Đặt Nước & In Vé
        </button>
        <button 
          onClick={() => setStep(2)} 
          className="w-full py-2.5 text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors"
        >
          Quay lại chọn size
        </button>
      </div>
    </div>
  );

  // GIAO DIỆN STEP 4: VÉ XẾP HÀNG TÍNH TOÁN RĂNG CƯA ĐỘC ĐÁO
  const renderStep4 = () => {
    const servingOrder = queueList.find(q => q.status === 'Serving');
    const firstPaidOrder = queueList.find(q => q.payment_status === 'Paid');
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
        setCountdown(10); // Khôi phục đếm ngược về 10 giây để người dùng đặt ly
      } catch (err) {
        showError('Không thể nhả ly nước. Vui lòng thử lại!');
      } finally {
        setIsDroppingCup(false);
      }
    };

    const handleDispense = async () => {
      try {
        await machineService.dispenseDrink(order.id);
        setStep(5);
      } catch (err) {
        showError('Không thể bắt đầu rót nước. Vui lòng kiểm tra kết nối thiết bị!');
      }
    };

    const position = queueList.findIndex(q => q.id === order.id);
    const peopleAhead = position > 0 ? position : 0;

    return (
      <div className="space-y-6">
        <div className="text-center">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Số Thứ Tự Của Bạn</p>
          
          {/* TẤM VÉ XẾP HÀNG RĂNG CƯA ĐẶC BIỆT */}
          <div className="ticket-container w-full max-w-sm mx-auto p-6 my-4 rounded-xl relative text-left">
            <div className="ticket-cut-left"></div>
            <div className="ticket-cut-right"></div>
            
            <div className="flex justify-between items-start border-b border-gray-100 pb-3 mb-4">
              <div>
                <h4 className="text-xs font-bold text-[#185FA5] uppercase tracking-wider">FREE DISPENSER TICKET</h4>
                <p className="text-[10px] text-gray-400 font-medium">Bản in kỹ thuật số</p>
              </div>
              <span className="text-2xl">🎟️</span>
            </div>

            <div className="space-y-3.5">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-[9px] text-gray-400 block font-bold uppercase">Số Thứ Tự</span>
                  <span className="text-3xl font-black text-[#185FA5] tracking-tight">#{order.queue_number}</span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-gray-400 block font-bold uppercase">Trạng Thái Vé</span>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    ✓ Đã Kích Hoạt
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-dashed border-gray-200 pt-3">
                <div>
                  <span className="text-[9px] text-gray-400 block font-bold uppercase">Khách Hàng</span>
                  <span className="text-xs font-bold text-slate-800">{order.name}</span>
                </div>
                <div>
                  <span className="text-[9px] text-gray-400 block font-bold uppercase">Sản Phẩm</span>
                  <span className="text-xs font-bold text-slate-800">{order.drink} ({order.size})</span>
                </div>
              </div>
            </div>

            <div className="border-t border-dashed border-slate-200 mt-5 pt-4">
              <div className="flex justify-center items-center gap-[2.5px] h-10 w-full overflow-hidden bg-white py-1">
                {[1, 3, 1, 2, 4, 1, 2, 1, 3, 2, 1, 4, 2, 1, 1, 3, 2, 1, 4, 1, 2, 1, 3, 1].map((w, idx) => (
                  <div key={idx} className="bg-slate-700 h-full" style={{ width: `${w}px` }}></div>
                ))}
              </div>
              <div className="text-[8px] text-gray-400 font-mono tracking-widest text-center mt-1 select-none">
                *SMART-VEND-{order.queue_number || "00"}-{order.id || "0"}*
              </div>
            </div>
          </div>
        </div>

        {/* Trạng thái xếp hàng real-time */}
        <div className="glass-panel border border-slate-100 rounded-2xl p-4 text-center">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Tình Trạng Hàng Chờ Máy</p>
          <div className="mt-1.5 flex justify-center items-baseline gap-2">
            <span className="text-xs font-medium text-gray-500">Đang rót cho số:</span>
            <span className="text-lg font-black text-slate-800">{servingOrder ? `#${servingOrder.queue_number}` : "Không có"}</span>
          </div>
          
          <div className="mt-3">
            {isMyTurn ? (
              <div className="space-y-2">
                <span className="inline-block px-3 py-1 bg-emerald-500 text-white text-xs font-extrabold rounded-full animate-bounce shadow-md shadow-emerald-100">
                  ⚡ ĐÃ ĐẾN LƯỢT PHỤC VỤ CỦA BẠN!
                </span>
                <div className="text-xs font-bold text-red-600 animate-pulse bg-red-50 border border-red-100 rounded-lg p-2.5 mt-2.5 flex items-center justify-center gap-1.5 shadow-sm">
                  ⏱️ Tự động hủy lượt sau: <span className="text-sm font-black underline">{countdown}s</span>
                </div>
              </div>
            ) : (
              <span className="inline-block px-3 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-full border border-amber-100">
                ⏳ Đang chờ máy rảnh... (Còn {peopleAhead} người phía trước)
              </span>
            )}
          </div>
        </div>

          <div className="space-y-3">
            {isMyTurn && (
              <>
                {!hasDroppedCup ? (
                  <button 
                    disabled={isDroppingCup} 
                    onClick={handleDropCup} 
                    className="w-full py-4 bg-[#185FA5] text-white font-black text-sm rounded-xl shadow-lg shadow-blue-100 flex items-center justify-center gap-2.5 active:scale-[0.98] cursor-pointer"
                  >
                    {isDroppingCup ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Đang nhả ly từ ngăn chứa...
                      </>
                    ) : (
                      "👇 BƯỚC 1: NHẤN ĐỂ NHẢ LY NƯỚC"
                    )}
                  </button>
                ) : (
                  <div className="space-y-3.5">
                    {isCupPlacedRealtime ? (
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-3 text-center text-xs font-bold flex items-center justify-center gap-1.5 animate-pulse shadow-sm">
                        <span>✓</span> Cảm biến phát hiện ly nước đúng chỗ! Sẵn sàng rót.
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl p-3 text-center text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm">
                        <span className="animate-ping w-2 h-2 rounded-full bg-amber-500 mr-1"></span>
                        Vui lòng đặt ly nước của bạn vào khay rót...
                      </div>
                    )}

                    <button 
                      onClick={handleDispense} 
                      className={`w-full py-4 text-white font-black text-sm rounded-xl transition-all shadow-lg active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 ${
                        isCupPlacedRealtime 
                          ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-100 animate-bounce" 
                          : "bg-slate-400 hover:bg-slate-500 shadow-slate-100"
                      }`}
                    >
                      🥤 BẮT ĐẦU RÓT NƯỚC GIẢI KHÁT
                    </button>
                  </div>
                )}
              </>
            )}

            {!isMyTurn && (
              <div className="text-center text-xs font-bold text-gray-400 py-2">
                Hệ thống đang phục vụ các đơn đặt trước. Vui lòng chờ đến lượt.
              </div>
            )}
          </div>
      </div>
    );
  };

  // GIAO DIỆN STEP 5: QUY TRÌNH RÓT NƯỚC & HOÀN THÀNH
  const renderStep5 = () => {
    return (
      <div className="space-y-6 py-4 flex flex-col items-center text-center">
        {!isDone ? (
          <div className="w-full space-y-4">
            <h2 className="text-lg font-bold text-gray-800">Đang Rót Nước Giải Khát</h2>
            <p className="text-xs text-gray-500">Bơm đang hoạt động. Vui lòng không rút ly nước khỏi máy...</p>
            
            <div className="my-2 bg-[#F8FAFC] border border-slate-100 p-6 rounded-3xl shadow-inner w-full flex justify-center">
              <VirtualCup 
                progress={pourProgress} 
                isPouring={isPouring} 
                drinkType={order.drink} 
              />
            </div>

            <div className="w-full px-2">
              <div className="flex justify-between text-xs font-extrabold text-[#185FA5] mb-2.5">
                <span>
                  {pourProgress > 0 || isPouring
                    ? `Đang rót nước... ${currentWaterLevel > 0 ? `(Cảm biến: ${Number(currentWaterLevel).toFixed(1)} cm)` : ""}` 
                    : `Đang gửi lệnh tới máy... ${currentWaterLevel > 0 ? `(Cảm biến: ${Number(currentWaterLevel).toFixed(1)} cm)` : ""}`}
                </span>
                <span>{pourProgress}%</span>
              </div>
              <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200/80">
                <div 
                  className="h-full bg-gradient-to-r from-[#185FA5] to-[#429af1] transition-all duration-300 rounded-full" 
                  style={{ width: `${pourProgress}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center space-y-5 animate-scale-up">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 text-4xl mb-2 shadow-lg shadow-emerald-50 border border-emerald-100">
              ✓
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-gray-800">Hoàn Tất Quy Trình!</h2>
              <p className="text-xs text-gray-500 mt-1">Cảm ơn {order.name}! Hãy thưởng thức ly {order.drink} mát lạnh.</p>
            </div>

            <div className="my-4 bg-emerald-50/30 border border-emerald-100 rounded-2xl p-4 w-full text-xs font-semibold text-gray-600">
              <div className="flex justify-between py-1 border-b border-emerald-100/50">
                <span>Sản phẩm:</span>
                <span className="font-bold text-slate-800">{order.drink} ({order.size})</span>
              </div>
              <div className="flex justify-between py-1 border-b border-emerald-100/50">
                <span>Dung tích thực tế:</span>
                <span className="font-bold text-slate-800">{order.ml}</span>
              </div>
              {currentWaterLevel > 0 && (
                <div className="flex justify-between py-1 border-b border-emerald-100/50">
                  <span>Khoảng cách cảm biến:</span>
                  <span className="font-bold text-slate-800">{Number(currentWaterLevel).toFixed(1)} cm</span>
                </div>
              )}
              <div className="flex justify-between py-1">
                <span>Trạng thái:</span>
                <span className="font-bold text-emerald-600">Thành công</span>
              </div>
            </div>

            <button 
              onClick={handleResetSession} 
              className="w-full py-4 bg-[#185FA5] text-white font-extrabold text-sm rounded-xl hover:bg-[#13497e] transition-all shadow-md shadow-blue-100 active:scale-[0.98] cursor-pointer"
            >
              🔄 Tiếp Tục Mua Thêm Ly Khác
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      {/* TIÊU ĐỀ HỆ THỐNG GIAO DIỆN KHÁCH HÀNG */}
      <div className="w-full max-w-md mb-5 flex justify-center items-center">
        <h1 className="font-black text-2xl text-slate-800 tracking-tight flex items-center gap-1.5">
          <span className="text-2xl">🥤</span>
          <span>FREE <span className="text-[#185FA5]">DISPENSER</span> SYSTEM</span>
        </h1>
      </div>

      {/* KHUNG PANEL GIAO DIỆN CHÍNH MÀU SÁNG SANG TRỌNG */}
      <div className="glass-panel w-full max-w-md rounded-3xl overflow-hidden p-6 relative">
        {/* Lỗi Toast */}
        {errorMsg && (
          <div className="absolute top-4 left-4 right-4 z-50 bg-red-500 text-white text-xs font-bold px-4 py-3.5 rounded-xl shadow-lg flex items-center gap-2 animate-slide-up-fade">
            <span>⚠️</span> {errorMsg}
          </div>
        )}

        <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-3">
          <span className="text-xs font-extrabold text-[#185FA5] uppercase tracking-wider">
            Dispenser Screen - Bước {step}/5
          </span>
          <button 
            onClick={handleResetSession}
            title="Đặt lại phiên bản"
            className="text-[10px] font-extrabold text-gray-500 hover:text-red-500 hover:border-red-200 transition-all flex items-center gap-1 border border-gray-200 rounded-full px-3 py-1 bg-gray-50 active:scale-95 cursor-pointer"
          >
            🔄 Reset App
          </button>
        </div>

        <ProgressBar currentStep={step} />

        <div className="mt-6">
          <div key={step} className="animate-slide-up-fade">
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
            {step === 5 && renderStep5()}
          </div>
        </div>
      </div>

      {/* DASHBOARD PHÂN KHU THỐNG KÊ (DÀNH CHO ĐỒ ÁN SINH VIÊN TÍCH HỢP) */}
      <div className="w-full mt-4">
        <AnalyticsPanel />
      </div>
    </main>
  );
}
