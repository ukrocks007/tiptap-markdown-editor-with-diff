import { Mark, mergeAttributes } from "@tiptap/core";

export interface HighlightOptions {
  color: string;
}

const Highlight = Mark.create<HighlightOptions>({
  name: "highlight",

  addOptions() {
    return {
      color: "yellow",
    };
  },

  addAttributes() {
    return {
      color: {
        default: this.options.color,
        parseHTML: (element) =>
          element.style.backgroundColor || this.options.color,
        renderHTML: (attributes) => {
          return {
            style: `background-color: ${attributes.color}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        style: "background-color",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
});

export default Highlight;
