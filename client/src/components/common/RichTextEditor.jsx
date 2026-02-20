import { useState, useLayoutEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'

const RichTextEditor = forwardRef(({ initialContent, onUpdate, onDelete, cardType, onFocusChange, onFontSizeChange, compact = false }, ref) => {
  const { t } = useTranslation()
  const contentRef = useRef(initialContent)
  const editorRef = useRef(null)
  const hasInitializedRef = useRef(false)
  const [isFocused, setIsFocused] = useState(false)

  // Вміст задаємо тільки через ref/effect, щоб React не перезаписував DOM при ре-рендері (dangerouslySetInnerHTML).
  // Один раз при монті — ініціалізація; далі — синхронізація з initialContent лише коли !isFocused.
  useLayoutEffect(() => {
    if (!editorRef.current) return
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true
      editorRef.current.innerHTML = initialContent ?? ''
      contentRef.current = initialContent ?? ''
      return
    }
    if (!isFocused && initialContent !== editorRef.current.innerHTML) {
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

  const getFontSize = () => {
    if (!editorRef.current) return '3';
    editorRef.current.focus();
    const v = document.queryCommandValue('fontSize');
    return (v === '5' || v === '7') ? v : '3';
  }

  const setFontSize = (size) => {
    const s = String(size);
    if (s !== '3' && s !== '5' && s !== '7') return;
    executeCommand('fontSize', s);
    if (onFontSizeChange) onFontSizeChange(s);
  }

  const handleLink = () => {
    const url = prompt(t('common.enterLinkUrl'));
    if (url) executeCommand('createLink', url);
  }

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    toggleBold: () => executeCommand('bold'),
    toggleItalic: () => executeCommand('italic'),
    insertList: () => executeCommand('insertUnorderedList'),
    setFontSize,
    getFontSize,
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
          if (onFontSizeChange) onFontSizeChange(getFontSize())
        }}
        onBlur={handleBlur}
        className={`
          w-full outline-none text-sm text-gray-800 leading-relaxed cursor-text
          ${compact ? 'min-h-[32px]' : 'min-h-[48px]'}
          empty:before:content-[attr(placeholder)] empty:before:text-gray-400
          [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5
          [&>b]:font-bold [&>i]:italic
          [&_font[size="3"]]:!text-[12px] [&_font[size="5"]]:!text-[14px] [&_font[size="7"]]:!text-[18px]
        `}
        placeholder={t('editor.placeholderDescribeDetails')}
        // Використовуємо suppressContentEditableWarning, щоб React не сварився
        suppressContentEditableWarning={true}
      ></div>
      
      {isFocused && (
        <div className="absolute inset-0 pointer-events-none rounded border-2 border-blue-500/20 -m-1"></div>
      )}
    </div>
  )
})

export default RichTextEditor