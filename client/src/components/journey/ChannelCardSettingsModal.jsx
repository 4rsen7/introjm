import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, Link as LinkIcon, X, Plus } from 'lucide-react'
import {
  ICONS_BY_ID,
  CHANNEL_ICON_OPTIONS,
  getDefaultChannelDetails,
  CHANNEL_COLORS,
} from './channelOptions'

function SortableChannelRow({ item, onUpdate, onRemove, isIconPickerOpen, onIconPickerToggle, removeTitle = 'Remove' }) {
  const { t } = useTranslation()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const Icon = ICONS_BY_ID[item.iconId] || ICONS_BY_ID.mail
  const showPicker = isIconPickerOpen === item.id

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 py-2 px-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors relative"
    >
      <button
        type="button"
        className="p-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      <div className="relative shrink-0">
        <button
          type="button"
          data-icon-trigger
          onClick={(e) => {
            e.stopPropagation()
            onIconPickerToggle(showPicker ? null : item.id, showPicker ? undefined : e.currentTarget)
          }}
          className="w-8 h-8 rounded flex items-center justify-center border border-gray-200 hover:border-orange-300 hover:bg-orange-50/50 transition-colors"
          style={{ backgroundColor: item.color ? `${item.color}20` : '#f9fafb' }}
        >
          <Icon size={16} style={item.color ? { color: item.color } : {}} className="text-gray-700" />
        </button>
      </div>
      <div className="flex gap-1 shrink-0">
        {CHANNEL_COLORS.slice(0, 6).map((hex) => (
          <button
            key={hex}
            type="button"
            className="w-4 h-4 rounded-full border border-gray-200 hover:scale-110 transition-transform"
            style={{ backgroundColor: hex }}
            title={hex}
            onClick={() => onUpdate({ ...item, color: hex })}
          />
        ))}
      </div>
      <input
        type="text"
        value={item.label}
        onChange={(e) => onUpdate({ ...item, label: e.target.value })}
        className="flex-1 min-w-0 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
        placeholder={t('editor.placeholderLabel')}
      />
      <div className="flex items-center gap-1 shrink-0">
        <LinkIcon size={14} className="text-gray-400" />
        <input
          type="url"
          value={item.link || ''}
          onChange={(e) => onUpdate({ ...item, link: e.target.value })}
          placeholder={t('editor.placeholderUrl')}
          className="w-24 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
        title={removeTitle}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

export default function ChannelCardSettingsModal({ card, onClose, onSave }) {
  const { t } = useTranslation()
  const initialDetails =
    card.channelDetails && card.channelDetails.length > 0
      ? card.channelDetails.map((ch) => ({
          id: ch.id,
          label: ch.label || '',
          iconId: ch.iconId || ch.id,
          color: ch.color,
          link: ch.link || '',
        }))
      : getDefaultChannelDetails()

  const [details, setDetails] = useState(initialDetails)
  const [openIconPickerId, setOpenIconPickerId] = useState(null)
  const [iconPickerRect, setIconPickerRect] = useState(null)
  const detailIds = details.map((d) => d.id)

  const handleIconPickerToggle = useCallback((id, triggerEl) => {
    setOpenIconPickerId(id || null)
    setIconPickerRect(triggerEl ? triggerEl.getBoundingClientRect() : null)
  }, [])

  useEffect(() => {
    if (!openIconPickerId) return
    const close = (e) => {
      if (!e.target.closest('[data-icon-picker]') && !e.target.closest('[data-icon-trigger]')) {
        setOpenIconPickerId(null)
        setIconPickerRect(null)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [openIconPickerId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setDetails((prev) => {
        const oldIndex = prev.findIndex((d) => d.id === active.id)
        const newIndex = prev.findIndex((d) => d.id === over.id)
        if (oldIndex === -1 || newIndex === -1) return prev
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  const updateItem = useCallback((id, next) => {
    setDetails((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...next } : d))
    )
  }, [])

  const removeItem = useCallback((id) => {
    setDetails((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const addIcon = useCallback(() => {
    const newId = `custom-${Date.now()}`
    setDetails((prev) => [
      ...prev,
      {
        id: newId,
        label: 'New channel',
        iconId: 'email',
        color: undefined,
        link: '',
      },
    ])
  }, [])

  const handleSave = () => {
    const idSet = new Set(details.map((d) => d.id))
    const normalizedChannels = (card.channels || []).filter((id) => idSet.has(id))
    onSave({
      ...card,
      channelDetails: details,
      channels: normalizedChannels,
    })
    onClose()
  }

  const openPickerItem = openIconPickerId ? details.find((d) => d.id === openIconPickerId) : null
  const iconPickerPortal =
    openIconPickerId && iconPickerRect && openPickerItem
      ? createPortal(
          <div
            data-icon-picker
            className="fixed z-[110] bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-64"
            style={{
              top: iconPickerRect.bottom + 4,
              left: iconPickerRect.left,
            }}
          >
            <p className="text-xs font-medium text-gray-500 mb-2">Choose icon</p>
            <div className="grid grid-cols-6 gap-1">
              {CHANNEL_ICON_OPTIONS.map((opt) => {
                const Ico = ICONS_BY_ID[opt.id] || ICONS_BY_ID.mail
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      updateItem(openPickerItem.id, { ...openPickerItem, iconId: opt.id })
                      setOpenIconPickerId(null)
                      setIconPickerRect(null)
                    }}
                    className={`p-2 rounded flex items-center justify-center transition-colors ${openPickerItem.iconId === opt.id ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-300' : 'hover:bg-gray-100 text-gray-600'}`}
                    title={opt.label}
                  >
                    <Ico size={18} strokeWidth={2} />
                  </button>
                )
              })}
            </div>
          </div>,
          document.body
        )
      : null

  const content = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Card details</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4">
          <div className="flex items-center gap-2 mb-3 text-gray-500">
            <span className="text-sm font-medium">Icons</span>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={detailIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                {details.map((item) => (
                  <SortableChannelRow
                    key={item.id}
                    item={item}
                    onUpdate={(next) => updateItem(item.id, next)}
                    onRemove={removeItem}
                    isIconPickerOpen={openIconPickerId}
                    onIconPickerToggle={handleIconPickerToggle}
                    removeTitle={t('common.remove')}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <button
            type="button"
            onClick={addIcon}
            className="mt-3 flex items-center gap-2 text-sm font-medium text-orange-600 hover:text-orange-700 transition-colors"
          >
            <Plus size={16} />
            Add Icon
          </button>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg shadow-sm transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {createPortal(content, document.body)}
      {iconPickerPortal}
    </>
  )
}
