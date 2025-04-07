import React, { useEffect, useRef } from 'react';
import { marked } from 'marked';
import { diff_match_patch, DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL } from 'diff-match-patch';

// Configure marked to handle GitHub flavored markdown
marked.setOptions({
    gfm: true,
    breaks: true,
});

interface DiffViewProps {
    currentContent: string;
    lastSavedContent: string;
    showDiff: boolean;
}

const DiffView: React.FC<DiffViewProps> = ({ currentContent, lastSavedContent, showDiff }) => {
    const oldContentRef = useRef<HTMLDivElement>(null);
    const newContentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showDiff) return;

        const computeDiff = () => {
            // Normalize line endings
            const normalizedOld = lastSavedContent.replace(/\r\n/g, '\n');
            const normalizedNew = currentContent.replace(/\r\n/g, '\n');

            const dmp = new diff_match_patch();
            // Split by lines while preserving line endings
            const lines1 = normalizedOld.split(/(\n)/g);
            const lines2 = normalizedNew.split(/(\n)/g);
            
            // Process each line to handle list markers
            const processedLines1 = lines1.map(line => preprocessLine(line));
            const processedLines2 = lines2.map(line => preprocessLine(line));
            
            const diffs = dmp.diff_main(
                processedLines1.join(''),
                processedLines2.join('')
            );
            
            dmp.diff_cleanupSemantic(diffs);
            return diffs;
        };

        // Preprocess line to handle list markers
        const preprocessLine = (line: string): string => {
            // Handle unordered list items
            if (/^\s*[-*+]\s/.test(line)) {
                const [marker, ...rest] = line.match(/^(\s*[-*+]\s)(.*)/)||['','',''];
                return marker[1] + rest.join('');
            }
            // Handle ordered list items
            if (/^\s*\d+\.\s/.test(line)) {
                const [marker, ...rest] = line.match(/^(\s*\d+\.\s)(.*)/)||['','',''];
                return marker[1] + rest.join('');
            }
            return line;
        };

        const createDiffHTML = (diffs: Array<[number, string]>, isOldVersion: boolean) => {
            let html = '';
            let inListItem = false;
            
            diffs.forEach(([type, text]) => {
                const escapedText = escapeHtml(text);
                
                // Check if we're starting a list item
                const isListStart = /^[-*+]\s/.test(text) || /^\d+\.\s/.test(text);
                
                if (type === DIFF_EQUAL) {
                    if (isListStart) inListItem = true;
                    html += escapedText;
                    if (text.includes('\n')) inListItem = false;
                } else if ((type === DIFF_DELETE && isOldVersion) || 
                          (type === DIFF_INSERT && !isOldVersion)) {
                    // Handle list items specially
                    if (isListStart || inListItem) {
                        const listContent = text.replace(/^([-*+]|\d+\.)\s/, '');
                        if (listContent.trim()) {
                            html += `<span class="diff-${type === DIFF_DELETE ? 'delete' : 'add'}">${escapeHtml(listContent)}</span>`;
                        } else {
                            html += escapedText;
                        }
                        inListItem = true;
                    } else {
                        html += `<span class="diff-${type === DIFF_DELETE ? 'delete' : 'add'}">${escapedText}</span>`;
                    }
                    if (text.includes('\n')) inListItem = false;
                }
            });
            
            return html;
        };

        const renderDiff = async () => {
            if (!oldContentRef.current || !newContentRef.current) return;
            
            const diffs = computeDiff();
            
            // Generate HTML for both views
            const oldHTML = createDiffHTML(diffs, true);
            const newHTML = createDiffHTML(diffs, false);
            
            try {
                // Process markdown content while preserving diff highlights
                const [oldMarkdownHtml, newMarkdownHtml] = await Promise.all([
                    processMarkdownWithDiff(oldHTML),
                    processMarkdownWithDiff(newHTML)
                ]);
                
                // Set the processed HTML content
                oldContentRef.current.innerHTML = oldMarkdownHtml;
                newContentRef.current.innerHTML = newMarkdownHtml;
            } catch (error) {
                console.error('Error processing markdown:', error);
            }
        };

        const escapeHtml = (unsafe: string): string => {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/\"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };
        
        const processMarkdownWithDiff = async (html: string): Promise<string> => {
            // Store diff spans for later restoration
            const diffSpans: Array<{ placeholder: string, original: string }> = [];
            let counter = 0;
            
            // Replace diff spans with unique placeholders
            const htmlWithPlaceholders = html.replace(
                /<span class="diff-(add|delete)">([\s\S]*?)<\/span>/g, 
                (_match: string, diffType: string, content: string) => {
                    const placeholder = `DIFF_PLACEHOLDER_${counter++}`;
                    diffSpans.push({
                        placeholder,
                        original: `<span class="diff-${diffType}">${content}</span>`
                    });
                    return placeholder;
                }
            );
            
            // Convert markdown to HTML
            const renderedHtml = await marked(htmlWithPlaceholders, { async: true });
            
            // Restore diff spans
            let processedHtml = renderedHtml;
            
            // Process code blocks specially to preserve formatting
            processedHtml = processedHtml.replace(
                /<pre><code(?:\s+class="language-[^"]*")?>([\s\S]*?)<\/code><\/pre>/g,
                (_match: string, codeContent: string) => {
                    // Process diff spans inside code blocks
                    const processedCode = codeContent.replace(
                        /DIFF_PLACEHOLDER_(\d+)/g,
                        (_ph: string, index: string) => {
                            const span = diffSpans[parseInt(index)];
                            if (!span) return '';
                            return span.original.replace(
                                'class="diff-',
                                'class="code-diff diff-'
                            );
                        }
                    );
                    
                    return `<pre><code>${processedCode}</code></pre>`;
                }
            );
            
            // Restore remaining diff spans
            diffSpans.forEach(({ placeholder, original }) => {
                processedHtml = processedHtml.replace(
                    new RegExp(placeholder, 'g'),
                    original
                );
            });
            
            return processedHtml;
        };
        
        renderDiff();
    }, [currentContent, lastSavedContent, showDiff]);

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
                        <div className="diff-cell diff-cell-old">
                            <div ref={oldContentRef} className="markdown-content" />
                        </div>
                        <div className="diff-cell diff-cell-new">
                            <div ref={newContentRef} className="markdown-content" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DiffView;
