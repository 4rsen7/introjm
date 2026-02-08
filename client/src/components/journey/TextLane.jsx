import { useState } from 'react'
import { Plus, MoreHorizontal, GripVertical, AlignLeft, Image as ImageIcon, AlertCircle, Sparkles, CheckCircle2, List, Trash2, Copy, Palette, Share2, BarChart2, Pin, PinOff } from 'lucide-react'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable' 
import { useDroppable } from '@dnd-kit/core' 
import JourneyCard from './JourneyCard'

function CardPicker({ onPick, isOpen, onOpenChange }) {
  const options = [
    { type: 'text', label: 'Text', icon: AlignLeft, color: 'text-gray-500' },
    { type: 'image', label: 'Image', icon: ImageIcon, color: 'text-gray-500' },
    { type: 'pain_point', label: 'Pain Point', icon: AlertCircle, color: 'text-red-500' },
    { type: 'opportunity', label: 'Opportunity', icon: Sparkles, color: 'text-blue-500' },
    { type: 'solution', label: 'Solution', icon: CheckCircle2, color: 'text-green-500' },
    { type: 'channel', label: 'Channels', icon: Share2, color: 'text-indigo-500' },
    { type: 'metric', label: 'Metric', icon: BarChart2, color: 'text-emerald-500' },
    { type: 'stage', label: 'Stage', icon: List, color: 'text-purple-500' },
  ]
  return (
    <div className={`relative mt-auto transition-all hide-on-export ${isOpen ? 'opacity-100' : 'opacity-0 group-hover/cell:opacity-100'}`}>
      <button onClick={(e) => { e.stopPropagation(); onOpenChange(!isOpen); }} className={`w-full py-2 border border-dashed rounded flex items-center justify-center gap-2 transition-all ${isOpen ? 'border-orange-300 bg-orange-50 text-orange-600' : 'border-gray-300 text-gray-400 hover:text-orange-600 hover:border-orange-300 hover:bg-orange-50'}`}>
        <Plus size={14} /> Add Content
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); onOpenChange(false); }}></div>
          <div className="absolute top-full left-0 w-full mt-1 bg-white rounded-lg shadow-xl border border-gray-100 z-50 overflow-hidden py-1 min-w-[140px]">
            {options.map(opt => (
              <button key={opt.type} onClick={(e) => { e.stopPropagation(); onPick(opt.type); onOpenChange(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors">
                <opt.icon size={14} className={opt.color} /> <span className="text-gray-700">{opt.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function LaneCell({ colId, laneId, cards, globalMetrics, onAddCard, onUpdateCard, onDeleteCard, zIndex, layout, onPickerToggle, selectedCardId, onSelectCard, activePickerId, onSetActivePicker }) {
  const containerId = `${laneId}::${colId}`;
  
  const { setNodeRef } = useDroppable({
    id: containerId
  });

  const occupiedRows = layout?.occupied || new Set();
  const cardRows = layout?.cardRows || new Map();
  
  let maxRow = -1;
  if (occupiedRows.size > 0) maxRow = Math.max(...occupiedRows);
  if (cardRows.size > 0) maxRow = Math.max(maxRow, ...cardRows.values());

  const rows = [];
  for (let r = 0; r <= maxRow; r++) {
    if (occupiedRows.has(r)) {
      rows.push({ type: 'spacer', id: `spacer-${r}` });
    } else {
      const card = cards.find(c => cardRows.get(c.id) === r);
      if (card) {
        rows.push({ type: 'card', card });
      } else {
        rows.push({ type: 'spacer', id: `gap-${r}` });
      }
    }
  }

  return (
    <SortableContext 
      id={containerId} 
      items={cards.map(c => c.id)} 
      strategy={verticalListSortingStrategy}
    >
      <div 
        ref={setNodeRef} 
        style={{ zIndex }}
        className="w-72 shrink-0 border-r border-gray-200/50 py-3 px-3 flex flex-col gap-2 relative group/cell hover:bg-gray-100/50 transition-colors h-full min-h-[112px]"
      >
        {rows.map(row => {
          if (row.type === 'spacer') {
             return <div key={row.id} className="h-12 mb-2 w-full pointer-events-none"></div>
          }
          return (
            <JourneyCard 
              key={row.card.id} 
              card={row.card} 
              globalMetrics={globalMetrics}
              onUpdate={(updatedCard) => onUpdateCard(laneId, colId, updatedCard)} 
              onDelete={() => onDeleteCard(laneId, colId, row.card.id)}
              onMenuToggle={onPickerToggle}
              selectedCardId={selectedCardId}
              onSelectCard={onSelectCard}
            /> 
          )
        })}
        
        <CardPicker 
          onPick={(type) => onAddCard(laneId, colId, type)} 
          isOpen={activePickerId === containerId}
          onOpenChange={(isOpen) => {
             if (isOpen && onSelectCard) onSelectCard(null);
             onSetActivePicker(isOpen ? containerId : null);
             onPickerToggle(isOpen);
          }} 
        />
      </div>
    </SortableContext>
  )
}

export default function TextLane({ lane, gridColumns, laneData, globalMetrics, onAddCard, onUpdateCard, onDeleteCard, dragHandleProps, onDelete, onDuplicate, onUpdate, isMenuOpen, onToggleMenu, selectedCardId, onSelectCard, onTogglePin, activePickerId, onSetActivePicker }) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const calculateLayout = () => {
    const layout = {}; 
    gridColumns.forEach(col => {
      layout[col.id] = { occupied: new Set(), cardRows: new Map() };
    });

    gridColumns.forEach((col, colIndex) => {
      const colId = col.id;
      const cards = laneData[colId]?.cards || [];
      const colLayout = layout[colId];
      
      let currentCardIndex = 0;
      let currentRow = 0;
      
      while (currentCardIndex < cards.length) {
        while (colLayout.occupied.has(currentRow)) {
          currentRow++;
        }
        
        const card = cards[currentCardIndex];
        colLayout.cardRows.set(card.id, currentRow);
        
        const span = card.span || 1;
        if (span > 1) {
          for (let k = 1; k < span; k++) {
            const targetCol = gridColumns[colIndex + k];
            if (targetCol) {
              layout[targetCol.id].occupied.add(currentRow);
            }
          }
        }
        
        currentCardIndex++;
        currentRow++;
      }
    });
    
    return layout;
  }

  const layoutMap = calculateLayout();
  const bgColor = lane.color || 'bg-gray-50';

  const toggleDropdown = (state) => {
    setIsDropdownOpen(state);
    onToggleMenu(state); 
  }

  return (
    <div className={`flex min-h-[112px] ${bgColor} border-b border-gray-200 transition-colors`}>
      <div className={`w-64 shrink-0 sticky left-0 z-30 ${bgColor} border-r border-gray-200 px-4 py-3 flex flex-row items-start justify-between group/header`}>
        <div className="flex items-center gap-3 flex-1 min-w-0 mr-2">
            {!lane.isPinned && (
              <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-600 p-1 -ml-1 rounded hover:bg-gray-200/50 transition-colors touch-none shrink-0 hide-on-export">
                <GripVertical size={16} />
              </div>
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
            onClick={() => toggleDropdown(!isDropdownOpen)}
            className={`text-gray-400 hover:text-gray-600 transition p-1 rounded hover:bg-gray-200 hide-on-export ${isDropdownOpen ? 'opacity-100 bg-gray-200' : 'opacity-0 group-hover/header:opacity-100'}`}
          >
            <MoreHorizontal size={16} />
          </button>

          {isDropdownOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => toggleDropdown(false)}></div>
              <div className="absolute top-full right-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-100 z-40 overflow-hidden py-1">
                 <button onClick={() => { onTogglePin(); toggleDropdown(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                   {lane.isPinned ? <PinOff size={14} /> : <Pin size={14} />} 
                   {lane.isPinned ? 'Unpin lane' : 'Pin lane'}
                 </button>
                 <button onClick={() => { onDuplicate(); toggleDropdown(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
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
                 <button onClick={() => { onDelete(); toggleDropdown(false); }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                   <Trash2 size={14} /> Delete lane
                 </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex">
        {gridColumns.map((col, index) => {
          const isColActive = laneData[col.id]?.cards?.some(c => c.id === selectedCardId);
          return (
            <LaneCell 
              key={col.id}
              colId={col.id}
              laneId={lane.id}
              cards={laneData[col.id]?.cards || []}
              globalMetrics={globalMetrics}
              onAddCard={onAddCard}
              onUpdateCard={onUpdateCard}
              onDeleteCard={onDeleteCard}
              zIndex={isColActive ? 80 : gridColumns.length - index}
              layout={layoutMap[col.id]}
              onPickerToggle={(isOpen) => onToggleMenu(isOpen)}
              selectedCardId={selectedCardId}
              onSelectCard={onSelectCard}
              activePickerId={activePickerId}
              onSetActivePicker={onSetActivePicker}
            />
          )
        })}
      </div>
    </div>
  )
}
