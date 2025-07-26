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

    // Extract unique trigger characters from patterns
    const triggerCharacters = [
      ...new Set(
        dataset.patterns.map((p) => p.triggerCharacter).filter(Boolean)
      ),
    ];

    const editor = monaco.editor.create(document.getElementById(containerId), {
      value: dataset.content,
      language: "markdown",
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      wordWrap: "on",
      lightbulb: { enabled: true },
      links: false,
      suggest: {
        showIcons: true,
        showSnippets: true,
        showWords: true,
        preview: true,
        snippetsPreventQuickSuggestions: false,
        showIcons: true,
        showInlineDetails: true,
        insertMode: "replace",
        filterGraceful: true,
        localityBonus: true,
        shareSuggestSelections: false,
      },
      quickSuggestions: {
        other: true,
        comments: true,
        strings: true,
      },
    });

    const disposables = [];
    let currentDecorations = [];

    // Helper function to get trigger context at position
    function getTriggerContext(model, position) {
      const line = model.getLineContent(position.lineNumber);
      const beforeCursor = line.substring(0, position.column - 1);

      // Find the last trigger character
      let triggerChar = null;
      let triggerIndex = -1;

      for (const char of triggerCharacters) {
        const lastIndex = beforeCursor.lastIndexOf(char);
        if (lastIndex > triggerIndex) {
          triggerIndex = lastIndex;
          triggerChar = char;
        }
      }

      if (triggerIndex === -1) {
        return null;
      }

      // Get text after trigger character
      const textAfterTrigger = beforeCursor.substring(triggerIndex + 1);

      // Check if there's any whitespace after trigger (would break the word)
      if (/\s/.test(textAfterTrigger)) {
        return null;
      }

      return {
        triggerChar,
        triggerIndex,
        textAfterTrigger,
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: triggerIndex + 2, // +1 for 1-based, +1 to skip trigger char
          endColumn: position.column,
        },
      };
    }

    // Custom autocomplete provider
    disposables.push(
      monaco.languages.registerCompletionItemProvider("markdown", {
        triggerCharacters,

        provideCompletionItems: (model, position, context) => {
          const triggerContext = getTriggerContext(model, position);

          if (!triggerContext) {
            return { suggestions: [] };
          }

          const { triggerChar, textAfterTrigger, range } = triggerContext;
          const suggestions = [];

          // Only show patterns that match the current trigger character
          const matchingPatterns = dataset.patterns.filter(
            (pattern) => pattern.triggerCharacter === triggerChar
          );

          matchingPatterns.forEach((pattern, index) => {
            // Match if pattern word starts with text after trigger
            const patternWord = pattern.word || "";
            const isMatch =
              (textAfterTrigger.length === 0 ||
                patternWord
                  .toLowerCase()
                  .startsWith(textAfterTrigger.toLowerCase())) &&
              patternWord !== textAfterTrigger;

            if (isMatch) {
              // Extract plain text from HTML for detail display
              const plainText = pattern.info
                ? pattern.info.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, "")
                : "";
              const lines = plainText.split("\n").filter((l) => l.trim());

              suggestions.push({
                label: {
                  label: patternWord,
                  detail: lines.length > 1 ? lines[1] : "",
                  description: lines.length > 2 ? lines.slice(2).join(" ") : "",
                },
                kind: monaco.languages.CompletionItemKind.Text,
                insertText: patternWord,
                range,
                documentation: {
                  value: pattern.info || patternWord,
                  isTrusted: true,
                },
                sortText: String(index).padStart(3, "0"),
                filterText: patternWord,
                preselect:
                  textAfterTrigger.length > 0 &&
                  patternWord
                    .toLowerCase()
                    .startsWith(textAfterTrigger.toLowerCase()),
                command: {
                  id: "editor.action.showHover",
                  title: "Show Details",
                },
              });
            }
          });

          return {
            suggestions,
            incomplete: false,
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
        const triggerContext = getTriggerContext(model, position);

        // Trigger if we have a valid trigger context
        if (triggerContext && triggerContext.textAfterTrigger.length > 0) {
          const matchingPatterns = dataset.patterns.filter(
            (pattern) =>
              pattern.triggerCharacter === triggerContext.triggerChar &&
              (pattern.word || "")
                .toLowerCase()
                .startsWith(triggerContext.textAfterTrigger.toLowerCase()) &&
              (pattern.word || "") !== triggerContext.textAfterTrigger
          );

          if (matchingPatterns.length > 0) {
            editor.trigger("auto", "editor.action.triggerSuggest", {});

            setTimeout(() => {
              editor.trigger("auto", "toggleSuggestionDetails", {});
            }, 50);
          }
        }

        // Update decorations
        updateDecorations();
      }, 150);
    });

    // Manual trigger with Ctrl+Space
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
      editor.trigger("manual", "editor.action.triggerSuggest", {});
      setTimeout(() => {
        editor.trigger("auto", "toggleSuggestionDetails", {});
      }, 50);
    });

    // Enhanced hover provider
    disposables.push(
      monaco.languages.registerHoverProvider("markdown", {
        provideHover: (model, position) => {
          const line = model.getLineContent(position.lineNumber);

          for (const pattern of dataset.patterns) {
            if (!pattern.word) continue;

            // Look for trigger + word pattern
            const searchPattern =
              (pattern.triggerCharacter || "") + pattern.word;
            const index = line.indexOf(searchPattern);

            if (index !== -1) {
              const start = index + 1;
              const end = start + searchPattern.length;

              if (position.column >= start && position.column <= end) {
                const contents = [];

                if (pattern.info) {
                  contents.push({ value: pattern.info, supportHtml: true });
                }

                if (pattern.actions) {
                  pattern.actions
                    .filter((action) => action.hover)
                    .forEach((action) => {
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

    // Enhanced link provider
    disposables.push(
      monaco.languages.registerLinkProvider("markdown", {
        provideLinks: (model) => {
          const lines = model.getValue().split("\n");
          const links = [];

          lines.forEach((line, lineIndex) => {
            dataset.patterns.forEach((pattern) => {
              if (!pattern.word) return;

              const searchPattern =
                (pattern.triggerCharacter || "") + pattern.word;
              let searchStart = 0;
              let index;

              while (
                (index = line.indexOf(searchPattern, searchStart)) !== -1
              ) {
                const lineNumber = lineIndex + 1;
                const start = index + 1;
                const end = start + searchPattern.length;

                if (pattern.actions) {
                  pattern.actions.forEach((action) => {
                    links.push({
                      range: new monaco.Range(
                        lineNumber,
                        start,
                        lineNumber,
                        end
                      ),
                      url: action.url,
                      tooltip: action.tooltip || action.label,
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
            if (pattern.errorReplace && pattern.errorLabel && pattern.word) {
              const searchPattern =
                (pattern.triggerCharacter || "") + pattern.word;
              const index = line.indexOf(searchPattern);

              if (index !== -1) {
                const start = index + 1;
                const end = start + searchPattern.length;

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

    // Enhanced code lens
    disposables.push(
      monaco.languages.registerCodeLensProvider("markdown", {
        provideCodeLenses: (model) => {
          const lines = model.getValue().split("\n");
          const lenses = [];

          lines.forEach((line, lineIndex) => {
            dataset.patterns.forEach((pattern) => {
              if (!pattern.word) return;

              const searchPattern =
                (pattern.triggerCharacter || "") + pattern.word;
              const index = line.indexOf(searchPattern);

              if (index !== -1) {
                const range = {
                  startLineNumber: lineIndex + 1,
                  startColumn: index + 1,
                  endLineNumber: lineIndex + 1,
                  endColumn: index + searchPattern.length + 1,
                };

                if (pattern.actions && pattern.actions.length > 0) {
                  pattern.actions.forEach((action) => {
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
          if (!pattern.word) return;

          const searchPattern = (pattern.triggerCharacter || "") + pattern.word;
          let searchStart = 0;
          let index;

          while ((index = line.indexOf(searchPattern, searchStart)) !== -1) {
            const lineNumber = lineIndex + 1;
            const start = index + 1;
            const end = start + searchPattern.length;

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
                message: pattern.errorLabel || `Issue with: ${searchPattern}`,
                severity: severity,
              });
            }

            searchStart = index + 1;
          }
        });
      });

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
