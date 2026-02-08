import { useState, useRef } from 'react'
import { GripVertical, MoreHorizontal, Trash2, Copy, Palette, Pin, PinOff } from 'lucide-react'

export default function EmotionLane({ lane, gridColumns, laneData, onUpdatePoint, dragHandleProps, onDelete, onDuplicate, onUpdate, isMenuOpen, onToggleMenu, onTogglePin }) {
  const svgRef = useRef(null)
  const [draggingId, setDraggingId] = useState(null)

  const STAGE_WIDTH = 288 
  const START_OFFSET = STAGE_WIDTH / 2
  const LANE_HEIGHT = 160

  const getY = (val) => (-0.2 * val + 0.5) * LANE_HEIGHT
  const getIcon = (val) => {
    if (val >= 1) return '😄'
    if (val <= -1) return '☹️'
    return '😐'
  }

  const points = gridColumns.map((col, i) => {
    const val = laneData[col.id] ?? 0;
    return { x: (i * STAGE_WIDTH) + START_OFFSET, y: getY(val), val, id: col.id, colIndex: i }
  });

  let d = ""
  if (points.length > 0) {
    d = `M ${points[0].x} ${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      const prev = points[i-1]
      const curr = points[i]
      const cp1x = prev.x + (curr.x - prev.x) / 2
      const cp1y = prev.y
      const cp2x = prev.x + (curr.x - prev.x) / 2
      const cp2y = curr.y
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`
    }
  }

  const handleMouseMove = (e) => {
    if (!draggingId) return
    const rect = svgRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top
    let newVal = (0.5 - (y / LANE_HEIGHT)) / 0.2
    newVal = Math.max(-2, Math.min(2, Math.round(newVal)))
    if (laneData[draggingId] !== newVal) onUpdatePoint(lane.id, draggingId, newVal)
  }

  const bgColor = lane.color || 'bg-gray-50';

  return (
    <div 
      className={`flex min-h-[160px] ${bgColor} border-b border-gray-200 relative select-none transition-colors`}
      onMouseMove={handleMouseMove}
      onMouseUp={() => setDraggingId(null)}
      onMouseLeave={() => setDraggingId(null)}
    >
      <div className={`w-64 shrink-0 sticky left-0 z-20 ${bgColor} border-r border-gray-200 px-4 py-3 flex flex-row items-start justify-between group/header`}>
        <div className="flex items-center gap-3 flex-1 min-w-0 mr-2">
          {!lane.isPinned && (
            <div {...dragHandleProps} className="cursor-grab hover:bg-gray-200/50 p-1 rounded text-gray-300 hover:text-gray-600 shrink-0 hide-on-export"><GripVertical size={16} /></div>
          )}
          {lane.isPinned && <Pin size={14} className="text-orange-500 shrink-0 transform rotate-45" />}
          <input 
             className="font-bold text-gray-700 text-sm bg-transparent outline-none border-b border-transparent focus:border-orange-500 w-full truncate"
             value={lane.title}
             onChange={(e) => onUpdate({ title: e.target.value })}
          />
        </div>

        <div className="relative shrink-0">
          <button 
            onClick={() => onToggleMenu(!isMenuOpen)}
            className={`text-gray-400 hover:text-gray-600 transition p-1 rounded hover:bg-gray-200 hide-on-export ${isMenuOpen ? 'opacity-100 bg-gray-200' : 'opacity-0 group-hover/header:opacity-100'}`}
          >
            <MoreHorizontal size={16} />
          </button>

           {isMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => onToggleMenu(false)}></div>
              <div className="absolute top-full right-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-100 z-40 overflow-hidden py-1">
                 <button onClick={() => { onTogglePin(); onToggleMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                   {lane.isPinned ? <PinOff size={14} /> : <Pin size={14} />} 
                   {lane.isPinned ? 'Unpin lane' : 'Pin lane'}
                 </button>
                 <button onClick={() => { onDuplicate(); onToggleMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                   <Copy size={14} /> Duplicate lane
                 </button>
                 <div className="px-4 py-2">
                   <div className="text-xs text-gray-400 font-bold uppercase mb-2 flex items-center gap-2"><Palette size={10} /> Color</div>
                   <div className="flex gap-2">
                      {['bg-white', 'bg-gray-50', 'bg-blue-50', 'bg-red-50', 'bg-yellow-50'].map(c => (
                        <button 
                          key={c} 
                          className={`w-5 h-5 rounded-full border border-gray-200 ${c} ${lane.color === c ? 'ring-2 ring-gray-400' : ''}`}
                          onClick={() => { onUpdate({ color: c }); }}
                        ></button>
                      ))}
                   </div>
                 </div>
                 <div className="h-px bg-gray-100 my-1"></div>
                 <button onClick={() => { onDelete(); onToggleMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                   <Trash2 size={14} /> Delete lane
                 </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex relative items-center">
        {gridColumns.map((col) => ( <div key={col.id} className="w-72 shrink-0 border-r border-gray-200/50 h-full"></div> ))}
        <svg ref={svgRef} className="absolute inset-0 w-full h-full overflow-visible z-10 pointer-events-none">
           {[0, 1, 2, 3, 4].map(i => ( <line key={i} x1="0" y1={i * 32 + 16} x2="100%" y2={i * 32 + 16} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 4" /> ))}
           <path d={d} fill="none" stroke="#f97316" strokeWidth="3" />
           {points.map(p => (
             <g key={p.id} transform={`translate(${p.x}, ${p.y})`} className="pointer-events-auto cursor-grab" onMouseDown={() => setDraggingId(p.id)}>
               <circle r="16" fill="white" stroke="#f97316" strokeWidth="2" className="shadow-sm hover:scale-110 transition-transform" />
               <text textAnchor="middle" dy="5" fontSize="14" style={{ userSelect: 'none' }}>{getIcon(p.val)}</text>
             </g>
           ))}
        </svg>
      </div>
    </div>
  )
}