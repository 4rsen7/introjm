import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Plus, Trash2, User, Briefcase, GraduationCap, Smile, Bot, Baby } from 'lucide-react'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'

const AVATAR_OPTIONS = [
  { id: 'man', icon: User, label: 'Man' },
  { id: 'woman', icon: Smile, label: 'Woman' },
  { id: 'student', icon: GraduationCap, label: 'Student' },
  { id: 'worker', icon: Briefcase, label: 'Worker' },
  { id: 'parent', icon: Baby, label: 'Parent' },
  { id: 'tech', icon: Bot, label: 'Tech' },
]

export default function PersonaModal({ isOpen, onClose, onSave, initialPersona }) {
  const { t } = useTranslation()
  useBodyScrollLock(isOpen)
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    image: '',
    age: '',
    location: '',
    bio: '',
    goals: [''],
    frustrations: ['']
  })
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false)

  useEffect(() => {
    if (isOpen) {
        if (initialPersona) {
            setFormData({
                name: initialPersona.name || '',
                role: initialPersona.role || '',
                image: initialPersona.image || '',
                age: initialPersona.age || '',
                location: initialPersona.location || '',
                bio: initialPersona.bio || '',
                goals: initialPersona.goals?.length ? initialPersona.goals : [''],
                frustrations: initialPersona.frustrations?.length ? initialPersona.frustrations : ['']
            })
        } else {
             setFormData({
                name: '',
                role: '',
                image: '',
                age: '',
                location: '',
                bio: '',
                goals: [''],
                frustrations: ['']
            })
        }
    }
  }, [isOpen, initialPersona])

  if (!isOpen) return null

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleListChange = (listName, index, value) => {
    const newList = [...formData[listName]]
    newList[index] = value
    setFormData(prev => ({ ...prev, [listName]: newList }))
  }

  const addListItem = (listName) => {
    setFormData(prev => ({ ...prev, [listName]: [...prev[listName], ''] }))
  }

  const removeListItem = (listName, index) => {
    const newList = [...formData[listName]]
    newList.splice(index, 1)
    setFormData(prev => ({ ...prev, [listName]: newList }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const cleanedData = {
        ...formData,
        goals: formData.goals.filter(g => g.trim()),
        frustrations: formData.frustrations.filter(f => f.trim())
    }
    onSave(cleanedData)
  }

  const SelectedIcon = AVATAR_OPTIONS.find(opt => opt.id === formData.image)?.icon

  const renderPreview = () => {
    if (SelectedIcon) {
        return <SelectedIcon size={40} className="text-gray-600" />
    }
    if (formData.image && formData.image.startsWith('http')) return <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
    return <span className="text-gray-400 text-xs">Preview</span>
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}></div>
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold text-gray-900">{initialPersona ? t('personas.editPersona') : t('personas.createPersona')}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
            <div className="flex items-start gap-6">
                <div className="shrink-0">
                    <label className="block text-sm font-medium text-gray-700 mb-2 text-center">Avatar</label>
                    <div className="relative">
                        <div 
                            className="w-24 h-24 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden shrink-0 cursor-pointer hover:ring-4 hover:ring-orange-100 transition-all group relative"
                            onClick={() => setIsAvatarMenuOpen(!isAvatarMenuOpen)}
                        >
                            {renderPreview()}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center transition-colors">
                                <span className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-gray-600 bg-white/90 px-2 py-0.5 rounded-full shadow-sm">Change</span>
                            </div>
                        </div>
                        {isAvatarMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-[105]" onClick={() => setIsAvatarMenuOpen(false)}></div>
                                <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 z-[110] p-2 grid grid-cols-3 gap-2">
                                    {AVATAR_OPTIONS.map(opt => (
                                        <button key={opt.id} type="button" onClick={() => { handleChange('image', opt.id); setIsAvatarMenuOpen(false); }} className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${formData.image === opt.id ? 'bg-orange-100 border-orange-500 text-orange-600' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'}`} title={opt.label}>
                                            <opt.icon size={20} />
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex-1 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                        <input className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none transition" value={formData.name} onChange={e => handleChange('name', e.target.value)} placeholder="e.g. Alex Doe" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Role / Job Title</label>
                        <input className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none transition" value={formData.role} onChange={e => handleChange('role', e.target.value)} placeholder="e.g. Software Engineer" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Age</label><input className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none transition" value={formData.age} onChange={e => handleChange('age', e.target.value)} placeholder="32" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Location</label><input className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none transition" value={formData.location} onChange={e => handleChange('location', e.target.value)} placeholder="Kyiv" /></div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none transition h-24 resize-none" value={formData.bio} onChange={e => handleChange('bio', e.target.value)} placeholder="Background story and details..." />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Goals</label>
                    <div className="space-y-2">
                        {formData.goals.map((goal, i) => (
                            <div key={i} className="flex gap-2">
                                <input className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" value={goal} onChange={e => handleListChange('goals', i, e.target.value)} placeholder="Add a goal..." />
                                <button onClick={() => removeListItem('goals', i)} className={`p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition ${i === 0 ? 'invisible pointer-events-none' : ''}`}><Trash2 size={16} /></button>
                            </div>
                        ))}
                        <button onClick={() => addListItem('goals')} className="text-sm text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1"><Plus size={14} /> Add goal</button>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Frustrations</label>
                    <div className="space-y-2">
                        {formData.frustrations.map((item, i) => (
                            <div key={i} className="flex gap-2">
                                <input className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" value={item} onChange={e => handleListChange('frustrations', i, e.target.value)} placeholder="Add a frustration..." />
                                <button onClick={() => removeListItem('frustrations', i)} className={`p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition ${i === 0 ? 'invisible pointer-events-none' : ''}`}><Trash2 size={16} /></button>
                            </div>
                        ))}
                        <button onClick={() => addListItem('frustrations')} className="text-sm text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1"><Plus size={14} /> Add frustration</button>
                    </div>
                </div>
            </div>
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition">Cancel</button>
            <button 
                onClick={handleSubmit} 
                disabled={!formData.name.trim()}
                className={`px-6 py-2 bg-orange-600 text-white font-medium rounded-lg shadow-sm transition ${!formData.name.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:bg-orange-700'}`}
            >
                Save Persona
            </button>
        </div>
      </div>
    </div>
  )
}