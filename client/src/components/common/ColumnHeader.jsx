import { MoreHorizontal, ArrowLeft, ArrowRight, Trash2, Plus } from 'lucide-react'

export default function ColumnHeader({ index, isLast, onAddRight, onMoveLeft, onMoveRight, onDelete, isMenuOpen, onToggleMenu }) {
  const handleAction = (action) => {
    onToggleMenu(false)
    action()
  }

  return (
    <div className="w-72 shrink-0 px-2 border-l border-gray-100 relative group z-0">
      {/* Hoverable Block with Menu Icon */}
      <div 
        className="h-6 flex items-center justify-center rounded hover:bg-gray-100 cursor-pointer transition-colors"
        onClick={() => onToggleMenu(!isMenuOpen)}
      >
        <MoreHorizontal size={16} className="text-gray-400 group-hover:text-gray-600 hide-on-export" />
      </div>

      {/* Dropdown Menu */}
      {isMenuOpen && (
        <>
          <div className="fixed inset-0 z-40 cursor-pointer" onClick={() => onToggleMenu(false)}></div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-100 z-[100] overflow-hidden py-1">
            <button 
              onClick={() => handleAction(onAddRight)}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <Plus size={14} /> Add column right
            </button>
            <button 
              onClick={() => index > 0 && handleAction(onMoveLeft)}
              disabled={index === 0}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${index === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              <ArrowLeft size={14} /> Move left
            </button>
            <button 
              onClick={() => !isLast && handleAction(onMoveRight)}
              disabled={isLast}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${isLast ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              <ArrowRight size={14} /> Move right
            </button>
            <div className="h-px bg-gray-100 my-1"></div>
            <button 
              onClick={() => handleAction(onDelete)}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <Trash2 size={14} /> Delete column
            </button>
          </div>
        </>
      )}
    </div>
  )
}
