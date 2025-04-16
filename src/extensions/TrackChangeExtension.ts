import { ReplaceStep, Step } from "@tiptap/pm/transform";
import { TextSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { Slice, Fragment } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  Extension,
  Mark,
  getMarkRange,
  getMarksBetween,
  isMarkActive,
  mergeAttributes,
} from "@tiptap/core";
import type { CommandProps, Editor, MarkRange } from "@tiptap/core";
import "./TrackChangeExtension.css";

const LOG_ENABLED = true;

export const MARK_DELETION = "deletion";
export const MARK_INSERTION = "insertion";
export const EXTENSION_NAME = "trackchange";

// Track Change Operations
export const TRACK_COMMAND_ACCEPT = "accept";
export const TRACK_COMMAND_ACCEPT_ALL = "accept-all";
export const TRACK_COMMAND_REJECT = "reject";
export const TRACK_COMMAND_REJECT_ALL = "reject-all";

export type TRACK_COMMAND_TYPE =
  | "accept"
  | "accept-all"
  | "reject"
  | "reject-all";

// Define the extension options type
export interface TrackChangeOptions {
  /**
   * Enable/disable track changes
   */
  enabled: boolean;
  /**
   * Callback for when the track changes status changes
   */
  onStatusChange?: (enabled: boolean) => void;
  /**
   * User ID for tracking changes
   */
  dataOpUserId?: string;
  /**
   * User nickname for tracking changes
   */
  dataOpUserNickname?: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    trackchange: {
      /**
       * Set the track change extension enabled status
       * @param enabled Whether track changes should be enabled
       */
      setTrackChangeStatus: (enabled: boolean) => ReturnType;

      /**
       * Get the current track change status
       */
      getTrackChangeStatus: () => ReturnType;

      /**
       * Toggle the track change extension enabled status
       */
      toggleTrackChangeStatus: () => ReturnType;

      /**
       * Accept one change at the current selection or cursor position
       */
      acceptChange: () => ReturnType;

      /**
       * Accept all changes throughout the document
       */
      acceptAllChanges: () => ReturnType;

      /**
       * Reject one change at the current selection or cursor position
       */
      rejectChange: () => ReturnType;

      /**
       * Reject all changes throughout the document
       */
      rejectAllChanges: () => ReturnType;

      /**
       * Update user information for tracking changes
       * @param opUserId User ID for tracking changes
       * @param opUserNickname User nickname for tracking changes
       */
      updateOpUserOption: (
        opUserId: string,
        opUserNickname: string
      ) => ReturnType;
    };
  }
}

/**
 * Mark for tracking inserted content
 */
export const InsertionMark = Mark.create({
  name: MARK_INSERTION,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      "data-op-user-id": {
        default: null,
      },
      "data-op-user-nickname": {
        default: null,
      },
      "data-op-date": {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "insert",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // Add a common class plus specific class if needed
    const finalAttrs = mergeAttributes(
      this.options.HTMLAttributes,
      HTMLAttributes,
      {
        class: `tracked-change insert`, // Add 'tracked-change' class
      }
    );
    return ["insert", finalAttrs, 0];
  },

  // Used to convert the mark to plain text when copying
  renderText({ node }: { node: any }) {
    return node.text || "";
  },
});

/**
 * Mark for tracking deleted content
 */
export const DeletionMark = Mark.create({
  name: MARK_DELETION,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      "data-op-user-id": {
        default: null,
      },
      "data-op-user-nickname": {
        default: null,
      },
      "data-op-date": {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "delete",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // Add a common class plus specific class if needed
    const finalAttrs = mergeAttributes(
      this.options.HTMLAttributes,
      HTMLAttributes,
      {
        class: `tracked-change delete`, // Add 'tracked-change' class
      }
    );
    return ["delete", finalAttrs, 0];
  },

  // Used to convert the mark to plain text when copying
  renderText({ node }: { node: any }) {
    return node.text || "";
  },
});

// Helper to get self extension instance by name
const getSelfExt = (editor: Editor) =>
  editor.extensionManager.extensions.find(
    (item) => item.type === "extension" && item.name === EXTENSION_NAME
  ) as Extension;

// Get the current minute time to avoid splitting marks too frequently
const getMinuteTime = () =>
  Math.round(new Date().getTime() / 1000 / 60) * 1000 * 60;

/**
 * Accept or reject tracked changes for all content or just the selection
 * @param opType operation to apply
 * @param param a command props, so we can get the editor, tr prop
 * @returns boolean indicating command completion
 */
const changeTrack = (
  opType: TRACK_COMMAND_TYPE,
  param: CommandProps
): boolean => {
  // Get the range to deal with, use selection by default
  const from = param.editor.state.selection.from;
  const to = param.editor.state.selection.to;

  let markRanges: Array<MarkRange> = [];

  // Deal with different scenarios based on operation type and selection
  if (
    (opType === TRACK_COMMAND_ACCEPT || opType === TRACK_COMMAND_REJECT) &&
    from === to
  ) {
    // Detect left mark when cursor is at a point (no selection)
    const isInsertBeforeCursor = isMarkActive(
      param.editor.state,
      MARK_INSERTION
    );
    const isDeleteBeforeCursor = isMarkActive(
      param.editor.state,
      MARK_DELETION
    );
    let leftRange;
    if (isInsertBeforeCursor) {
      leftRange = getMarkRange(
        param.editor.state.selection.$from,
        param.editor.state.doc.type.schema.marks.insertion
      );
    } else if (isDeleteBeforeCursor) {
      leftRange = getMarkRange(
        param.editor.state.selection.$from,
        param.editor.state.doc.type.schema.marks.deletion
      );
    }
    if (leftRange) {
      markRanges = getMarksBetween(
        leftRange.from,
        leftRange.to,
        param.editor.state.doc
      );
    }
  } else if (
    opType === TRACK_COMMAND_ACCEPT_ALL ||
    opType === TRACK_COMMAND_REJECT_ALL
  ) {
    // Process all content in the document
    markRanges = getMarksBetween(
      0,
      param.editor.state.doc.content.size,
      param.editor.state.doc
    );
    // Convert the operation type to the non-all variant
    opType =
      opType === TRACK_COMMAND_ACCEPT_ALL
        ? TRACK_COMMAND_ACCEPT
        : TRACK_COMMAND_REJECT;
  } else {
    // Process just the selected range
    markRanges = getMarksBetween(from, to, param.editor.state.doc);
  }

  // Filter to only include track change marks
  markRanges = markRanges.filter(
    (markRange) =>
      markRange.mark.type.name === MARK_DELETION ||
      markRange.mark.type.name === MARK_INSERTION
  );

  if (!markRanges.length) {
    return false;
  }

  const currentTr = param.tr;

  // Record offset when deleting content to maintain correct positions
  let offset = 0;
  const removeInsertMark =
    param.editor.state.doc.type.schema.marks.insertion.create();
  const removeDeleteMark =
    param.editor.state.doc.type.schema.marks.deletion.create();

  markRanges.forEach((markRange) => {
    const isAcceptInsert =
      opType === TRACK_COMMAND_ACCEPT &&
      markRange.mark.type.name === MARK_INSERTION;
    const isRejectDelete =
      opType === TRACK_COMMAND_REJECT &&
      markRange.mark.type.name === MARK_DELETION;

    if (isAcceptInsert || isRejectDelete) {
      // Remove mark for accepted insertions or rejected deletions
      currentTr.removeMark(
        markRange.from - offset,
        markRange.to - offset,
        removeInsertMark.type
      );
      currentTr.removeMark(
        markRange.from - offset,
        markRange.to - offset,
        removeDeleteMark.type
      );
    } else {
      // Remove content for accepted deletions or rejected insertions
      currentTr.deleteRange(markRange.from - offset, markRange.to - offset);
      // Update offset for subsequent operations
      offset += markRange.to - markRange.from;
    }
  });

  if (currentTr.steps.length) {
    // Set metadata to indicate this is a manual track change operation
    currentTr.setMeta("trackManualChanged", true);

    currentTr.setMeta("track-change-update", true);
    param.editor.view.dispatch(currentTr);
  }

  return false;
};

/**
 * Extension for tracking changes in TipTap documents
 */
export const TrackChangeExtension = Extension.create<TrackChangeOptions>({
  name: EXTENSION_NAME,

  addOptions() {
    return {
      enabled: false,
      onStatusChange: undefined,
      dataOpUserId: "",
      dataOpUserNickname: "",
    };
  },

  onCreate() {
    if (this.options.onStatusChange) {
      this.options.onStatusChange(this.options.enabled);
    }
  },

  addExtensions() {
    return [InsertionMark, DeletionMark];
  },

  addCommands() {
    return {
      setTrackChangeStatus: (enabled: boolean) => (param: CommandProps) => {
        const thisExtension = getSelfExt(param.editor);
        thisExtension.options.enabled = enabled;
        if (thisExtension.options.onStatusChange) {
          thisExtension.options.onStatusChange(thisExtension.options.enabled);
        }
        return false;
      },

      toggleTrackChangeStatus: () => (param: CommandProps) => {
        const thisExtension = getSelfExt(param.editor);
        thisExtension.options.enabled = !thisExtension.options.enabled;
        if (thisExtension.options.onStatusChange) {
          thisExtension.options.onStatusChange(thisExtension.options.enabled);
        }
        return false;
      },

      getTrackChangeStatus: () => (param: CommandProps) => {
        const thisExtension = getSelfExt(param.editor);
        return thisExtension.options.enabled;
      },

      acceptChange: () => (param: CommandProps) => {
        changeTrack("accept", param);
        return false;
      },

      acceptAllChanges: () => (param: CommandProps) => {
        changeTrack("accept-all", param);
        return false;
      },

      rejectChange: () => (param: CommandProps) => {
        changeTrack("reject", param);
        return false;
      },

      rejectAllChanges: () => (param: CommandProps) => {
        changeTrack("reject-all", param);
        return false;
      },

      updateOpUserOption:
        (opUserId: string, opUserNickname: string) => (param: CommandProps) => {
          const thisExtension = getSelfExt(param.editor);
          thisExtension.options.dataOpUserId = opUserId;
          thisExtension.options.dataOpUserNickname = opUserNickname;
          return false;
        },
    };
  },
  // @ts-ignore
  onSelectionUpdate({ transaction, editor }) {
    // Log selection status for debugging
    LOG_ENABLED &&
      console.log(
        "selection and input status",
        transaction.selection.from,
        transaction.selection.to,
        editor.view.composing
      );
  },

  addProseMirrorPlugins() {
    let floatingButtons: HTMLElement | null = null;
    let hideTimeout: ReturnType<typeof setTimeout> | null = null;
    let lastFloatingId: string | null = null;

    const createChangeDecorations = (doc: any, marks: MarkRange[]) => {
      const decos: any[] = [];
      marks.forEach((markRange) => {
        const isInsertMark = markRange.mark.type.name === MARK_INSERTION;
        const isDeleteMark = markRange.mark.type.name === MARK_DELETION;
        if (isInsertMark || isDeleteMark) {
          const actionButtons = document.createElement("div");
          actionButtons.className = "track-change-action-buttons";
          actionButtons.setAttribute("data-track-change-id", `change-${markRange.from}-${markRange.to}`);
          actionButtons.style.display = "none"; // Always hidden until JS shows it

          // Accept button
          const acceptButton = document.createElement("button");
          acceptButton.className = "track-change-action-button accept";
          acceptButton.setAttribute("title", "Accept change");
          acceptButton.setAttribute("aria-label", "Accept change");
          acceptButton.setAttribute("data-mark-range", JSON.stringify(markRange));
          acceptButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><polyline points="20 6 9 17 4 12"/></svg>`;
          // --- ADD: Use mousedown for immediate action ---
          acceptButton.addEventListener("mousedown", (e) => {
            e.preventDefault();
            // Find the editor instance and dispatch the accept command
            const editorView = (window as any).tiptapEditorView || undefined;
            if (editorView && editorView.editor && editorView.editor.commands) {
              editorView.editor.commands.acceptChange();
            } else if (acceptButton.closest('.ProseMirror')) {
              // Fallback: dispatch command via ProseMirror view if available
              const pmView = acceptButton.closest('.ProseMirror') as any;
              if (pmView && pmView.editor && pmView.editor.commands) {
                pmView.editor.commands.acceptChange();
              }
            }
          });
          // --- END ADD ---
          actionButtons.appendChild(acceptButton);

          // Reject button
          const rejectButton = document.createElement("button");
          rejectButton.className = "track-change-action-button reject";
          rejectButton.setAttribute("title", "Reject change");
          rejectButton.setAttribute("aria-label", "Reject change");
          rejectButton.setAttribute("data-mark-range", JSON.stringify(markRange));
          rejectButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-ccw"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;
          // --- ADD: Use mousedown for immediate action ---
          rejectButton.addEventListener("mousedown", (e) => {
            e.preventDefault();
            const editorView = (window as any).tiptapEditorView || undefined;
            if (editorView && editorView.editor && editorView.editor.commands) {
              editorView.editor.commands.rejectChange();
            } else if (rejectButton.closest('.ProseMirror')) {
              const pmView = rejectButton.closest('.ProseMirror') as any;
              if (pmView && pmView.editor && pmView.editor.commands) {
                pmView.editor.commands.rejectChange();
              }
            }
          });
          // --- END ADD ---
          actionButtons.appendChild(rejectButton);

          const widgetDeco = Decoration.widget(markRange.to, actionButtons, {
            side: 1,
            key: `change-${markRange.from}-${markRange.to}`,
            stopEvent: (event) => {
              if ((event.target as HTMLElement)?.closest(".track-change-action-button")) {
                return true;
              }
              return false;
            },
          });

          const inlineDeco = Decoration.inline(
            markRange.from,
            markRange.to,
            {
              class: `track-change-inline ${isInsertMark ? "insert" : "delete"}-mark`,
              nodeName: "span",
              "data-track-change-id": `change-${markRange.from}-${markRange.to}`,
            },
            {
              inclusiveEnd: true,
              inclusiveStart: true,
              key: `change-inline-${markRange.from}-${markRange.to}`,
            }
          );

          decos.push(inlineDeco, widgetDeco);
        }
      });
      return DecorationSet.create(doc, decos);
    };

    const showFloatingButtons = (buttonsContainer: HTMLElement, event: MouseEvent) => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
      const floatingId = buttonsContainer.getAttribute("data-track-change-id");
      // Only reposition if not already visible for this mark
      if (
        !floatingButtons ||
        floatingButtons !== buttonsContainer ||
        lastFloatingId !== floatingId ||
        buttonsContainer.style.display === "none"
      ) {
        if (!buttonsContainer.isConnected || buttonsContainer.parentNode !== document.body) {
          document.body.appendChild(buttonsContainer);
        }
        buttonsContainer.style.position = "fixed";
        buttonsContainer.style.left = `${event.clientX + 8}px`;
        buttonsContainer.style.top = `${event.clientY + 8}px`;
        buttonsContainer.style.display = "flex";
        buttonsContainer.style.zIndex = "1000";
        floatingButtons = buttonsContainer;
        lastFloatingId = floatingId || null;
      }
      // Add listeners only once
      if (!(buttonsContainer as any)._trackChangeListenersAdded) {
        buttonsContainer.addEventListener("mouseenter", () => {
          if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
          }
        });
        buttonsContainer.addEventListener("mouseleave", () => {
          hideFloatingButtons(100);
        });
        (buttonsContainer as any)._trackChangeListenersAdded = true;
      }
    };

    const hideFloatingButtons = (delay = 0) => {
      if (hideTimeout) clearTimeout(hideTimeout);
      if (!floatingButtons) return;
      const doHide = () => {
        if (floatingButtons) {
          floatingButtons.style.display = "none";
          if (floatingButtons.parentNode === document.body) {
            document.body.removeChild(floatingButtons);
          }
          floatingButtons = null;
          lastFloatingId = null;
        }
        hideTimeout = null;
      };
      if (delay > 0) {
        hideTimeout = setTimeout(doHide, delay);
      } else {
        doHide();
      }
    };

    const decorationPlugin = new Plugin({
      key: new PluginKey("track-change-decorations"),
      state: {
        init(_, { doc }) {
          const marks = getMarksBetween(0, doc.content.size, doc);
          return createChangeDecorations(doc, marks);
        },
        apply(tr, old) {
          if (tr.docChanged || tr.getMeta("track-change-update")) {
            const marks = getMarksBetween(0, tr.doc.content.size, tr.doc);
            return createChangeDecorations(tr.doc, marks);
          }
          return old;
        },
      },
      props: {
        decorations(state) {
          return this.getState(state);
        },
        handleDOMEvents: {
          mouseover(view, event) {
            const target = event.target as HTMLElement;
            const trackChangeSpan = target.closest('[data-track-change-id]');
            if (trackChangeSpan) {
              const trackChangeId = trackChangeSpan.getAttribute('data-track-change-id');
              const buttonsContainer = view.dom.querySelector(
                `.track-change-action-buttons[data-track-change-id="${trackChangeId}"]`
              ) as HTMLElement | null;
              if (buttonsContainer) {
                // Only show and position if not already visible for this mark
                showFloatingButtons(buttonsContainer, event as MouseEvent);
              }
            }
            return false;
          },
          mouseout(view, event) {
            const target = event.target as HTMLElement;
            const trackChangeSpan = target.closest('[data-track-change-id]');
            if (trackChangeSpan && floatingButtons) {
              const relatedTarget = event.relatedTarget as HTMLElement;
              if (relatedTarget && relatedTarget.closest('.track-change-action-buttons')) {
                return false;
              }
              hideFloatingButtons(100);
            }
            return false;
          },
          blur() {
            hideFloatingButtons(0);
            return false;
          }
        }
      },
    });

    return [decorationPlugin];
  },

  onTransaction: ({ editor, transaction }) => {
    // Skip if no document changes
    if (!transaction.docChanged) {
      return;
    }

    // Skip if change by accept/reject commands
    if (transaction.getMeta("trackManualChanged")) {
      return;
    }

    // Skip if undo/redo
    if (transaction.getMeta("history$")) {
      return;
    }

    // Skip if synced from another client
    const syncMeta = transaction.getMeta("y-sync$");
    if (syncMeta && syncMeta.isChangeOrigin) {
      LOG_ENABLED && console.log("sync from origin", syncMeta);
      return;
    }

    // Skip if no steps
    if (!transaction.steps.length) {
      LOG_ENABLED && console.log("none content change");
      return;
    }

    // Check if transaction was applied to editor
    const isThisTrApplied = transaction.before !== editor.state.tr.doc;
    const thisExtension = getSelfExt(editor);
    const trackChangeEnabled = thisExtension.options.enabled;

    LOG_ENABLED && console.warn(transaction.steps.length, transaction);

    // Copy steps to avoid modifying original
    const allSteps = transaction.steps.map((step) =>
      Step.fromJSON(editor.state.doc.type.schema, step.toJSON())
    );

    LOG_ENABLED && console.log("allSteps", allSteps);

    // Get current cursor position
    const currentNewPos = transaction.selection.from;
    LOG_ENABLED && console.log("currentNewPos", currentNewPos);

    // Calculate cursor offset
    let posOffset = 0;
    let hasAddAndDelete = false;

    // Analyze steps to determine cursor positioning
    allSteps.forEach((step: Step, _index: number, _arr: Step[]) => {
      if (step instanceof ReplaceStep) {
        let delCount = 0;
        if (step.from !== step.to) {
          const slice = transaction.docs[_index].slice(step.from, step.to);
          slice.content.forEach((node) => {
            const isInsertNode = node.marks.find(
              (m) => m.type.name === MARK_INSERTION
            );
            if (!isInsertNode) {
              delCount += node.nodeSize;
            }
          });
        }
        posOffset += delCount;

        // Check if content was both added and deleted
        const newCount = step.slice ? step.slice.size : 0;
        if (newCount && delCount) {
          hasAddAndDelete = true;
        }
      }
    });

    LOG_ENABLED &&
      console.table({
        hasAddAndDelete,
        posOffset,
      });

    // Get transaction to manipulate
    const newChangeTr = isThisTrApplied ? editor.state.tr : transaction;

    // Process each step
    let reAddOffset = 0;
    allSteps.forEach((step: Step, index: number) => {
      if (step instanceof ReplaceStep) {
        const invertedStep = step.invert(transaction.docs[index]);

        // Handle new content
        if (step.slice.size) {
          const insertionMark =
            editor.state.doc.type.schema.marks.insertion.create({
              "data-op-user-id": thisExtension.options.dataOpUserId,
              "data-op-user-nickname": thisExtension.options.dataOpUserNickname,
              "data-op-date": getMinuteTime(),
            });
          const deletionMark =
            editor.state.doc.type.schema.marks.deletion.create();

          const from = step.from + reAddOffset;
          const to = step.from + reAddOffset + step.slice.size;

          if (trackChangeEnabled) {
            // Add insertion mark to new content
            newChangeTr.addMark(from, to, insertionMark);
          } else {
            // Remove auto-applied track marks if extension disabled
            newChangeTr.removeMark(from, to, insertionMark.type);
          }

          // Always remove auto-applied deletion marks
          newChangeTr.removeMark(from, to, deletionMark.type);
        }

        // Handle deleted content
        if (step.from !== step.to && trackChangeEnabled) {
          LOG_ENABLED && console.log("find content to readd", step);

          // Collect content to skip re-adding (content with insertion mark)
          const skipSteps: Array<ReplaceStep> = [];

          LOG_ENABLED && console.log("invertedStep", invertedStep);

          // Create step to re-add deleted content
          const reAddStep = new ReplaceStep(
            invertedStep.from + reAddOffset,
            invertedStep.from + reAddOffset,
            invertedStep.slice,
            // @ts-ignore
            invertedStep.structure
          );

          // Track offset for empty steps
          let addedEmptyOffset = 0;

          // Traverse content to find nodes with insertion marks
          const travelContent = (content: Fragment, parentOffset: number) => {
            content.forEach((node, offset) => {
              const start = parentOffset + offset;
              const end = start + node.nodeSize;

              if (node.content && node.content.size) {
                // Node has children - traverse recursively
                travelContent(node.content, start);
              } else {
                // Check if node has insertion mark
                if (node.marks.find((m) => m.type.name === MARK_INSERTION)) {
                  // Create empty step to replace content with insertion mark
                  skipSteps.push(
                    new ReplaceStep(
                      start - addedEmptyOffset,
                      end - addedEmptyOffset,
                      Slice.empty
                    )
                  );
                  addedEmptyOffset += node.nodeSize;
                  reAddOffset -= node.nodeSize;
                }
              }
            });
          };

          travelContent(invertedStep.slice.content, invertedStep.from);
          reAddOffset += invertedStep.slice.size;

          // Apply re-add step
          newChangeTr.step(reAddStep);

          const { from } = reAddStep;
          const to = from + reAddStep.slice.size;

          // Add deletion mark to re-added content
          newChangeTr.addMark(
            from,
            to,
            newChangeTr.doc.type.schema.marks.deletion.create({
              "data-op-user-id": thisExtension.options.dataOpUserId,
              "data-op-user-nickname": thisExtension.options.dataOpUserNickname,
              "data-op-date": getMinuteTime(),
            })
          );

          // Apply skip steps
          skipSteps.forEach((step) => {
            newChangeTr.step(step);
          });
        }

        // Apply changes
        const newState = editor.state.apply(newChangeTr);
        editor.view.updateState(newState);
      }
    });

    // Update cursor position
    let finalNewPos = trackChangeEnabled
      ? currentNewPos + posOffset
      : currentNewPos;

    // --- Fix: Move cursor before deletion mark after backspace ---
    // Detect if this was a backward deletion (backspace)
    const sel = transaction.selection;
    const isBackwardDelete =
      trackChangeEnabled &&
      sel instanceof TextSelection &&
      sel.empty &&
      sel.from === sel.to;
    if (isBackwardDelete && allSteps.length > 0) {
      // Find the last ReplaceStep that deleted content
      const lastDelStep = allSteps.reverse().find(
        (step: Step) => step instanceof ReplaceStep && (step as ReplaceStep).from !== (step as ReplaceStep).to
      ) as ReplaceStep | undefined;
      if (lastDelStep) {
        // Move cursor to just before the new deletion mark
        finalNewPos = lastDelStep.from;
      }
    }
    // --- End fix ---

    if (trackChangeEnabled) {
      const trWithChange = editor.view.state.tr;
      trWithChange.setSelection(
        TextSelection.create(editor.view.state.doc, finalNewPos)
      );
      const newStateWithNewSelection = editor.view.state.apply(trWithChange);
      LOG_ENABLED && console.log("update cursor", finalNewPos);
      editor.view.updateState(newStateWithNewSelection);
    }
  },
});

export default TrackChangeExtension;
