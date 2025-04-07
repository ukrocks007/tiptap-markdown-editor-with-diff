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
        const applyDiffStyling = () => {
            if (!oldContentRef.current || !newContentRef.current) return;

            const oldText = oldContentRef.current.innerText;
            const newText = newContentRef.current.innerText;

            const diffs = dmp.diff_main(oldText, newText);
            dmp.diff_cleanupSemantic(diffs);

            const buildHighlightedHTML = (diffs: diff_match_patch.Diff[], isOld: boolean) => {
                let resultHtml = '';
                diffs.forEach(diff => {
                    const [diffType, content] = diff;
                    let el;

                    if (diffType === -1 && isOld) {
                        // Deletion in old content
                        el = document.createElement('span');
                        el.style.backgroundColor = 'red';
                        el.innerText = content;
                        resultHtml += el.outerHTML;
                    } else if (diffType === 1 && !isOld) {
                        // Addition in new content
                        el = document.createElement('span');
                        el.style.backgroundColor = 'green';
                        el.innerText = content;
                        resultHtml += el.outerHTML;
                    } else if (diffType === 0) {
                        // No change
                        resultHtml += content;
                    }
                });
                return resultHtml;
            };

            oldContentRef.current.innerHTML = buildHighlightedHTML(diffs, true);
            newContentRef.current.innerHTML = buildHighlightedHTML(diffs, false);
        };

        applyDiffStyling();
    }, [currentContent, lastSavedContent, dmp]);

    if (!showDiff) return null;

    const oldHtmlContent = marked(lastSavedContent, { breaks: true, gfm: true });
    const newHtmlContent = marked(currentContent, { breaks: true, gfm: true });

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
                        <div className="diff-cell diff-cell-old">
                            <div ref={oldContentRef} dangerouslySetInnerHTML={{ __html: oldHtmlContent }} />
                        </div>
                        <div className="diff-cell diff-cell-new">
                            <div ref={newContentRef} dangerouslySetInnerHTML={{ __html: newHtmlContent }} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DiffView;
