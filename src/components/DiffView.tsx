import React, { useEffect, useRef } from 'react';
import DiffMatchPatch from 'diff-match-patch';
import { marked } from 'marked';
import diff_match_patch from 'diff-match-patch';

interface DiffViewProps {
    currentContent: string;
    lastSavedContent: string;
    showDiff: boolean;
}

const DiffView: React.FC<DiffViewProps> = ({ currentContent, lastSavedContent, showDiff }) => {
    const oldContentRef = useRef<HTMLDivElement>(null);
    const newContentRef = useRef<HTMLDivElement>(null);

    const dmp = new DiffMatchPatch();

    useEffect(() => {
        // Compute diffs directly on markdown content
        const diffs = dmp.diff_main(lastSavedContent, currentContent);
        dmp.diff_cleanupSemantic(diffs);

        // Function to convert diffs to HTML with proper styling
        const createDiffHTML = (diffs: diff_match_patch.Diff[], isOld: boolean) => {
            let markdownWithDiff = '';
            
            diffs.forEach(([diffType, content]) => {
                if (diffType === -1 && isOld) {
                    // Deletion in old version
                    markdownWithDiff += `<span class="diff-delete">${content}</span>`;
                } else if (diffType === 1 && !isOld) {
                    // Addition in new version
                    markdownWithDiff += `<span class="diff-add">${content}</span>`;
                } else if (diffType === 0) {
                    // Content that should be displayed normally
                    markdownWithDiff += content;
                }
            });
            
            // Convert markdown with diff markers to HTML
            return marked(markdownWithDiff, { breaks: true, gfm: true });
        };

        // Apply the HTML with diffs
        if (oldContentRef.current && newContentRef.current) {
            const updateContent = async () => {
                if (oldContentRef.current) {
                    oldContentRef.current.innerHTML = await createDiffHTML(diffs, true);
                }
                if (newContentRef.current) {
                    newContentRef.current.innerHTML = await createDiffHTML(diffs, false);
                }
            };
            updateContent();
        }
    }, [currentContent, lastSavedContent, dmp]);

    if (!showDiff) return null;

    return (
        <div className="diff-view">
            <div className="diff-controls">
                <h3>Changes Made:</h3>
            </div>
            <div className="diff-container">
                <div className="diff-header">
                    <div className="diff-header-old">Previous Version</div>
                    <div className="diff-header-new">Current Version</div>
                </div>
                <div className="diff-table">
                    <div className="diff-row">
                        <div className="diff-cell diff-cell-old" style={{ textAlign: 'left' }}>
                            <div ref={oldContentRef} style={{ textAlign: 'left' }} />
                        </div>
                        <div className="diff-cell diff-cell-new" style={{ textAlign: 'left' }}>
                            <div ref={newContentRef} style={{ textAlign: 'left' }} />
                        </div>
                    </div>
                </div>
            </div>
            <style>{`
                .diff-delete {
                    background-color: #ffcccc;
                    text-decoration: line-through;
                }
                
                .diff-add {
                    background-color: #ccffcc;
                }
            `}</style>
        </div>
    );
};

export default DiffView;
