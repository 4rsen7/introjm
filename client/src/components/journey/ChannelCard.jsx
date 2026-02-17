import { ICONS_BY_ID, getDefaultChannelDetails } from './channelOptions'

function toAbsoluteUrl(link) {
  const s = (link || '').trim()
  if (!s) return s
  if (/^https?:\/\//i.test(s)) return s
  return `https://${s}`
}

export default function ChannelCard({ card, onUpdate }) {
  const selectedChannels = card.channels || []
  const details = (card.channelDetails && card.channelDetails.length > 0)
    ? card.channelDetails
    : getDefaultChannelDetails()

  const toggleChannel = (channelId) => {
    const newChannels = selectedChannels.includes(channelId)
      ? selectedChannels.filter((id) => id !== channelId)
      : [...selectedChannels, channelId]
    onUpdate({ ...card, channels: newChannels })
  }

  const list = details.map((ch) => {
    const Icon = ICONS_BY_ID[ch.iconId] || ICONS_BY_ID.email
    const isSelected = selectedChannels.includes(ch.id)
    const colorStyle = ch.color ? { color: ch.color } : {}
    return (
      <div
        key={ch.id}
        onClick={() => toggleChannel(ch.id)}
        className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-all select-none ${isSelected ? 'bg-indigo-50/50' : 'hover:bg-gray-50'}`}
      >
        <div
          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300 bg-white'}`}
        >
          {isSelected && (
            <svg
              viewBox="0 0 24 24"
              className="w-3 h-3 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
        <Icon size={14} className={isSelected ? 'text-indigo-600' : 'text-gray-400'} style={colorStyle} />
        {ch.link ? (
          <a
            href={toAbsoluteUrl(ch.link)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`text-xs ${isSelected ? 'text-indigo-900 font-medium' : 'text-gray-600'} underline hover:text-indigo-700`}
          >
            {ch.label}
          </a>
        ) : (
          <span className={`text-xs ${isSelected ? 'text-indigo-900 font-medium' : 'text-gray-600'}`}>{ch.label}</span>
        )}
      </div>
    )
  })

  return <div className="p-2 flex flex-col gap-1">{list}</div>
}
