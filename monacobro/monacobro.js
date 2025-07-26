function createPatternEditor(containerId, dataset) {
  require.config({
    paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs" },
  });

  require(["vs/editor/editor.main"], function () {
    // Generate CSS from styles map
    const style = document.createElement("style");
    let css = "";

    // Generate base classes from styles
    Object.entries(dataset.styles).forEach(([styleName, styleConfig]) => {
      css += `.monaco-editor .style-${styleName} { ${styleConfig.css} }`;
    });

    style.textContent = css;
    document.head.appendChild(style);

    const editor = monaco.editor.create(document.getElementById(containerId), {
      value: dataset.content,
      language: "markdown",
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      wordWrap: "on",
      lightbulb: { enabled: true },
      // Disable automatic link detection to prevent conflicts
      links: false,
      // Enable suggestions
      suggest: {
        showIcons: true,
        showSnippets: true,
        showWords: true,
        showKeywords: true,
        insertMode: "replace",
        filterGraceful: true,
        snippetsPreventQuickSuggestions: false,
        localityBonus: true,
        shareSuggestSelections: false,
      },
    });

    const disposables = [];
    let currentDecorations = []; // Track current decorations

    // Helper function to get word at position with better boundary detection
    function getWordAtPosition(model, position) {
      const line = model.getLineContent(position.lineNumber);
      const wordSeparators = /[\s\.,;:!?\(\)\[\]{}"'`~@#$%^&*+=|\\<>\/]/;

      let start = position.column - 1;
      let end = position.column - 1;

      // Find start of word
      while (start > 0 && !wordSeparators.test(line[start - 1])) {
        start--;
      }

      // Find end of word
      while (end < line.length && !wordSeparators.test(line[end])) {
        end++;
      }

      const word = line.substring(start, end);
      const currentText = line.substring(start, position.column - 1);

      return {
        word,
        currentText,
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: start + 1,
          endColumn: end + 1,
        },
      };
    }

    // Custom autocomplete provider
    disposables.push(
      monaco.languages.registerCompletionItemProvider("markdown", {
        triggerCharacters: [],

        provideCompletionItems: (model, position, context) => {
          const { currentText, range } = getWordAtPosition(model, position);
          const suggestions = [];

          // Always show suggestions if manually triggered or if we have matching text
          const showSuggestions =
            context.triggerKind ===
              monaco.languages.CompletionTriggerKind.Invoke ||
            currentText.length > 0;

          if (!showSuggestions) {
            return { suggestions: [] };
          }

          // Find matching patterns
          dataset.patterns.forEach((pattern, index) => {
            // Match if:
            // 1. Manual trigger (Ctrl+Space)
            // 2. Pattern starts with current text
            // 3. Pattern contains current text (for partial matches)
            const isMatch =
              currentText.length === 0 ||
              pattern.word
                .toLowerCase()
                .startsWith(currentText.toLowerCase()) ||
              (currentText.length >= 2 &&
                pattern.word.toLowerCase().includes(currentText.toLowerCase()));

            if (isMatch) {
              // Extract plain text from HTML for detail display
              const plainText = pattern.info
                ? pattern.info.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, "")
                : "";
              const lines = plainText.split("\n").filter((l) => l.trim());

              suggestions.push({
                label: {
                  label: pattern.word,
                  detail: lines.length > 1 ? lines[1] : "", // Second line as detail
                  description: lines.length > 2 ? lines.slice(2).join(" ") : "", // Rest as description
                },
                kind: monaco.languages.CompletionItemKind.Text,
                insertText: pattern.word,
                range,
                documentation: {
                  value: pattern.info || pattern.word,
                  isTrusted: true,
                },
                sortText: String(index).padStart(3, "0"),
                filterText: pattern.word,
                preselect:
                  currentText.length > 0 &&
                  pattern.word
                    .toLowerCase()
                    .startsWith(currentText.toLowerCase()),
              });
            }
          });

          return {
            suggestions,
            incomplete: currentText.length > 0 && suggestions.length === 0, // Keep searching if no matches yet
          };
        },
      })
    );

    // Auto-trigger suggestions on typing
    let typingTimer;
    editor.onDidChangeModelContent((e) => {
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        const position = editor.getPosition();
        const model = editor.getModel();
        const { currentText } = getWordAtPosition(model, position);

        // Trigger if we have text and it could match a pattern
        if (currentText.length > 0) {
          const hasMatches = dataset.patterns.some(
            (pattern) =>
              pattern.word
                .toLowerCase()
                .startsWith(currentText.toLowerCase()) ||
              (currentText.length >= 2 &&
                pattern.word.toLowerCase().includes(currentText.toLowerCase()))
          );

          if (hasMatches) {
            editor.trigger("auto", "editor.action.triggerSuggest", {});
          }
        }

        // Update decorations
        updateDecorations();
      }, 150);
    });

    // Manual trigger with Ctrl+Space
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
      editor.trigger("manual", "editor.action.triggerSuggest", {});
    });

    // Enhanced hover provider with multiple actions support
    disposables.push(
      monaco.languages.registerHoverProvider("markdown", {
        provideHover: (model, position) => {
          const line = model.getLineContent(position.lineNumber);

          for (const pattern of dataset.patterns) {
            const index = line.indexOf(pattern.word);
            if (index !== -1) {
              const start = index + 1;
              const end = start + pattern.word.length;

              if (position.column >= start && position.column <= end) {
                const contents = [];

                // Add main info if it exists
                if (pattern.info) {
                  contents.push({ value: pattern.info, supportHtml: true });
                }

                // Add hover-enabled actions
                if (pattern.actions) {
                  pattern.actions
                    .filter((action) => action.hover)
                    .map((action) => {
                      contents.push({
                        value: `[${action.label}](${action.url})`,
                        isTrusted: true,
                      });
                    });
                }

                if (contents.length > 0) {
                  return {
                    range: new monaco.Range(
                      position.lineNumber,
                      start,
                      position.lineNumber,
                      end
                    ),
                    contents: contents,
                  };
                }
              }
            }
          }
        },
      })
    );

    // Enhanced link provider with multiple actions support
    disposables.push(
      monaco.languages.registerLinkProvider("markdown", {
        provideLinks: (model) => {
          const lines = model.getValue().split("\n");
          const links = [];

          lines.forEach((line, lineIndex) => {
            dataset.patterns.forEach((pattern) => {
              let searchStart = 0;
              let index;

              // Find all occurrences of the pattern in the line
              while ((index = line.indexOf(pattern.word, searchStart)) !== -1) {
                const lineNumber = lineIndex + 1;
                const start = index + 1;
                const end = start + pattern.word.length;

                // Handle new actions array format
                if (pattern.actions) {
                  // For now, use the first action for the primary link
                  // In a real implementation, you might want to show a context menu
                  const primaryAction = pattern.actions[0];

                  pattern.actions.map((action) => {
                    links.push({
                      range: new monaco.Range(
                        lineNumber,
                        start,
                        lineNumber,
                        end
                      ),
                      url: action.url,
                      tooltip: action.tooltip ? action.label : undefined,
                    });
                  });
                }

                searchStart = index + 1;
              }
            });
          });

          return { links };
        },
      })
    );

    // Quick fixes for replacements
    disposables.push(
      monaco.languages.registerCodeActionProvider("markdown", {
        provideCodeActions: (model, range) => {
          const line = model.getLineContent(range.startLineNumber);
          const actions = [];

          dataset.patterns.forEach((pattern) => {
            // Check if pattern has error replacement
            if (pattern.errorReplace && pattern.errorLabel) {
              const index = line.indexOf(pattern.word);
              if (index !== -1) {
                const start = index + 1;
                const end = start + pattern.word.length;

                if (range.startColumn >= start && range.endColumn <= end) {
                  actions.push({
                    title: pattern.errorLabel,
                    kind: "quickfix",
                    edit: {
                      edits: [
                        {
                          resource: model.uri,
                          textEdit: {
                            range: {
                              startLineNumber: range.startLineNumber,
                              startColumn: start,
                              endLineNumber: range.endLineNumber,
                              endColumn: end,
                            },
                            text: pattern.errorReplace,
                          },
                        },
                      ],
                    },
                  });
                }
              }
            }
          });

          return { actions, dispose: () => {} };
        },
      })
    );

    // Enhanced code lens with multiple actions support
    disposables.push(
      monaco.languages.registerCodeLensProvider("markdown", {
        provideCodeLenses: (model) => {
          const lines = model.getValue().split("\n");
          const lenses = [];

          lines.forEach((line, lineIndex) => {
            dataset.patterns.forEach((pattern, patternIndex) => {
              const index = line.indexOf(pattern.word);
              if (index !== -1) {
                const range = {
                  startLineNumber: lineIndex + 1,
                  startColumn: index + 1,
                  endLineNumber: lineIndex + 1,
                  endColumn: index + pattern.word.length + 1,
                };

                // Handle new actions array format
                if (pattern.actions && pattern.actions.length > 0) {
                  // Create a lens for each action, or combine them
                  pattern.actions.forEach((action, actionIndex) => {
                    if (action.tooltip) {
                      lenses.push({
                        range,
                        command: {
                          id: "openUrl",
                          title: action.label,
                          arguments: [action.url],
                          tooltip: action.label,
                        },
                      });
                    }
                  });
                }
              }
            });
          });

          return { lenses, dispose: () => {} };
        },
      })
    );

    // URL opener command
    monaco.editor.addCommand({
      id: "openUrl",
      run: (_, url) => window.open(url, "_blank"),
    });

    // Apply decorations with proper cleanup
    const updateDecorations = () => {
      const model = editor.getModel();
      const lines = model.getValue().split("\n");
      const decorations = [];
      const markers = [];
      let inCodeBlock = false;

      lines.forEach((line, lineIndex) => {
        if (line.trim().startsWith("```")) {
          inCodeBlock = !inCodeBlock;
          return;
        }
        if (inCodeBlock) return;

        dataset.patterns.forEach((pattern) => {
          let searchStart = 0;
          let index;

          // Find all occurrences of the pattern in the line
          while ((index = line.indexOf(pattern.word, searchStart)) !== -1) {
            const lineNumber = lineIndex + 1;
            const start = index + 1;
            const end = start + pattern.word.length;

            // Apply main decoration
            decorations.push({
              range: new monaco.Range(lineNumber, start, lineNumber, end),
              options: { inlineClassName: `style-${pattern.style}` },
            });

            // Add markers for errors
            if (pattern.errorReplace && pattern.errorSeverity) {
              const severity =
                pattern.errorSeverity === "error"
                  ? monaco.MarkerSeverity.Error
                  : pattern.errorSeverity === "warning"
                  ? monaco.MarkerSeverity.Warning
                  : monaco.MarkerSeverity.Info;

              markers.push({
                startLineNumber: lineNumber,
                startColumn: start,
                endLineNumber: lineNumber,
                endColumn: end,
                message: pattern.errorLabel || `Issue with: ${pattern.word}`,
                severity: severity,
              });
            }

            searchStart = index + 1;
          }
        });
      });

      // Properly clear old decorations before applying new ones
      currentDecorations = editor.deltaDecorations(
        currentDecorations,
        decorations
      );
      monaco.editor.setModelMarkers(model, "patterns", markers);
    };

    // Initial decoration update
    setTimeout(updateDecorations, 100);

    // Cleanup function
    window.addEventListener("beforeunload", () => {
      disposables.forEach((d) => d.dispose());
    });

    return editor;
  });
}
