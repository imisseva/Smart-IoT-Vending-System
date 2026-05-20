export const Card = ({ children, selected, onClick, badge }) => (
  <div 
    onClick={onClick}
    className={`relative p-4 rounded-2xl cursor-pointer border-2 transition-all duration-300 ${
      selected ? "border-[#185FA5] bg-blue-50 shadow-md" : "border-gray-200 hover:border-blue-300 bg-white"
    }`}
  >
    {badge && (
      <span className="absolute -top-3 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
        {badge}
      </span>
    )}
    {children}
  </div>
);
