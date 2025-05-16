// Command type augmentation for highlightLines
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    temporaryHighlight: {
      /**
       * Temporarily highlight lines in the editor
       */
      highlightLines: (options: HighlightLinesOptions) => ReturnType;
    };
  }
}

import { Extension } from "@tiptap/core";

// Add module augmentation for TipTap commands
import type { RawCommands } from "@tiptap/core";

export interface HighlightLinesOptions {
  startLine: number;
  endLine: number;
  color: string;
}

export const TemporaryHighlightExtension = Extension.create({
  name: "temporaryHighlight",

  addCommands() {
    return {
      highlightLines(options: HighlightLinesOptions) {
        return ({ editor }: { editor: any }) => {
          const { startLine, endLine, color } = options;
          debugger;
          const lines = editor.getText().split("\n");
          let from = 0;
          let to = 0;
          let charCount = 0;
          for (let i = 0; i < lines.length; i++) {
            if (i === startLine - 1) {
              from = charCount;
            }
            if (i === endLine - 1) {
              to = charCount + lines[i].length;
              break;
            }
            charCount += lines[i].length + 1; // +1 for the newline
          }
          if (from < to) {
            editor.commands.setTextSelection({ from, to });
            editor.commands.setMark("highlight", { color });
            setTimeout(() => {
              editor.commands.unsetMark("highlight");
              editor.commands.setTextSelection({ from: to, to: to });
            }, 5000);
          }
          return true;
        };
      },
    } as Partial<RawCommands>;
  },
});

// Only one module augmentation block is needed, and it must be outside the Extension.create call
// Remove the duplicate and misplaced closing bracket
