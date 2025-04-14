import React, { useEffect } from 'react'
import './TrackChangesView.css'

interface TrackChangesViewProps {
    editor: any; // Using 'any' for now to simplify, but ideally should be properly typed
    trackingEnabled: boolean;
    setTrackingEnabled: (enabled: boolean) => void;
}

const TrackChangesView: React.FC<TrackChangesViewProps> = ({
    editor,
    trackingEnabled,
    setTrackingEnabled
}) => {
    if (!editor) return null;

    const handleToggleTracking = () => {
        const newStatus = !trackingEnabled;
        setTrackingEnabled(newStatus);
        editor.commands.setTrackChangeStatus(newStatus);
    };

    useEffect(() => {
        if (!editor || !editor.isEditable) return;

        const handleClickAccept = (e: MouseEvent, markRange: any) => {
            e.preventDefault();
            e.stopPropagation();
            editor.chain().focus().selectTextblockEnd().run();

            editor.view.dispatch(
                editor.view.state.tr.setSelection(
                    editor.state.selection.constructor.create(
                        editor.state.doc,
                        markRange.from,
                        markRange.to
                    )
                )
            );

            editor.commands.acceptChange();
        };

        const handleClickReject = (e: MouseEvent, markRange: any) => {
            e.preventDefault();
            e.stopPropagation();
            editor.chain().focus().selectTextblockEnd().run();

            editor.view.dispatch(
                editor.view.state.tr.setSelection(
                    editor.state.selection.constructor.create(
                        editor.state.doc,
                        markRange.from,
                        markRange.to
                    )
                )
            );

            editor.commands.rejectChange();
        };

        const setupChangeActionButtons = () => {
            setTimeout(() => {
                document.querySelectorAll('.track-change-action-button.accept').forEach(button => {
                    const markRangeData = (button as HTMLElement).dataset.markRange;
                    if (markRangeData) {
                        const markRange = JSON.parse(markRangeData);
                        button.addEventListener('click', (e) => handleClickAccept(e as MouseEvent, markRange));
                    }
                });

                document.querySelectorAll('.track-change-action-button.reject').forEach(button => {
                    const markRangeData = (button as HTMLElement).dataset.markRange;
                    if (markRangeData) {
                        const markRange = JSON.parse(markRangeData);
                        button.addEventListener('click', (e) => handleClickReject(e as MouseEvent, markRange));
                    }
                });
            }, 100);
        };

        const updateHandler = () => {
            setupChangeActionButtons();
        };

        editor.on('update', updateHandler);
        setupChangeActionButtons();

        return () => {
            editor.off('update', updateHandler);
        };
    }, [editor]);

    const handleAcceptAll = () => {
        editor.commands.acceptAllChanges();
    };

    const handleRejectAll = () => {
        editor.commands.rejectAllChanges();
    };

    return (
        <div className="track-changes-view">
            <div className="track-changes-controls">
                <div className="track-changes-toggle">
                    <label>
                        <input
                            type="checkbox"
                            checked={trackingEnabled}
                            onChange={handleToggleTracking}
                        />
                        Track Changes
                    </label>
                </div>

                {trackingEnabled && (
                    <div className="track-changes-actions">
                        <button
                            onClick={handleAcceptAll}
                            className="change-button accept-all"
                            disabled={!editor}
                        >
                            Accept All Changes
                        </button>
                        <button
                            onClick={handleRejectAll}
                            className="change-button reject-all"
                            disabled={!editor}
                        >
                            Reject All Changes
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

export default TrackChangesView
