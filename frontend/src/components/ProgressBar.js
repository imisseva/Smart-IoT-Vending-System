export const ProgressBar = ({ currentStep }) => {
  const steps = ["Chọn nước", "Chọn Size", "Thông tin", "Thanh toán", "Rót nước"];
  
  return (
    <div className="w-full mb-8">
      <div className="flex justify-between relative">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 -z-10 -translate-y-1/2 rounded"></div>
        {steps.map((label, index) => {
          const stepNum = index + 1;
          const isActive = stepNum <= currentStep;
          return (
            <div key={index} className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors duration-300 ${isActive ? "bg-[#185FA5] text-white" : "bg-gray-200 text-gray-500"}`}>
                {stepNum}
              </div>
              <span className={`text-xs mt-2 font-medium ${isActive ? "text-[#185FA5]" : "text-gray-400"}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
