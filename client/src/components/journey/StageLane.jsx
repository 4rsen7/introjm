import { useState } from 'react'
import { GripVertical, MoreHorizontal, Plus } from 'lucide-react'

const COL_WIDTH = 288 // 18rem

export default function StageLane({ lane, laneStages = [], onAddStage, onUpdateStage, onResizeStage, dragHandleProps, gridColumns, onUpdate }) {
  
  const handleResizeMouseDown = (e, stage) => {
    e.stopPropagation()
    const startX = e.clientX
    const startSpan = stage.span

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaCols = Math.round(deltaX / COL_WIDTH)
      const newSpan = Math.max(1, startSpan + deltaCols)
      
      if (newSpan !== stage.span) {
        onResizeStage(lane.id, stage.id, newSpan)
      }
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div className="flex min-h-[80px] bg-white border-b border-gray-200 isolate">
      
      {/* Sticky Header */}
      <div className="w-64 shrink-0 sticky left-0 z-50 bg-gray-50 border-r border-gray-200 px-4 py-3 flex flex-row items-start justify-between group/header">
        <div className="flex items-center gap-3 flex-1 min-w-0 mr-2">
            <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-600 p-1 -ml-1 rounded hover:bg-gray-200/50 transition-colors touch-none shrink-0">
              <GripVertical size={16} />
            </div>
            <input 
              className="font-bold text-gray-700 text-sm bg-transparent outline-none border-b border-transparent focus:border-orange-500 w-full truncate"
              value={lane.title}
              onChange={(e) => onUpdate && onUpdate({ title: e.target.value })}
            />
        </div>
        
        <div className="relative shrink-0">
          <button className="text-gray-400 hover:text-gray-600 opacity-0 group-hover/header:opacity-100 transition">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      <div className="flex relative items-center z-0">
        {gridColumns.map((col) => (
          <div key={col.id} className="w-72 shrink-0 border-r border-gray-100 h-full min-h-[80px]"></div>
        ))}

        <div className="absolute inset-0 flex items-center pl-1">
          {laneStages.map((stage, index) => {
            const isFirst = index === 0;
            const clipPath = isFirst 
              ? 'polygon(0% 0%, calc(100% - 20px) 0%, 100% 50%, calc(100% - 20px) 100%, 0% 100%)'
              : 'polygon(0% 0%, calc(100% - 20px) 0%, 100% 50%, calc(100% - 20px) 100%, 0% 100%, 20px 50%)';

            return (
              <div 
                key={stage.id}
                className={`h-12 flex items-center justify-between pr-6 pl-8 relative group shrink-0 ${isFirst ? 'ml-0' : '-ml-5'}`}
                style={{ 
                  width: `${stage.span * 18}rem`,
                  // zIndex стрілок залишається локальним для цього контейнера
                  zIndex: laneStages.length - index,
                  filter: 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.05))'
                }}
              >
                 <div 
                   className={`absolute inset-0 ${stage.color} transition-colors`}
                   style={{ clipPath: clipPath }}
                 ></div>
                 
                 <input 
                   className={`relative z-10 bg-transparent font-bold text-gray-800 outline-none w-full truncate ${!isFirst && 'pl-4'}`}
                   value={stage.title}
                   onChange={(e) => onUpdateStage(lane.id, stage.id, e.target.value)}
                 />

                 <div 
                    className="absolute right-0 top-0 bottom-0 w-6 cursor-col-resize hover:bg-black/5 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    onMouseDown={(e) => handleResizeMouseDown(e, stage)}
                    title="Drag to resize"
                 >
                    <div className="w-1 h-4 bg-black/10 rounded-full"></div>
                 </div>
              </div>
            )
          })}
          
          <button 
            onClick={() => onAddStage(lane.id)} 
            className="ml-2 w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full hover:bg-gray-200 text-gray-500 transition shadow-sm z-0"
          >
            <Plus size={16}/>
          </button>
        </div>
      </div>
    </div>
  )
}