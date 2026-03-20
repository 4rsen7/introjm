import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { AlignLeft, Image as ImageIcon, AlertCircle, Sparkles, CheckCircle2, Palette, Trash2, Share2, BarChart2, Bold, Italic, List, Link as LinkIcon, Maximize2, X, Settings, Map, ChevronRight, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import RichTextEditor from '../common/RichTextEditor'
import ChannelCard from './ChannelCard'
import ChannelCardSettingsModal from './ChannelCardSettingsModal'
import JourneyMetricCard from './JourneyMetricCard'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'

const STAGE_COLORS = ['bg-blue-100', 'bg-green-100', 'bg-purple-100', 'bg-orange-100', 'bg-pink-100', 'bg-yellow-100', 'bg-red-100', 'bg-teal-100'];
const COL_WIDTH = 288; // 18rem

// За замовчуванням 12px (text-xs); опції 12 / 14 / 18 відповідають HTML font size 3 / 5 / 7
const FONT_SIZE_OPTIONS = [
  { value: '3', label: '12' },
  { value: '5', label: '14' },
  { value: '7', label: '18' }
];

function LinkedJourneyBlock({ card, globalJourneys = [], onOpenLinkedJourneyPreview }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const journey = card.content ? globalJourneys.find(j => j.id === card.content) : null
  const title = journey?.title || (card.content ? t('editor.untitled') : t('editor.selectJourney'))
  const canOpen = Boolean(card.content)

  const handleOpen = (e) => {
    e.stopPropagation()
    if (onOpenLinkedJourneyPreview) {
      onOpenLinkedJourneyPreview(card.content)
    } else {
      navigate(`/journey/${card.content}`)
    }
  }

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-amber-50/50 border border-amber-100">
      <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
        <Map size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-900 truncate block">{title}</span>
      </div>
      {canOpen && (
        <button
          type="button"
          onClick={handleOpen}
          className="shrink-0 flex items-center justify-center text-amber-600 hover:text-amber-700 font-medium text-sm py-1.5 px-2 rounded hover:bg-amber-100 transition-colors"
          title={t('editor.open')}
        >
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  )
}

export default function JourneyCard({ card, globalMetrics, globalJourneys = [], onUpdate, onDelete, onMenuToggle, selectedCardId, onSelectCard, onUploadImage, onEditMetric, onOpenLinkedJourneyPreview, readOnly, isExport = false }) {
  const { t } = useTranslation()
  const [stageDraft, setStageDraft] = useState(null)
  const [showMenu, setShowMenu] = useState(false)
  const isActive = selectedCardId === card.id
  const [isImageModalOpen, setIsImageModalOpen] = useState(false)
  const [showChannelSettings, setShowChannelSettings] = useState(false)
  const [toolbarFontSize, setToolbarFontSize] = useState('3')
  const [showFontSizeMenu, setShowFontSizeMenu] = useState(false)
  useBodyScrollLock(isImageModalOpen)
  const editorRef = useRef(null)
  const menuRef = useRef(null)
  const buttonRef = useRef(null)
  const fontSizeMenuRef = useRef(null)
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
    transform: readOnly ? undefined : CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !readOnly ? 0 : 1,
    zIndex: isDragging && !readOnly ? 999 : (card.type === 'stage' ? 10 : 'auto'),
  }
  const dragProps = readOnly ? {} : { ...attributes, ...listeners }

  // Синхронізуємо цифру розміру шрифту в тулбарі при активації картки
  useEffect(() => {
    if (!showFontSizeMenu) return
    const close = (e) => {
      if (fontSizeMenuRef.current && !fontSizeMenuRef.current.contains(e.target)) {
        setShowFontSizeMenu(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showFontSizeMenu])

  const stageContent = card.content || ''
  const stageValue = stageDraft ?? stageContent

  const handleBlur = () => {
    if (stageDraft !== null && stageDraft !== stageContent) {
      onUpdate({ ...card, content: stageDraft })
    }
    setStageDraft(null)
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
  }, [showMenu, isActive, onMenuToggle, onSelectCard, setNodeRef])

  const handleCardClick = (e) => {
    e.stopPropagation()
    if (isResizing.current) return
    if (onSelectCard) onSelectCard(card.id)
    if (onMenuToggle) onMenuToggle(true)
    
    // If it's a text-based card, focus the editor
    if (['text', 'pain_point', 'opportunity', 'solution'].includes(card.type)) {
      if (editorRef.current?.getFontSize) {
        setToolbarFontSize(editorRef.current.getFontSize() || '3')
      }
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
        {...dragProps}
        onClick={readOnly ? undefined : handleCardClick}
      >
        {!readOnly && isActive && (
          <div 
            onMouseDown={(e) => e.preventDefault()}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-1 bg-gray-900 text-white rounded-full px-3 py-1.5 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
             <button 
               ref={buttonRef}
               onClick={toggleMenu}
               className="p-1 hover:bg-gray-700 rounded transition" 
               title={t('common.color')}
             >
               <Palette size={14} />
             </button>
             <div className="w-px h-4 bg-gray-700 mx-1"></div>
             <button onClick={() => onDelete && onDelete(card.id)} className="p-1 hover:bg-red-900/50 text-red-400 rounded transition" title={t('common.deleteStage')}>
                <Trash2 size={14} />
             </button>
          </div>
        )}
        <div 
          className={`h-12 flex items-center px-6 ${bgColor} transition-colors relative`}
          style={{ clipPath: 'polygon(0% 0%, calc(100% - 20px) 0%, 100% 50%, calc(100% - 20px) 100%, 0% 100%)', width: '100%' }}
        >
          {readOnly ? (
            <span className="font-bold text-gray-800 text-sm truncate block w-full">{stageContent}</span>
          ) : (
            <>
          <input
            className="w-full bg-transparent outline-none font-bold text-gray-800 text-sm placeholder-gray-500/50"
            value={stageValue}
            onChange={(e) => setStageDraft(e.target.value)}
            onBlur={() => { handleBlur(); if (onMenuToggle) onMenuToggle(false); }}
            onFocus={() => { if (onMenuToggle) onMenuToggle(true); }}
            placeholder={t('editor.placeholderStageName')}
            onPointerDown={(e) => e.stopPropagation()}
          />
          
          <div 
            className="absolute right-0 top-0 bottom-0 w-6 cursor-col-resize z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/5 transition-opacity"
            onMouseDown={handleResizeMouseDown}
            onPointerDown={(e) => e.stopPropagation()} 
            onClick={(e) => e.stopPropagation()}
            title={t('common.dragToResize')}
          >
             <div className="w-1 h-4 bg-black/20 rounded-full"></div>
          </div>
            </>
          )}
        </div>

        {!readOnly && showMenu && (
            <div 
              ref={menuRef}
              className="absolute top-full right-0 mt-2 p-3 bg-white rounded-lg shadow-xl border border-gray-100 z-50 w-56 flex flex-col gap-3 cursor-auto"
              onPointerDown={(e) => e.stopPropagation()}
            >
                <div>
                  <div className="text-[10px] text-gray-400 font-bold mb-1.5">{t('common.color')}</div>
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
  const commonClasses = "bg-white p-3 rounded-md shadow-sm border border-gray-200 text-sm text-gray-700 mb-2 relative group hover:shadow-md transition-shadow"
  
  const configMap = {
    text: { icon: AlignLeft, color: 'text-gray-400', bg: 'bg-gray-50', label: t('editor.cardText'), border: 'border-gray-200', bar: 'bg-gray-300' },
    image: { icon: ImageIcon, color: 'text-gray-400', bg: 'bg-transparent', label: t('editor.cardImage'), border: 'border-gray-200', bar: null },
    pain_point: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', label: t('editor.cardPainPoint'), border: 'border-red-100', bar: 'bg-red-500' },
    opportunity: { icon: Sparkles, color: 'text-blue-600', bg: 'bg-blue-50', label: t('editor.cardOpportunity'), border: 'border-blue-100', bar: 'bg-blue-500' },
    solution: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: t('editor.cardSolution'), border: 'border-green-100', bar: 'bg-green-500' },
    channel: { icon: Share2, color: 'text-indigo-500', bg: 'bg-indigo-50', label: t('editor.cardChannels'), border: 'border-indigo-100', bar: null },
    metric: { icon: BarChart2, color: 'text-emerald-500', bg: 'bg-emerald-50', label: t('editor.cardMetric'), border: 'border-emerald-100', bar: null },
    linked_journey: { icon: Map, color: 'text-amber-600', bg: 'bg-amber-50', label: t('editor.cardLinkJourneyMap'), border: 'border-amber-100', bar: null }
  }
  const config = configMap[card.type] || configMap.text

  if (card.type === 'image' && !card.content) {
    return (
       <div 
         ref={setNodeRef} style={style} {...dragProps}
         className={`${commonClasses} ${readOnly ? '' : 'cursor-grab active:cursor-grabbing'} ${!readOnly && isActive ? 'ring-2 ring-blue-500/20' : ''}`}
         onClick={readOnly ? undefined : handleCardClick}
       >
        {!readOnly && isActive && (
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-1 bg-gray-900 text-white rounded-full px-3 py-1.5 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
             <button onClick={() => onDelete && onDelete(card.id)} className="p-1 hover:bg-red-900/50 text-red-400 rounded transition" title={t('common.deleteImage')}>
                <Trash2 size={14} />
             </button>
          </div>
        )}
        <div className="flex items-center gap-2 mb-2 text-gray-400 text-xs font-bold select-none"><ImageIcon size={12} /> {t('editor.cardImage')}</div>
        {readOnly ? (
          <div className="h-24 bg-gray-50 border-2 border-dashed border-gray-200 rounded flex flex-col items-center justify-center text-gray-400 text-xs">{t('editor.upload')}</div>
        ) : (
        <div 
            onClick={(e) => { e.stopPropagation(); onUploadImage && onUploadImage(card.id); }}
            className="h-24 bg-gray-50 border-2 border-dashed border-gray-200 rounded flex flex-col items-center justify-center text-gray-400 hover:bg-gray-100 hover:border-gray-300 transition cursor-pointer"
        >
           <ImageIcon size={20} className="mb-1" /> <span className="text-xs">{t('editor.upload')}</span>
        </div>
        )}
      </div>
    )
  }

  const Icon = config.icon
  const isCompact = ['text', 'pain_point', 'opportunity', 'solution'].includes(card.type)

  if (isCompact) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`flex rounded-md shadow-sm border ${config.border} mb-2 group hover:shadow-md transition-all relative ${!readOnly && isActive ? 'ring-2 ring-blue-500/20' : ''} ${config.bg}`}
        onClick={readOnly ? undefined : handleCardClick}
      >
        {!readOnly && isActive && (
          <div
            onMouseDown={(e) => e.preventDefault()}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-1 bg-gray-900 text-white rounded-full px-3 py-1.5 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            <button onClick={() => editorRef.current?.toggleBold()} className="p-1 hover:bg-gray-700 rounded transition" title={t('common.bold')}>
              <Bold size={14} strokeWidth={2.5} />
            </button>
            <button onClick={() => editorRef.current?.toggleItalic()} className="p-1 hover:bg-gray-700 rounded transition" title={t('common.italic')}>
              <Italic size={14} />
            </button>
            <div className="w-px h-4 bg-gray-700 mx-1"></div>
            <div ref={fontSizeMenuRef} className="relative">
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowFontSizeMenu((v) => !v); }}
                className="p-1 hover:bg-gray-700 rounded transition min-w-[28px] flex items-center justify-center gap-0.5"
                title={t('common.fontSize')}
              >
                <span className="text-[11px] font-semibold text-white tabular-nums leading-none">
                  {FONT_SIZE_OPTIONS.find((o) => o.value === toolbarFontSize)?.label ?? '12'}
                </span>
                <ChevronDown size={12} className="text-gray-400 shrink-0" />
              </button>
              {showFontSizeMenu && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 py-1 bg-gray-800 rounded-lg shadow-xl border border-gray-700 min-w-[56px] z-[115]">
                  {FONT_SIZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        editorRef.current?.setFontSize?.(opt.value);
                        setToolbarFontSize(opt.value);
                        setShowFontSizeMenu(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 transition ${toolbarFontSize === opt.value ? 'bg-gray-700 text-white' : 'text-gray-200'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => editorRef.current?.insertList()} className="p-1 hover:bg-gray-700 rounded transition" title={t('common.list')}>
              <List size={14} />
            </button>
            <button onClick={() => editorRef.current?.addLink()} className="p-1 hover:bg-gray-700 rounded transition" title={t('common.link')}>
              <LinkIcon size={14} />
            </button>
            <div className="w-px h-4 bg-gray-700 mx-1"></div>
            <button onClick={() => onDelete && onDelete(card.id)} className="p-1 hover:bg-red-900/50 text-red-400 rounded transition" title={t('common.deleteCard')}>
              <Trash2 size={14} />
            </button>
          </div>
        )}
        {readOnly ? (
          <div className={`w-2 shrink-0 rounded-l-md ${config.bar}`} title={config.label} />
        ) : (
        <div
          {...attributes}
          {...listeners}
          className={`w-2 shrink-0 rounded-l-md ${config.bar} select-none cursor-grab active:cursor-grabbing`}
          title={config.label}
        />
        )}
        <div className={`flex-1 min-w-0 py-2 px-3 ${readOnly ? '' : 'cursor-text'}`} onPointerDown={(e) => readOnly && e.stopPropagation()}>
          {readOnly ? (
            <div className="text-sm text-gray-700 prose prose-sm max-w-none min-h-[2.5rem]" dangerouslySetInnerHTML={{ __html: card.content || '' }} />
          ) : (
          <RichTextEditor
            ref={editorRef}
            initialContent={card.content}
            onUpdate={(newContent) => onUpdate({ ...card, content: newContent })}
            onDelete={() => onDelete && onDelete(card.id)}
            cardType={card.type}
            onFocusChange={(focused) => { if (focused && onSelectCard) onSelectCard(card.id); if (onMenuToggle) onMenuToggle(focused); }}
            onFontSizeChange={setToolbarFontSize}
            compact={true}
          />
          )}
        </div>
      </div>
    )
  }

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`bg-white rounded-md shadow-sm border ${config.border} mb-2 group hover:shadow-md transition-all relative ${!readOnly && isActive ? 'ring-2 ring-blue-500/20' : ''}`}
      onClick={readOnly ? undefined : handleCardClick}
    >
      {/* Toolbar for non-text cards (Channels, Metrics) */}
      {!readOnly && isActive && (
        <div 
          onMouseDown={(e) => e.preventDefault()}
          className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-1 bg-gray-900 text-white rounded-full px-3 py-1.5 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
           {['text', 'pain_point', 'opportunity', 'solution'].includes(card.type) && (
             <>
               <button onClick={() => editorRef.current?.toggleBold()} className="p-1 hover:bg-gray-700 rounded transition" title={t('common.bold')}>
                 <Bold size={14} strokeWidth={2.5} />
               </button>
               <button onClick={() => editorRef.current?.toggleItalic()} className="p-1 hover:bg-gray-700 rounded transition" title={t('common.italic')}>
                 <Italic size={14} />
               </button>
               <div className="w-px h-4 bg-gray-700 mx-1"></div>
               <div ref={fontSizeMenuRef} className="relative">
                 <button
                   onMouseDown={(e) => { e.preventDefault(); setShowFontSizeMenu((v) => !v); }}
                   className="p-1 hover:bg-gray-700 rounded transition min-w-[28px] flex items-center justify-center gap-0.5"
                   title={t('common.fontSize')}
                 >
                   <span className="text-[11px] font-semibold text-white tabular-nums leading-none">
                     {FONT_SIZE_OPTIONS.find((o) => o.value === toolbarFontSize)?.label ?? '12'}
                   </span>
                   <ChevronDown size={12} className="text-gray-400 shrink-0" />
                 </button>
                 {showFontSizeMenu && (
                   <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 py-1 bg-gray-800 rounded-lg shadow-xl border border-gray-700 min-w-[56px] z-[115]">
                     {FONT_SIZE_OPTIONS.map((opt) => (
                       <button
                         key={opt.value}
                         onMouseDown={(e) => {
                           e.preventDefault();
                           editorRef.current?.setFontSize?.(opt.value);
                           setToolbarFontSize(opt.value);
                           setShowFontSizeMenu(false);
                         }}
                         className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 transition ${toolbarFontSize === opt.value ? 'bg-gray-700 text-white' : 'text-gray-200'}`}
                       >
                         {opt.label}
                       </button>
                     ))}
                   </div>
                 )}
               </div>
               <button onClick={() => editorRef.current?.insertList()} className="p-1 hover:bg-gray-700 rounded transition" title={t('common.list')}>
                 <List size={14} />
               </button>
               <button onClick={() => editorRef.current?.addLink()} className="p-1 hover:bg-gray-700 rounded transition" title={t('common.link')}>
                 <LinkIcon size={14} />
               </button>
               <div className="w-px h-4 bg-gray-700 mx-1"></div>
             </>
           )}
           {card.type === 'channel' && (
             <button onClick={(e) => { e.stopPropagation(); setShowChannelSettings(true); }} className="p-1 hover:bg-gray-700 rounded transition" title={t('common.cardSettings')}>
               <Settings size={14} />
             </button>
           )}
           {card.type === 'metric' && onEditMetric && (
             <button onClick={(e) => { e.stopPropagation(); const m = globalMetrics?.find(x => x.id === card.content); if (m) onEditMetric(m); }} className="p-1 hover:bg-gray-700 rounded transition" title={t('common.metricSettingsTitle')}>
               <Settings size={14} />
             </button>
           )}
           <button onClick={() => onDelete && onDelete(card.id)} className="p-1 hover:bg-red-900/50 text-red-400 rounded transition" title={t('common.deleteCard')}>
              <Trash2 size={14} />
           </button>
        </div>
      )}

      {/* Header - DRAG HANDLE */}
      <div 
        {...dragProps}
        className={`${config.bg} px-3 py-2 flex items-center justify-between border-b ${config.border} select-none ${readOnly ? '' : 'cursor-grab active:cursor-grabbing'}`}
      >
        <div className="flex items-center gap-2">
           <Icon size={14} className={config.color} /> 
           <span className={`text-xs font-bold ${config.color}`}>{config.label}</span>
        </div>
      </div>

      {/* Body - NO DRAG */}
      <div className={`${card.type === 'metric' ? 'px-3 pt-3 pb-1.5' : 'p-3'} ${readOnly ? '' : 'cursor-text'}`} onPointerDown={(e) => e.stopPropagation()}>
         {card.type === 'channel' || card.type === 'metric' ? (
           card.type === 'channel' ? <ChannelCard card={card} onUpdate={readOnly ? () => {} : onUpdate} /> : (
             <JourneyMetricCard metric={globalMetrics?.find(m => m.id === card.content)} isExport={isExport} />
           )
         ) : card.type === 'linked_journey' ? (
           <LinkedJourneyBlock card={card} globalJourneys={globalJourneys} onOpenLinkedJourneyPreview={onOpenLinkedJourneyPreview} />
         ) : card.type === 'image' ? (
             <div className="relative group/image">
                 <img 
                    src={card.content} 
                    alt="Uploaded content" 
                    className={`w-full h-auto rounded-md object-cover border border-gray-100 ${readOnly ? '' : 'cursor-pointer hover:opacity-95'} transition-opacity`}
                    onClick={readOnly ? undefined : (e) => { e.stopPropagation(); setIsImageModalOpen(true); }}
                 />
                 {!readOnly && (
                 <button 
                    onClick={(e) => { e.stopPropagation(); setIsImageModalOpen(true); }}
                    className="absolute bottom-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover/image:opacity-100 transition-opacity backdrop-blur-sm"
                    title={t('common.expandImage')}
                 >
                    <Maximize2 size={14} />
                 </button>
                 )}

                 {!readOnly && isImageModalOpen && createPortal(
                    <div 
                        className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200"
                        onClick={(e) => { e.stopPropagation(); setIsImageModalOpen(false); }}
                    >
                        <button 
                            className="absolute top-6 right-6 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                            onClick={() => setIsImageModalOpen(false)}
                        >
                            <X size={32} />
                        </button>
                        <img 
                            src={card.content} 
                            alt="Full size" 
                            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
                            onClick={(e) => e.stopPropagation()} 
                        />
                    </div>,
                    document.body
                 )}
             </div>
         ) : readOnly ? (
           <div className="text-sm text-gray-700 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: card.content || '' }} />
         ) : (
           <RichTextEditor 
              ref={editorRef}
              initialContent={card.content} 
              onUpdate={(newContent) => onUpdate({ ...card, content: newContent })}
              onDelete={() => onDelete && onDelete(card.id)}
              cardType={card.type}
              onFocusChange={(focused) => { if(focused && onSelectCard) onSelectCard(card.id); if(onMenuToggle) onMenuToggle(focused); }}
              onFontSizeChange={setToolbarFontSize}
           />
         )}
      </div>
      {!readOnly && card.type === 'channel' && showChannelSettings && createPortal(
        <ChannelCardSettingsModal
          card={card}
          onClose={() => setShowChannelSettings(false)}
          onSave={(updatedCard) => {
            onUpdate(updatedCard)
            setShowChannelSettings(false)
          }}
        />,
        document.body
      )}
    </div>
  )
}
