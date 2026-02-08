import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'

const RichTextEditor = forwardRef(({ initialContent, onUpdate, onDelete, cardType, onFocusChange }, ref) => {
  // Ми не використовуємо content як state для рендеру, щоб не було конфліктів.
  // State потрібен тільки для порівняння при blur.
  const contentRef = useRef(initialContent)
  const editorRef = useRef(null)
  const [isFocused, setIsFocused] = useState(false)

  // Оновлюємо вміст ТІЛЬКИ якщо він прийшов новий ззовні (наприклад, з бази даних),
  // і він відрізняється від того, що ми зараз бачимо.
  useEffect(() => {
    if (
      editorRef.current && 
      initialContent !== editorRef.current.innerHTML && 
      !isFocused // Не чіпаємо, якщо користувач саме зараз працює з цим полем
    ) {
      editorRef.current.innerHTML = initialContent
      contentRef.current = initialContent
    }
  }, [initialContent, isFocused])

  const handleInput = (e) => {
    // Просто запам'ятовуємо поточне значення в ref, не викликаючи перерендер React
    contentRef.current = e.currentTarget.innerHTML
  }

  const handleBlur = () => {
    setIsFocused(false)
    if (onFocusChange) onFocusChange(false)
    // Відправляємо зміни нагору тільки коли користувач закінчив
    if (contentRef.current !== initialContent) {
      onUpdate(contentRef.current)
    }
  }

  const executeCommand = (command, value = null) => {
    // onMouseDown={(e) => e.preventDefault()} на кнопках вже робить свою справу,
    // але про всяк випадок:
    document.execCommand(command, false, value)
    if (editorRef.current) {
        editorRef.current.focus()
        // Оновлюємо ref після команди (наприклад, після Bold)
        contentRef.current = editorRef.current.innerHTML
    }
  }

  const handleFontSize = () => {
    // Cycle sizes: 3 (default) -> 5 (large) -> 7 (xl) -> 3
    const current = document.queryCommandValue('fontSize');
    let next = '3';
    if (current === '3' || !current) next = '5';
    else if (current === '5') next = '7';
    else next = '3';
    executeCommand('fontSize', next);
  }

  const handleLink = () => {
    const url = prompt('Enter link URL:');
    if (url) executeCommand('createLink', url);
  }

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    toggleBold: () => executeCommand('bold'),
    toggleItalic: () => executeCommand('italic'),
    insertList: () => executeCommand('insertUnorderedList'),
    cycleFontSize: handleFontSize,
    addLink: handleLink
  }))

  return (
    <div className="relative group/editor">
      {/* EDITABLE AREA */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onFocus={() => {
          setIsFocused(true)
          if (onFocusChange) onFocusChange(true)
        }}
        onBlur={handleBlur}
        className={`
          w-full min-h-[48px] outline-none text-sm text-gray-800 leading-relaxed cursor-text
          empty:before:content-[attr(placeholder)] empty:before:text-gray-400
          [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5
          [&>b]:font-bold [&>i]:italic
        `}
        placeholder="Describe details..."
        // Використовуємо suppressContentEditableWarning, щоб React не сварився
        suppressContentEditableWarning={true}
        dangerouslySetInnerHTML={{ __html: initialContent }}
      ></div>
      
      {isFocused && (
        <div className="absolute inset-0 pointer-events-none rounded border-2 border-blue-500/20 -m-1"></div>
      )}
    </div>
  )
})

export default RichTextEditor