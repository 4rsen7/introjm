import { useState, useEffect, useRef } from 'react'
import { AlignLeft, Image as ImageIcon, AlertCircle, Sparkles, CheckCircle2, Palette, Trash2, Share2, BarChart2, Bold, Italic, List, Type, Link as LinkIcon } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import RichTextEditor from '../common/RichTextEditor'
import ChannelCard from './ChannelCard'
import JourneyMetricCard from './JourneyMetricCard'

const STAGE_COLORS = ['bg-blue-100', 'bg-green-100', 'bg-purple-100', 'bg-orange-100', 'bg-pink-100', 'bg-yellow-100', 'bg-red-100', 'bg-teal-100'];
const COL_WIDTH = 288; // 18rem

export default function JourneyCard({ card, globalMetrics, onUpdate, onDelete, onMenuToggle, selectedCardId, onSelectCard }) {
  const [localContent, setLocalContent] = useState(card.content || '')
  const [showMenu, setShowMenu] = useState(false)
  const [isStageFocused, setIsStageFocused] = useState(false)
  const isActive = selectedCardId === card.id
  const editorRef = useRef(null)
  const menuRef = useRef(null)
  const buttonRef = useRef(null)
  const isResizing = useRef(false)

  // --- DND KIT ---
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: card.id,
    data: { type: 'card', card }
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // ФІКС ДУБЛЮВАННЯ: Якщо тягнемо - робимо картку в списку повністю прозорою
    opacity: isDragging ? 0 : 1, 
    zIndex: isDragging ? 999 : (card.type === 'stage' ? 10 : 'auto'),
  }

  useEffect(() => { setLocalContent(card.content || '') }, [card.content])

  const handleBlur = () => {
    if (localContent !== card.content) {
      onUpdate({ ...card, content: localContent })
    }
  }

  const toggleMenu = (e) => {
    e.stopPropagation()
    const newState = !showMenu
    setShowMenu(newState)
    if (onMenuToggle) onMenuToggle(newState)
  }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showMenu && menuRef.current && !menuRef.current.contains(event.target) && buttonRef.current && !buttonRef.current.contains(event.target)) {
        setShowMenu(false)
        if (onMenuToggle) onMenuToggle(false)
      }
      
      // Handle click outside for card selection (isActive)
      if (isActive && setNodeRef.current && !setNodeRef.current.contains(event.target)) {
        if (onSelectCard) onSelectCard(null)
        if (onMenuToggle) onMenuToggle(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside, true)
    return () => document.removeEventListener('mousedown', handleClickOutside, true)
  }, [showMenu, isActive, onMenuToggle, setNodeRef])

  const handleCardClick = (e) => {
    e.stopPropagation()
    if (isResizing.current) return
    if (onSelectCard) onSelectCard(card.id)
    if (onMenuToggle) onMenuToggle(true)
    
    // If it's a text-based card, focus the editor
    if (['text', 'pain_point', 'opportunity', 'solution'].includes(card.type)) {
      editorRef.current?.focus()
    }
  }

  // --- RESIZE LOGIC (Для Stage) ---
  const handleResizeMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (showMenu) {
      setShowMenu(false)
      if (onMenuToggle) onMenuToggle(false)
    }

    isResizing.current = true

    const startX = e.clientX;
    const startSpan = card.span || 1;

    const handleMouseMove = (moveEvent) => {
      moveEvent.stopPropagation();
      const deltaX = moveEvent.clientX - startX;
      const deltaCols = Math.round(deltaX / COL_WIDTH);
      const newSpan = Math.max(1, startSpan + deltaCols);

      if (newSpan !== (card.span || 1)) {
        onUpdate({ ...card, span: newSpan });
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setTimeout(() => { isResizing.current = false }, 50)
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // --- STAGE CARD ---
  if (card.type === 'stage') {
    const bgColor = card.color || 'bg-orange-100';
    const span = card.span || 1;
    const width = `calc(${span * 18}rem - 1.5rem)`;

    return (
      <div 
        ref={setNodeRef}
        style={{ ...style, width, maxWidth: '200vw' }}
        className={`mb-2 relative group filter drop-shadow-sm transition-all duration-200`}
        {...attributes} 
        {...listeners}
        onClick={handleCardClick}
      >
        {isActive && (
          <div 
            onMouseDown={(e) => e.preventDefault()}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-1 bg-gray-900 text-white rounded-full px-3 py-1.5 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
             <button 
               ref={buttonRef}
               onClick={toggleMenu}
               className="p-1 hover:bg-gray-700 rounded transition" 
               title="Color"
             >
               <Palette size={14} />
             </button>
             <div className="w-px h-4 bg-gray-700 mx-1"></div>
             <button onClick={() => onDelete && onDelete(card.id)} className="p-1 hover:bg-red-900/50 text-red-400 rounded transition" title="Delete Stage">
                <Trash2 size={14} />
             </button>
          </div>
        )}
        <div 
          className={`h-12 flex items-center px-6 ${bgColor} transition-colors relative`}
          style={{ clipPath: 'polygon(0% 0%, calc(100% - 20px) 0%, 100% 50%, calc(100% - 20px) 100%, 0% 100%)', width: '100%' }}
        >
          <input
            className="w-full bg-transparent outline-none font-bold text-gray-800 text-sm placeholder-gray-500/50"
            value={localContent}
            onChange={(e) => setLocalContent(e.target.value)}
            onBlur={() => { handleBlur(); setIsStageFocused(false); if (onMenuToggle) onMenuToggle(false); }}
            onFocus={() => { setIsStageFocused(true); if (onMenuToggle) onMenuToggle(true); }}
            placeholder="Stage name"
            onPointerDown={(e) => e.stopPropagation()}
          />
          
          <div 
            className="absolute right-0 top-0 bottom-0 w-6 cursor-col-resize z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/5 transition-opacity"
            onMouseDown={handleResizeMouseDown}
            onPointerDown={(e) => e.stopPropagation()} 
            onClick={(e) => e.stopPropagation()}
            title="Drag to resize"
          >
             <div className="w-1 h-4 bg-black/20 rounded-full"></div>
          </div>
        </div>

        {showMenu && (
            <div 
              ref={menuRef}
              className="absolute top-full right-0 mt-2 p-3 bg-white rounded-lg shadow-xl border border-gray-100 z-50 w-56 flex flex-col gap-3 cursor-auto"
              onPointerDown={(e) => e.stopPropagation()}
            >
                <div>
                  <div className="text-[10px] uppercase text-gray-400 font-bold mb-1.5">Color</div>
                  <div className="flex gap-1.5 flex-wrap">
                    {STAGE_COLORS.map(c => (
                      <div key={c} className={`w-5 h-5 rounded-full cursor-pointer border border-gray-100 hover:scale-110 transition ${c} ${card.color === c ? 'ring-2 ring-gray-400' : ''}`} onClick={() => onUpdate({ ...card, color: c })}></div>
                    ))}
                  </div>
                </div>
            </div>
        )}
      </div>
    )
  }

  // --- STANDARD CARDS ---
  const commonClasses = "bg-white p-3 rounded-md shadow-sm border border-gray-200 text-sm text-gray-700 mb-2 relative group mx-3 hover:shadow-md transition-shadow"
  
  const config = {
    text: { icon: AlignLeft, color: 'text-gray-400', bg: 'bg-transparent', label: 'Text', border: 'border-gray-200' },
    image: { icon: ImageIcon, color: 'text-gray-400', bg: 'bg-transparent', label: 'Image', border: 'border-gray-200' },
    pain_point: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Pain Point', border: 'border-red-100' },
    opportunity: { icon: Sparkles, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Opportunity', border: 'border-blue-100' },
    solution: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: 'Solution', border: 'border-green-100' },
    channel: { icon: Share2, color: 'text-indigo-500', bg: 'bg-indigo-50', label: 'Channels', border: 'border-indigo-100' },
    metric: { icon: BarChart2, color: 'text-emerald-500', bg: 'bg-emerald-50', label: 'Metric', border: 'border-emerald-100' }
  }[card.type] || config.text

  if (card.type === 'image' && !card.content) {
    return (
       <div 
         ref={setNodeRef} style={style} {...attributes} {...listeners}
         className={`${commonClasses} cursor-grab active:cursor-grabbing ${isActive ? 'ring-2 ring-blue-500/20' : ''}`}
         onClick={handleCardClick}
       >
        {isActive && (
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-1 bg-gray-900 text-white rounded-full px-3 py-1.5 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
             <button onClick={() => onDelete && onDelete(card.id)} className="p-1 hover:bg-red-900/50 text-red-400 rounded transition" title="Delete Image">
                <Trash2 size={14} />
             </button>
          </div>
        )}
        <div className="flex items-center gap-2 mb-2 text-gray-400 text-xs uppercase font-bold select-none"><ImageIcon size={12} /> Image</div>
        <div className="h-24 bg-gray-50 border-2 border-dashed border-gray-200 rounded flex flex-col items-center justify-center text-gray-400 hover:bg-gray-100 hover:border-gray-300 transition cursor-pointer">
           <ImageIcon size={20} className="mb-1" /> <span className="text-xs">Upload</span>
        </div>
      </div>
    )
  }

  const Icon = config.icon

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`bg-white rounded-md shadow-sm border ${config.border} mb-2 group mx-3 hover:shadow-md transition-all relative ${isActive ? 'ring-2 ring-blue-500/20' : ''}`}
      onClick={handleCardClick}
    >
      {/* Toolbar for non-text cards (Channels, Metrics) */}
      {isActive && (
        <div 
          onMouseDown={(e) => e.preventDefault()}
          className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-1 bg-gray-900 text-white rounded-full px-3 py-1.5 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
           {['text', 'pain_point', 'opportunity', 'solution'].includes(card.type) && (
             <>
               <button onClick={() => editorRef.current?.toggleBold()} className="p-1 hover:bg-gray-700 rounded transition" title="Bold">
                 <Bold size={14} strokeWidth={2.5} />
               </button>
               <button onClick={() => editorRef.current?.toggleItalic()} className="p-1 hover:bg-gray-700 rounded transition" title="Italic">
                 <Italic size={14} />
               </button>
               <div className="w-px h-4 bg-gray-700 mx-1"></div>
               <button onClick={() => editorRef.current?.cycleFontSize()} className="p-1 hover:bg-gray-700 rounded transition" title="Font Size">
                  <Type size={14} />
               </button>
               <button onClick={() => editorRef.current?.insertList()} className="p-1 hover:bg-gray-700 rounded transition" title="List">
                 <List size={14} />
               </button>
               <button onClick={() => editorRef.current?.addLink()} className="p-1 hover:bg-gray-700 rounded transition" title="Link">
                 <LinkIcon size={14} />
               </button>
               <div className="w-px h-4 bg-gray-700 mx-1"></div>
             </>
           )}
           <button onClick={() => onDelete && onDelete(card.id)} className="p-1 hover:bg-red-900/50 text-red-400 rounded transition" title="Delete Card">
              <Trash2 size={14} />
           </button>
        </div>
      )}

      {/* Header - DRAG HANDLE */}
      <div 
        {...attributes} {...listeners}
        className={`${config.bg} px-3 py-2 flex items-center justify-between border-b ${config.border} select-none cursor-grab active:cursor-grabbing`}
      >
        <div className="flex items-center gap-2">
           <Icon size={14} className={config.color} /> 
           <span className={`text-xs font-bold ${config.color} uppercase`}>{config.label}</span>
        </div>
      </div>

      {/* Body - NO DRAG */}
      <div className="p-3 cursor-text" onPointerDown={(e) => e.stopPropagation()}>
         {card.type === 'channel' || card.type === 'metric' ? (
           card.type === 'channel' ? <ChannelCard card={card} onUpdate={onUpdate} /> : (
             // Find the metric in globalMetrics using the ID stored in card.content
             <JourneyMetricCard metric={globalMetrics?.find(m => m.id === card.content)} />
           )
         ) : (
           <RichTextEditor 
              ref={editorRef}
              initialContent={card.content} 
              onUpdate={(newContent) => onUpdate({ ...card, content: newContent })}
              onDelete={() => onDelete && onDelete(card.id)}
              cardType={card.type}
              onFocusChange={(focused) => { if(focused && onSelectCard) onSelectCard(card.id); if(onMenuToggle) onMenuToggle(focused); }}
           />
         )}
      </div>
    </div>
  )
}