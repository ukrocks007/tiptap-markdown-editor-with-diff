import React, { useState } from 'react';
import DiffMatchPatch from 'diff-match-patch';
import { marked } from 'marked';
import diff_match_patch from 'diff-match-patch';
// import './DiffView.css';

interface DiffViewProps {
    currentContent: string;
    lastSavedContent: string;
    showDiff: boolean;
}

const DiffView: React.FC<DiffViewProps> = ({ currentContent, lastSavedContent, showDiff }) => {
    const [viewMode, setViewMode] = useState<'side-by-side' | 'inline'>('side-by-side');
    
    if (!showDiff) return null;

    const dmp = new DiffMatchPatch();

    const processDiffs = (oldText: string, newText: string): diff_match_patch.Diff[] => {
        const diffs = dmp.diff_main(oldText, newText);
        dmp.diff_cleanupSemantic(diffs);
        return diffs;
    };

    const diffs = processDiffs(lastSavedContent, currentContent);
    
    // Process markdown first, then apply diff styling
    const createFormattedHTML = (diffs: diff_match_patch.Diff[], type: 'old' | 'new' | 'inline') => {
        // First extract the content based on diff type
        let contentToRender = '';
        
        diffs.forEach(diff => {
            const [diffType, content] = diff;
            let cssClass = '';

            if (diffType === -1 && type === 'old') {
                cssClass = 'diff-delete';
            } else if (diffType === 1 && type === 'new') {
                cssClass = 'diff-add';
            }
            
            if (type === 'old') {
                // For old view, include unchanged and deletions
                if (diffType === 0 || diffType === -1) {
                    contentToRender += cssClass ? `<span class="${cssClass}">${content}</span>` : content;
                }
            } else if (type === 'new') {
                // For new view, include unchanged and additions
                if (diffType === 0 || diffType === 1) {
                    contentToRender += cssClass ? `<span class="${cssClass}">${content}</span>` : content;
                }
            } else if (type === 'inline') {
                // For inline view, include everything
                contentToRender += content;
            }
        });
        
        // Convert markdown to HTML
        const htmlContent = marked(contentToRender, { breaks: true, gfm: true });

        if (htmlContent instanceof Promise) {
            console.error("Error: 'marked' returned a Promise. Ensure 'marked' is configured to return a string.");
            return { __html: '' };
        }
        
        if (type === 'inline') {
            // Now apply highlighting for inline view
            let highlightedContent = htmlContent;
            
            // Process each diff to add styling
            diffs.forEach(diff => {
                const [diffType, content] = diff;
                if (diffType !== 0) {
                    const escapedContent = content
                        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
                        .replace(/\n/g, '<br>'); // Handle newlines
                    
                    const cssClass = diffType === -1 ? 'diff-delete' : 'diff-add';
                    
                    // Wrap the content with the appropriate class
                    highlightedContent = highlightedContent.replace(
                        new RegExp(`(${escapedContent})`, 'g'),
                        `<span class="${cssClass}">$1</span>`
                    );
                }
            });
            
            return { __html: highlightedContent };
        } else {
            // For side-by-side, just return the HTML content
            return { __html: htmlContent };
        }
    };

    const renderSideBySideView = () => {
        return (
            <div className="diff-table">
                <div className="diff-row">
                    <div className="diff-cell diff-cell-old">
                        <div dangerouslySetInnerHTML={createFormattedHTML(diffs, 'old')} />
                    </div>
                    <div className="diff-cell diff-cell-new">
                        <div dangerouslySetInnerHTML={createFormattedHTML(diffs, 'new')} />
                    </div>
                </div>
            </div>
        );
    };

    const renderInlineView = () => {
        return (
            <div className="diff-table inline-view">
                <div dangerouslySetInnerHTML={createFormattedHTML(diffs, 'inline')} />
            </div>
        );
    };

    return (
        <div className="diff-view">
            <div className="diff-controls">
                <h3>Changes Made:</h3>
                <div className="view-toggle">
                    <button 
                        className={viewMode === 'side-by-side' ? 'active' : ''}
                        onClick={() => setViewMode('side-by-side')}
                    >
                        Side by Side
                    </button>
                    <button 
                        className={viewMode === 'inline' ? 'active' : ''}
                        onClick={() => setViewMode('inline')}
                    >
                        Inline
                    </button>
                </div>
            </div>
            <div className="diff-container">
                {viewMode === 'side-by-side' && (
                    <div className="diff-header">
                        <div className="diff-header-old">Previous Version</div>
                        <div className="diff-header-new">Current Version</div>
                    </div>
                )}
                {viewMode === 'side-by-side' ? renderSideBySideView() : renderInlineView()}
            </div>
        </div>
    );
};

export default DiffView;
