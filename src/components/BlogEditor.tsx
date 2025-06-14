import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown' // Import Markdown extension
import { useState, useEffect } from 'react'
import DiffView from './DiffView'; // Import the DiffView component

import TrackChangeExtension from '../extensions/TrackChangeExtension' // Import our TrackChangeExtension
import TrackChangesView from './TrackChangesView' // Import the TrackChangesView component
import { TemporaryHighlightExtension } from '../extensions/TemporaryHighlightExtension';
import Highlight from '../extensions/Highlight';

import './BlogEditor.css'

const BlogEditor = () => {
  const [versions, setVersions] = useState<string[]>([])
  const [showDiff, setShowDiff] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [trackingEnabled, setTrackingEnabled] = useState(false)

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
      Markdown.configure({ // Add Markdown extension
        html: false, // Disable HTML parsing if you want strict Markdown
      }),
      Highlight,
      TemporaryHighlightExtension,
      TrackChangeExtension.configure({
        enabled: trackingEnabled,
        onStatusChange: (status: boolean) => setTrackingEnabled(status),
        dataOpUserId: 'current-user', // This could be fetched from your auth system
        dataOpUserNickname: 'Current User', // This could be fetched from your auth system
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

  // Randomly change a line or a few words in the editor content
  const randomEdit = () => {
    if (!editor) return;
    const content = editor.storage.markdown.getMarkdown();
    const lines = content.split('\n');
    if (lines.length === 0) return;

    // Pick a random line
    const lineIdx = Math.floor(Math.random() * lines.length);
    let line = lines[lineIdx];

    // 50% chance to replace whole line, 50% to replace a few words
    if (Math.random() < 0.5 || line.trim() === "") {
      // Replace the whole line with random text
      const randomTexts = [
        "This is a random update.",
        "Lorem ipsum dolor sit amet.",
        "Randomly changed line!",
        "Another random edit here.",
        "Updated by random edit button."
      ];
      line = randomTexts[Math.floor(Math.random() * randomTexts.length)];
    } else {
      // Replace a few words in the line
      const words = line.split(' ');
      if (words.length > 0) {
        const wordIdx = Math.floor(Math.random() * words.length);
        words[wordIdx] = "✨random✨";
        line = words.join(' ');
      }
    }
    lines[lineIdx] = line;
    const newContent = lines.join('\n');
    editor.commands.setContent(newContent, false); // false = don't emit new history event
  };


  // State for highlight command UI
  const [highlightStart, setHighlightStart] = useState(1);
  const [highlightEnd, setHighlightEnd] = useState(1);
  const [highlightColor, setHighlightColor] = useState('#ffff00');

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
        <button onClick={randomEdit}>Random Edit</button>
        {/* Highlight lines UI */}
        <div style={{ display: 'inline-block', marginLeft: 16 }}>
          <input
            type="number"
            min={1}
            value={highlightStart}
            onChange={e => setHighlightStart(Number(e.target.value))}
            style={{ width: 50 }}
            placeholder="Start"
            title="Start Line"
          />
          <input
            type="number"
            min={highlightStart}
            value={highlightEnd}
            onChange={e => setHighlightEnd(Number(e.target.value))}
            style={{ width: 50, marginLeft: 4 }}
            placeholder="End"
            title="End Line"
          />
          <input
            type="color"
            value={highlightColor}
            onChange={e => setHighlightColor(e.target.value)}
            style={{ marginLeft: 4 }}
            title="Highlight Color"
          />
          <button
            style={{ marginLeft: 4 }}
            onClick={() => {
              debugger;
              editor.commands.highlightLines({
                startLine: highlightStart,
                endLine: highlightEnd,
                color: highlightColor,
              });
            }}
          >
            Highlight Lines
          </button>
        </div>
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
      <TrackChangesView
        editor={editor}
        trackingEnabled={trackingEnabled}
        setTrackingEnabled={setTrackingEnabled}
      />
    </div>
  )
}

export default BlogEditor