import { Mail, MessageSquare, Phone, Facebook, Store } from 'lucide-react'

const CHANNELS = [
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'sms', label: 'SMS', icon: MessageSquare },
  { id: 'phone', label: 'Phone', icon: Phone },
  { id: 'social', label: 'Social Media', icon: Facebook },
  { id: 'store', label: 'In-Store', icon: Store },
]

export default function ChannelCard({ card, onUpdate }) {
  const selectedChannels = card.channels || []

  const toggleChannel = (channelId) => {
    const newChannels = selectedChannels.includes(channelId)
      ? selectedChannels.filter(id => id !== channelId)
      : [...selectedChannels, channelId]
    onUpdate({ ...card, channels: newChannels })
  }

  return (
    <div className="p-2 flex flex-col gap-1">
      {CHANNELS.map(ch => {
        const isSelected = selectedChannels.includes(ch.id)
        return (
          <div 
            key={ch.id} 
            onClick={() => toggleChannel(ch.id)}
            className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-all select-none ${isSelected ? 'bg-indigo-50/50' : 'hover:bg-gray-50'}`}
          >
            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300 bg-white'}`}>
               {isSelected && <svg viewBox="0 0 24 24" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
            </div>
            <ch.icon size={14} className={isSelected ? 'text-indigo-600' : 'text-gray-400'} />
            <span className={`text-xs ${isSelected ? 'text-indigo-900 font-medium' : 'text-gray-600'}`}>{ch.label}</span>
          </div>
        )
      })}
    </div>
  )
}