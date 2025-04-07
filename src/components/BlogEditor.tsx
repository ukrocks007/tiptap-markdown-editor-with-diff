import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Markdown } from 'tiptap-markdown' // Import Markdown extension
import { common, createLowlight } from 'lowlight'
import { useState, useEffect } from 'react'
import DiffMatchPatch from 'diff-match-patch'
import { marked } from 'marked' // Import marked for markdown to HTML conversion
import DiffView from './DiffView'; // Import the DiffView component

const lowlight = createLowlight(common)
const dmp = new DiffMatchPatch()

import './BlogEditor.css'

const BlogEditor = () => {
  const [versions, setVersions] = useState<string[]>([])
  const [showDiff, setShowDiff] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'blog-link',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'blog-image',
        },
      }),
      Placeholder.configure({
        placeholder: 'Start writing your blog post...',
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Markdown.configure({ // Add Markdown extension
        html: false, // Disable HTML parsing if you want strict Markdown
      }),
    ],
    editorProps: {
      attributes: {
        class: 'blog-editor-content',
      },
    },
    onUpdate: ({ editor }) => {
      const currentContent = editor.storage.markdown.getMarkdown()
      setHasChanges(currentContent !== (versions[versions.length - 1] || ""))
      setShowDiff(false)
    },
    content: '', // Initialize with empty content
  })

  // Set initial content as last saved content when editor is ready
  useEffect(() => {
    if (editor) {
      setVersions((prev: any) => [...prev, editor.storage.markdown.getMarkdown()])
    }
  }, [editor])

  const addLink = () => {
    const url = window.prompt('Enter the URL')
    if (url && editor) {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }

  const addImage = () => {
    const url = window.prompt('Enter the image URL')
    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run()
    }
  }

  const handleSave = () => {
    if (editor) {
      const currentContent = editor.storage.markdown.getMarkdown()
      setVersions(prev => [...prev, currentContent])
      setShowDiff(true)
      setHasChanges(false)
    }
  }

  if (!editor) {
    return null
  }

  return (
    <div className="blog-editor">
      <div className="editor-toolbar">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'is-active' : ''}
        >
          Bold
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'is-active' : ''}
        >
          Italic
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={editor.isActive('strike') ? 'is-active' : ''}
        >
          Strike
        </button>
        <button onClick={addLink}>Link</button>
        <button onClick={addImage}>Image</button>
        <button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={editor.isActive('codeBlock') ? 'is-active' : ''}
        >
          Code Block
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'is-active' : ''}
        >
          Bullet List
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? 'is-active' : ''}
        >
          Ordered List
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={editor.isActive('blockquote') ? 'is-active' : ''}
        >
          Blockquote
        </button>
      </div>
      <EditorContent editor={editor} />
      {hasChanges && (
        <button className="save-button" onClick={handleSave}>
          Save Changes
        </button>
      )}
      <DiffView
        currentContent={versions[versions.length - 1] || ''}
        lastSavedContent={versions[versions.length - 2] || ''}
        showDiff={showDiff}
      />
    </div>
  )
}

export default BlogEditor