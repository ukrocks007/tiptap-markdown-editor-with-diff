# TipTap Markdown Editor with Diff & Track Changes

A modern Markdown blog editor built with [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/), and [TipTap](https://tiptap.dev/).  
It features real-time Markdown editing, GitHub-style diff view, and robust track changes (accept/reject) support.

## Features

- **Markdown Editing:** Live editing with TipTap and Markdown serialization.
- **Diff View:** See changes between current and last saved version, with GitHub-style highlights.
- **Track Changes:** Accept/reject insertions and deletions, with inline controls.
- **Rich Content:** Supports images, links, code blocks, lists, blockquotes, and more.
- **User Attribution:** Track changes by user (configurable).
- **Responsive UI:** Clean, modern, and mobile-friendly.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### Installation

```bash
git clone https://github.com/your-username/tiptap-markdown-editor-with-diff.git
cd tiptap-markdown-editor-with-diff
npm install
# or
yarn install
```

### Local Development

Start the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
# or
yarn build
```

Preview the production build:

```bash
npm run preview
# or
yarn preview
```

## Project Structure

- `src/components/BlogEditor.tsx` — Main editor component.
- `src/components/DiffView.tsx` — Markdown diff viewer.
- `src/components/TrackChangesView.tsx` — Track changes controls.
- `src/extensions/TrackChangeExtension.ts` — TipTap extension for track changes.
- `src/components/*.css` — Component styles.

## Customization

- **User Info:** Update `dataOpUserId` and `dataOpUserNickname` in `BlogEditor.tsx` to integrate with your auth system.
- **Styling:** Modify CSS files in `src/components/` and `src/extensions/` for custom themes.

## License

MIT

---

> Built with [Vite](https://vitejs.dev/) + [React](https://react.dev/) + [TipTap](https://tiptap.dev/).
