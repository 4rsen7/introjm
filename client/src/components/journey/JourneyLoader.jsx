import { useState, useEffect } from 'react'

const TIPS = [
  "Click and drag the right side of a stage to resize it",
  "Use the 'Pin' button to keep lanes visible while scrolling",
  "Double click any card title to rename it",
  "You can duplicate entire lanes from the lane menu",
  "Use the hand tool to pan around large maps easily"
]

export default function JourneyLoader() {
  const [progress, setProgress] = useState(0)
  const [tip, setTip] = useState("")

  useEffect(() => {
    setTip(TIPS[Math.floor(Math.random() * TIPS.length)])
    // Start animation after mount
    const timer = setTimeout(() => setProgress(100), 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="fixed inset-0 bg-white z-[9999] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col items-center">
        
        {/* Abstract Skeleton UI */}
        <div className="w-48 h-32 bg-gray-50 rounded-xl border border-gray-100 p-4 mb-8 relative shadow-sm">
           <div className="flex gap-3 mb-4">
             <div className="w-8 h-8 rounded-md bg-gray-200 animate-pulse"></div>
             <div className="flex-1 h-8 rounded-md bg-gray-200 animate-pulse"></div>
           </div>
           <div className="space-y-2">
             <div className="h-3 w-full rounded bg-gray-200 animate-pulse delay-75"></div>
             <div className="h-3 w-5/6 rounded bg-gray-200 animate-pulse delay-100"></div>
             <div className="h-3 w-4/6 rounded bg-gray-200 animate-pulse delay-150"></div>
           </div>
        </div>

        <h2 className="text-lg font-bold text-gray-900 mb-2">Setting up your map...</h2>
        
        {/* Progress Bar */}
        <div className="h-1 w-64 bg-gray-100 rounded-full overflow-hidden mb-4">
          <div 
            className="h-full bg-blue-600 transition-all duration-[2000ms] ease-out rounded-full"
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        <p className="text-xs text-gray-500 font-medium text-center h-4 animate-in fade-in duration-700">
          <span className="font-bold text-gray-400 uppercase tracking-wider mr-2">Tip:</span>
          {tip}
        </p>
      </div>
    </div>
  )
}