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

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    trackchange: {
      /**
       * change track change extension enabled status
       * we don't use a external function instead，so we can use a editor.command anywhere without another variable
       * @param enabled
       * @returns
       */
      setTrackChangeStatus: (enabled: boolean) => ReturnType;
      getTrackChangeStatus: () => ReturnType;
      toggleTrackChangeStatus: () => ReturnType;
      /**
       * accept one change: auto recognize the selection or left near by cursor pos
       */
      acceptChange: () => ReturnType;
      /**
       * accept all changes: mark insertion as normal, and remove all the deletion nodes
       */
      acceptAllChanges: () => ReturnType;
      /**
       * same to accept
       */
      rejectChange: () => ReturnType;
      /**
       * same to acceptAll but: remove deletion mark and remove all insertion nodes
       */
      rejectAllChanges: () => ReturnType;
      /**
       *
       */
      updateOpUserOption: (
        opUserId: string,
        opUserNickname: string
      ) => ReturnType;
    };
  }
}

// Insert mark - defines how insertions are tracked
export const InsertionMark = Mark.create({
  name: MARK_INSERTION,
  addAttributes() {
    return {
      "data-op-user-id": {
        type: "string",
        default: () => "",
      },
      "data-op-user-nickname": {
        type: "string",
        default: () => "",
      },
      "data-op-date": {
        type: "string",
        default: () => "",
      },
    };
  },
  parseHTML() {
    return [{ tag: "insert" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "insert",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },
});

// Delete mark - defines how deletions are tracked
export const DeletionMark = Mark.create({
  name: MARK_DELETION,
  addAttributes() {
    return {
      "data-op-user-id": {
        type: "string",
        default: () => "",
      },
      "data-op-user-nickname": {
        type: "string",
        default: () => "",
      },
      "data-op-date": {
        type: "string",
        default: () => "",
      },
    };
  },
  parseHTML() {
    return [{ tag: "delete" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "delete",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },
});

// IME input handling constants and variables
const IME_STATUS_NORMAL = 0;
const IME_STATUS_CONTINUE = 2;
type IME_STATUS_TYPE = 0 | 1 | 2 | 3;
let composingStatus: IME_STATUS_TYPE = 0; // 0: normal，1: start with first chat, 2: continue input, 3: finished by confirm or cancel with chars applied
let isStartChineseInput = false;

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
 * @returns null
 */
const changeTrack = (opType: TRACK_COMMAND_TYPE, param: CommandProps) => {
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

    // Apply transaction and update editor state
    const newState = param.editor.state.apply(currentTr);
    param.editor.view.updateState(newState);
  }

  return false;
};

export const TrackChangeExtension = Extension.create<{
  enabled: boolean;
  onStatusChange?: Function;
  dataOpUserId?: string;
  dataOpUserNickname?: string;
}>({
  name: EXTENSION_NAME,

  onCreate() {
    if (this.options.onStatusChange) {
      this.options.onStatusChange(this.options.enabled);
    }
  },

  addExtensions() {
    return [InsertionMark, DeletionMark];
  },

  addCommands: () => {
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
  onSelectionUpdate(p) {
    // Log selection status for debugging
    LOG_ENABLED &&
      console.log(
        "selection and input status",
        p.transaction.selection.from,
        p.transaction.selection.to,
        p.editor.view.composing
      );
  },

  addProseMirrorPlugins() {
    // Create decorations for track change UI elements
    const createChangeDecorations = (doc: any, marks: MarkRange[]) => {
      const decos: any[] = [];

      marks.forEach((markRange) => {
        const isInsertMark = markRange.mark.type.name === MARK_INSERTION;
        const isDeleteMark = markRange.mark.type.name === MARK_DELETION;

        if (isInsertMark || isDeleteMark) {
          const actionButtons = document.createElement("div");
          actionButtons.className = "track-change-action-buttons";

          // Accept button
          const acceptButton = document.createElement("button");
          acceptButton.className = "track-change-action-button accept";
          acceptButton.setAttribute("title", "Accept change");
          acceptButton.setAttribute("aria-label", "Accept change");
          acceptButton.setAttribute(
            "data-mark-range",
            JSON.stringify(markRange)
          );
          acceptButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><polyline points="20 6 9 17 4 12"/></svg>`;
          actionButtons.appendChild(acceptButton);

          // Reject button
          const rejectButton = document.createElement("button");
          rejectButton.className = "track-change-action-button reject";
          rejectButton.setAttribute("title", "Reject change");
          rejectButton.setAttribute("aria-label", "Reject change");
          rejectButton.setAttribute(
            "data-mark-range",
            JSON.stringify(markRange)
          );
          rejectButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-ccw"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;
          actionButtons.appendChild(rejectButton);

          // Add hover logic directly to the tag
          const tagName = isInsertMark ? "insert" : "delete";
          const tagElement = document.createElement(tagName);

          // Append buttons to the tag
          tagElement.appendChild(actionButtons);

          // Add hover logic
          tagElement.addEventListener("mouseenter", () => {
            actionButtons.classList.add("show");
          });
          tagElement.addEventListener("mouseleave", () => {
            actionButtons.classList.remove("show");
          });

          const deco = Decoration.widget(markRange.to, tagElement, {
            side: 1,
            key: `change-actions-${markRange.from}-${markRange.to}`,
            stopEvent: (event) => {
              // Stop event propagation for button clicks
              if (
                (event.target as HTMLElement)?.closest(
                  ".track-change-action-button"
                )
              ) {
                return true;
              }
              return false;
            },
          });
          decos.push(deco);
        }
      });

      return DecorationSet.create(doc, decos);
    };

    // Plugin for rendering decorations
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
      },
    });

    // Plugin for handling IME input
    const imePlugin = new Plugin({
      key: new PluginKey("composing-check"),
      props: {
        handleDOMEvents: {
          compositionstart: (_event) => {
            LOG_ENABLED && console.log("start chinese input");
            isStartChineseInput = true;
            return false;
          },
          compositionupdate: (_event) => {
            LOG_ENABLED && console.log("chinese input continue");
            composingStatus = IME_STATUS_CONTINUE;
            return false;
          },
        },
      },
    });

    return [decorationPlugin, imePlugin];
  },

  onTransaction: ({ editor, transaction }) => {
    // Check IME input status
    const isChineseStart =
      isStartChineseInput && composingStatus === IME_STATUS_CONTINUE;
    const isChineseInputting =
      !isStartChineseInput && composingStatus === IME_STATUS_CONTINUE;
    const isNormalInput = composingStatus === IME_STATUS_NORMAL;

    // Reset for next change
    composingStatus = IME_STATUS_NORMAL;
    isStartChineseInput = false;

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

    // Adjust cursor position logic based on input type
    if (isNormalInput) {
      if (!hasAddAndDelete) {
        posOffset = 0;
      }
    } else if (isChineseStart) {
      if (!hasAddAndDelete) {
        posOffset = 0;
      }
    } else if (isChineseInputting) {
      posOffset = 0;
    }

    LOG_ENABLED &&
      console.table({
        hasAddAndDelete,
        isNormalInput,
        isChineseStart,
        isChineseInputting,
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
    const finalNewPos = trackChangeEnabled
      ? currentNewPos + posOffset
      : currentNewPos;

    if (trackChangeEnabled) {
      const trWithChange = editor.view.state.tr;
      trWithChange.setSelection(
        TextSelection.create(editor.view.state.doc, finalNewPos)
      );
      const newStateWithNewSelection = editor.view.state.apply(trWithChange);
      LOG_ENABLED && console.log("update cursor", finalNewPos);
      editor.view.updateState(newStateWithNewSelection);
    }

    // Handle special case for Chinese input
    if (isChineseStart && hasAddAndDelete && trackChangeEnabled) {
      // Delete selection and temporarily blur to handle IME issue
      editor.commands.deleteSelection();
      editor.commands.blur();
      setTimeout(() => {
        editor.commands.focus();
      }, 100);
    }
  },
});

export default TrackChangeExtension;
