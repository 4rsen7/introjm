import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { Plus, MoreHorizontal, GripVertical, AlignLeft, Image as ImageIcon, AlertCircle, Sparkles, CheckCircle2, List, Trash2, Copy, Palette, Share2, BarChart2, Map as MapIcon, Pin, PinOff } from 'lucide-react'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable' 
import { useDroppable } from '@dnd-kit/core' 
import JourneyCard from './JourneyCard'

const DROPDOWN_APPROX_HEIGHT = 320
const SPACE_MARGIN = 16
const PICKER_PORTAL_Z = 150

function getScrollParent(node) {
  if (!node) return null
  let p = node.parentElement
  while (p) {
    const { overflow, overflowY } = getComputedStyle(p)
    if (/auto|scroll|overlay/.test(overflow) || /auto|scroll|overlay/.test(overflowY)) return p
    if (p.scrollHeight > p.clientHeight || p.scrollWidth > p.clientWidth) return p
    p = p.parentElement
  }
  return null
}

function CardPicker({ onPick, isOpen, onOpenChange }) {
  const { t } = useTranslation()
  const containerRef = useRef(null)
  const triggerRectRef = useRef(null)
  const [openUpward, setOpenUpward] = useState(false)

  const openPicker = () => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    triggerRectRef.current = { left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width }
    const spaceBelow = window.innerHeight - rect.bottom
    setOpenUpward(spaceBelow < DROPDOWN_APPROX_HEIGHT + SPACE_MARGIN)
    onOpenChange(true)
  }

  useLayoutEffect(() => {
    if (!isOpen || !containerRef.current) return
    if (!triggerRectRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      triggerRectRef.current = { left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width }
      const spaceBelow = window.innerHeight - rect.bottom
      setOpenUpward(spaceBelow < DROPDOWN_APPROX_HEIGHT + SPACE_MARGIN)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const scrollEl = getScrollParent(containerRef.current)
    const handleScroll = () => onOpenChange(false)
    scrollEl?.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true })
    return () => {
      scrollEl?.removeEventListener('scroll', handleScroll)
      window.removeEventListener('scroll', handleScroll, { capture: true })
    }
  }, [isOpen, onOpenChange])

  const options = [
    { type: 'text', label: t('editor.cardText'), icon: AlignLeft, color: 'text-gray-500' },
    { type: 'image', label: t('editor.cardImage'), icon: ImageIcon, color: 'text-gray-500' },
    { type: 'pain_point', label: t('editor.cardPainPoint'), icon: AlertCircle, color: 'text-red-500' },
    { type: 'opportunity', label: t('editor.cardOpportunity'), icon: Sparkles, color: 'text-blue-500' },
    { type: 'solution', label: t('editor.cardSolution'), icon: CheckCircle2, color: 'text-green-500' },
    { type: 'channel', label: t('editor.cardChannels'), icon: Share2, color: 'text-indigo-500' },
    { type: 'metric', label: t('editor.cardMetric'), icon: BarChart2, color: 'text-emerald-500' },
    { type: 'linked_journey', label: t('editor.cardLinkJourneyMap'), icon: MapIcon, color: 'text-amber-500' },
    { type: 'stage', label: t('editor.cardStage'), icon: List, color: 'text-purple-500' },
  ]

  const rect = triggerRectRef.current
  const portalContent = isOpen && rect && typeof document !== 'undefined' && (
    <>
      <div className="fixed inset-0 cursor-pointer" style={{ zIndex: PICKER_PORTAL_Z }} onClick={(e) => { e.stopPropagation(); onOpenChange(false); }} aria-hidden="true" />
      <div
        className="fixed bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden py-1 min-w-[140px]"
        style={{
          zIndex: PICKER_PORTAL_Z + 1,
          left: rect.left,
          width: rect.width,
          ...(openUpward ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
        }}
      >
        {options.map(opt => (
          <button key={opt.type} onClick={(e) => { e.stopPropagation(); onPick(opt.type); onOpenChange(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors">
            <opt.icon size={14} className={opt.color} /> <span className="text-gray-700">{opt.label}</span>
          </button>
        ))}
      </div>
    </>
  )

  return (
    <div ref={containerRef} className={`relative mt-auto transition-all hide-on-export ${isOpen ? 'opacity-100' : 'opacity-0 group-hover/cell:opacity-100'}`}>
      <button
        onClick={(e) => {
          e.stopPropagation()
          if (isOpen) onOpenChange(false)
          else openPicker()
        }}
        className={`w-full py-2 border border-dashed rounded flex items-center justify-center gap-2 transition-all ${isOpen ? 'border-orange-300 bg-orange-50 text-orange-600' : 'border-gray-300 text-gray-400 hover:text-orange-600 hover:border-orange-300 hover:bg-orange-50'}`}
      >
        <Plus size={14} /> {t('editor.addContent')}
      </button>
      {portalContent && createPortal(portalContent, document.body)}
    </div>
  )
}

function LaneCell({ colId, laneId, cards, globalMetrics, globalJourneys, onAddCard, onUpdateCard, onDeleteCard, zIndex, layout, onPickerToggle, selectedCardId, onSelectCard, activePickerId, onSetActivePicker, onUploadImage, onEditMetric, onOpenLinkedJourneyPreview, readOnly }) {
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
              globalJourneys={globalJourneys}
              onUpdate={(updatedCard) => onUpdateCard(laneId, colId, updatedCard)} 
              onDelete={() => onDeleteCard(laneId, colId, row.card.id)}
              onMenuToggle={onPickerToggle}
              selectedCardId={selectedCardId}
              onSelectCard={onSelectCard}
              onUploadImage={onUploadImage}
              onEditMetric={onEditMetric}
              onOpenLinkedJourneyPreview={onOpenLinkedJourneyPreview}
              readOnly={readOnly}
            /> 
          )
        })}
        
        {!readOnly && (
        <CardPicker 
          onPick={(type) => onAddCard(laneId, colId, type)} 
          isOpen={activePickerId === containerId}
          onOpenChange={(isOpen) => {
             if (isOpen && onSelectCard) onSelectCard(null);
             onSetActivePicker(isOpen ? containerId : null);
          }} 
        />
        )}
      </div>
    </SortableContext>
  )
}

export default function TextLane({ lane, gridColumns, laneData, globalMetrics, globalJourneys = [], onAddCard, onUpdateCard, onDeleteCard, dragHandleProps, onDelete, onDuplicate, onUpdate, isMenuOpen, onToggleMenu, selectedCardId, onSelectCard, onTogglePin, activePickerId, onSetActivePicker, onUploadImage, onEditMetric, onOpenLinkedJourneyPreview, readOnly }) {
  const { t } = useTranslation()
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
      <div className={`w-64 shrink-0 sticky left-0 z-[100] ${bgColor} border-r border-gray-200 px-4 py-3 flex flex-row items-start justify-between group/header`}>
        <div className="flex items-center gap-3 flex-1 min-w-0 mr-2">
            {!readOnly && !lane.isPinned && (
              <div {...(dragHandleProps || {})} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-600 p-1 -ml-1 rounded hover:bg-gray-200/50 transition-colors touch-none shrink-0 hide-on-export">
                <GripVertical size={16} />
              </div>
            )}
            {!readOnly && lane.isPinned && <Pin size={14} className="text-orange-500 shrink-0 transform rotate-45" />}
            {readOnly ? (
              <span className="font-bold text-gray-700 text-sm w-full truncate block">{lane.title || ''}</span>
            ) : (
            <input 
              className="font-bold text-gray-700 text-sm bg-transparent outline-none border-b border-transparent focus:border-orange-500 w-full truncate"
              value={lane.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
            />
            )}
        </div>

        {!readOnly && (
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
                   {lane.isPinned ? t('editor.unpinLane') : t('editor.pinLane')}
                 </button>
                 <button onClick={() => { onDuplicate(); toggleDropdown(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                   <Copy size={14} /> {t('editor.duplicateLane')}
                 </button>
                 <div className="px-4 py-2">
                   <div className="text-xs text-gray-400 font-bold mb-2 flex items-center gap-2"><Palette size={10} /> {t('common.color')}</div>
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
                   <Trash2 size={14} /> {t('editor.deleteLaneMenu')}
                 </button>
              </div>
            </>
          )}
        </div>
        )}
      </div>

      <div className="flex">
        {gridColumns.map((col, index) => {
          const isColActive = !readOnly && laneData[col.id]?.cards?.some(c => c.id === selectedCardId);
          return (
            <LaneCell 
              key={col.id}
              colId={col.id}
              laneId={lane.id}
              cards={laneData[col.id]?.cards || []}
              globalMetrics={globalMetrics}
              globalJourneys={globalJourneys}
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
              onUploadImage={onUploadImage}
              onEditMetric={onEditMetric}
              onOpenLinkedJourneyPreview={onOpenLinkedJourneyPreview}
              readOnly={readOnly}
            />
          )
        })}
      </div>
    </div>
  )
}
