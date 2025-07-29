// Get dataset from script tag
const datasetScript = document.getElementById("monacobro-data");
let dataset = JSON.parse(datasetScript.textContent);

// State tracking for efficient updates
let currentDecorations = [];
let disposables = [];
let editor = null;
let lastDatasetHash = null;

// Helper to create a simple hash of the dataset
function hashDataset(data) {
  return JSON.stringify({
    patterns: data.patterns,
    styles: data.styles,
    content: data.content,
  });
}

// Clean up all Monaco disposables
function cleanupDisposables() {
  disposables.forEach((d) => d.dispose());
  disposables = [];
}

// Update CSS styles
function updateStyles(newStyles) {
  const existingStyle = document.querySelector("#monacobro-styles");
  if (existingStyle) {
    existingStyle.remove();
  }

  const style = document.createElement("style");
  style.id = "monacobro-styles";
  let css = "";

  Object.entries(newStyles).forEach(([styleName, styleConfig]) => {
    css += `.monaco-editor .style-${styleName} { ${styleConfig.css} }\n`;
  });

  style.textContent = css;
  document.head.appendChild(style);
}

// Helper function to get trigger context at position
function getTriggerContext(model, position) {
  const line = model.getLineContent(position.lineNumber);
  const beforeCursor = line.substring(0, position.column - 1);

  const triggerCharacters = [
    ...new Set(dataset.patterns.map((p) => p.triggerCharacter).filter(Boolean)),
  ];

  // Check for trigger characters first
  let triggerChar = null;
  let triggerIndex = -1;

  for (const char of triggerCharacters) {
    const lastIndex = beforeCursor.lastIndexOf(char);
    if (lastIndex > triggerIndex) {
      triggerIndex = lastIndex;
      triggerChar = char;
    }
  }

  if (triggerIndex !== -1) {
    const textAfterTrigger = beforeCursor.substring(triggerIndex + 1);
    if (!/\s/.test(textAfterTrigger)) {
      return {
        triggerChar,
        triggerIndex,
        textAfterTrigger,
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: triggerIndex + 2,
          endColumn: position.column,
        },
      };
    }
  }

  // Check for regular word patterns
  const word = model.getWordUntilPosition(position);
  if (word.word.length > 0) {
    return {
      triggerChar: null,
      triggerIndex: -1,
      textAfterTrigger: word.word,
      range: {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      },
    };
  }

  return null;
}

// Apply decorations and markers
function updateDecorations() {
  if (!editor) return;

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

        decorations.push({
          range: new monaco.Range(lineNumber, start, lineNumber, end),
          options: { inlineClassName: `style-${pattern.style}` },
        });

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

  currentDecorations = editor.deltaDecorations(currentDecorations, decorations);
  monaco.editor.setModelMarkers(model, "patterns", markers);
}

// Register all Monaco providers
function registerProviders() {
  cleanupDisposables();

  const triggerCharacters = [
    ...new Set(dataset.patterns.map((p) => p.triggerCharacter).filter(Boolean)),
  ];

  // Autocomplete provider
  disposables.push(
    monaco.languages.registerCompletionItemProvider("markdown", {
      triggerCharacters: [
        ...triggerCharacters,
        ..."abcdefghijklmnopqrstuvwxyz",
      ],
      provideCompletionItems: function (model, position, context) {
        const triggerContext = getTriggerContext(model, position);
        if (!triggerContext) return { suggestions: [] };

        const { triggerChar, textAfterTrigger, range } = triggerContext;
        const suggestions = [];

        const matchingPatterns = dataset.patterns.filter((pattern) => {
          if (!pattern.word) return false;
          if (triggerChar && pattern.triggerCharacter !== triggerChar)
            return false;
          if (!triggerChar && pattern.triggerCharacter) return false;

          const isMatch =
            textAfterTrigger.length === 0 ||
            pattern.word
              .toLowerCase()
              .startsWith(textAfterTrigger.toLowerCase());

          return isMatch && pattern.word !== textAfterTrigger;
        });

        matchingPatterns.forEach((pattern, index) => {
          const plainText = pattern.info
            ? pattern.info.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, "")
            : "";
          const lines = plainText.split("\n").filter((l) => l.trim());

          suggestions.push({
            label: {
              label: pattern.word,
              detail: lines.length > 1 ? lines[1] : "",
              description: lines.length > 2 ? lines.slice(2, 4).join(" ") : "",
            },
            kind: monaco.languages.CompletionItemKind.Text,
            insertText: pattern.triggerComplete || pattern.word,
            range,
            documentation: {
              value: pattern.info || pattern.word,
              isTrusted: true,
              supportHtml: true,
            },
            sortText: String(index).padStart(3, "0"),
            filterText: pattern.word,
            preselect:
              textAfterTrigger.length > 0 &&
              pattern.word
                .toLowerCase()
                .startsWith(textAfterTrigger.toLowerCase()),
          });
        });

        return { suggestions };
      },
    })
  );

  // Inlay hints provider
  disposables.push(
    monaco.languages.registerInlayHintsProvider("markdown", {
      provideInlayHints(model, range, token) {
        const hints = [];
        const lines = model.getValue().split("\n");
        let inCodeBlock = false;

        lines.forEach((line, lineIndex) => {
          const lineNumber = lineIndex + 1;
          if (
            lineNumber < range.startLineNumber ||
            lineNumber > range.endLineNumber
          )
            return;

          if (line.trim().startsWith("```")) {
            inCodeBlock = !inCodeBlock;
            return;
          }
          if (inCodeBlock) return;

          dataset.patterns.forEach((pattern) => {
            if (!pattern.word || !pattern.inlay) return;

            const searchPattern =
              (pattern.triggerCharacter || "") + pattern.word;
            let searchStart = 0;
            let index;

            while ((index = line.indexOf(searchPattern, searchStart)) !== -1) {
              const endColumn = index + searchPattern.length + 1;

              hints.push({
                kind: monaco.languages.InlayHintKind.Type,
                position: { column: endColumn, lineNumber: lineNumber },
                label: `: ${pattern.inlay}`,
                whitespaceBefore: true,
                tooltip: pattern.info
                  ? {
                      value: pattern.info,
                      supportHtml: true,
                    }
                  : undefined,
              });

              searchStart = index + 1;
            }
          });
        });

        return { hints, dispose: () => {} };
      },
    })
  );

  // Hover provider
  disposables.push(
    monaco.languages.registerHoverProvider("markdown", {
      provideHover: (model, position) => {
        const line = model.getLineContent(position.lineNumber);

        for (const pattern of dataset.patterns) {
          if (!pattern.word) continue;

          const searchPattern = (pattern.triggerCharacter || "") + pattern.word;
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

  // Link provider
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

            while ((index = line.indexOf(searchPattern, searchStart)) !== -1) {
              const lineNumber = lineIndex + 1;
              const start = index + 1;
              const end = start + searchPattern.length;

              if (pattern.actions) {
                pattern.actions.forEach((action) => {
                  links.push({
                    range: new monaco.Range(lineNumber, start, lineNumber, end),
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

  // Code action provider
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

  // Code lens provider
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
}

// Handle dataset updates efficiently
function handleDatasetUpdate(newDataset) {
  const newHash = hashDataset(newDataset);

  // Skip if no actual changes
  if (newHash === lastDatasetHash) return;

  const oldDataset = dataset;
  dataset = newDataset;
  lastDatasetHash = newHash;

  // Update styles if changed
  if (JSON.stringify(oldDataset.styles) !== JSON.stringify(newDataset.styles)) {
    updateStyles(newDataset.styles);
  }

  // Update content if changed
  if (oldDataset.content !== newDataset.content) {
    const currentPosition = editor.getPosition();
    editor.setValue(newDataset.content);
    editor.setPosition(currentPosition);
  }

  // Re-register providers if patterns changed
  if (
    JSON.stringify(oldDataset.patterns) !== JSON.stringify(newDataset.patterns)
  ) {
    registerProviders();
  }

  // Always update decorations as they depend on current content and patterns
  setTimeout(updateDecorations, 50);
}

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "vs-dark"
    : "vs";
}

function updateMonacoTheme() {
  if (editor) {
    const theme = getSystemTheme();
    monaco.editor.setTheme(theme);
  }
}

// Set up mutation observer
new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === "childList" || mutation.type === "characterData") {
      try {
        const newDataset = JSON.parse(datasetScript.textContent);
        handleDatasetUpdate(newDataset);
      } catch (e) {
        console.error("Failed to parse updated dataset:", e);
      }
    }
  });
}).observe(datasetScript, {
  subtree: true,
  childList: true,
  characterData: true,
});

// Initialize Monaco Editor
require.config({
  paths: { vs: "https://unpkg.com/monaco-editor@0.44.0/min/vs" },
});

require(["vs/editor/editor.main"], function () {
  // Initial setup
  updateStyles(dataset.styles);
  lastDatasetHash = hashDataset(dataset);

  // Create editor
  editor = monaco.editor.create(
    document.getElementById("monacobro-container"),
    {
      value: dataset.content,
      language: "markdown",
      theme: getSystemTheme(),
      fontSize: 14,
      lineNumbers: "on",
      wordWrap: "on",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      lightbulb: { enabled: true },
      links: false,
      suggest: {
        showIcons: true,
        showSnippets: true,
        showWords: true,
        preview: true,
        snippetsPreventQuickSuggestions: false,
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
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnCommitCharacter: true,
      acceptSuggestionOnEnter: "on",
      wordBasedSuggestions: true,
      inlayHints: {
        enabled: true,
        fontSize: 12,
        fontFamily: "Segoe UI, system-ui",
      },
    }
  );

  // Register providers
  registerProviders();

  // URL opener command
  monaco.editor.addCommand({
    id: "openUrl",
    run: (_, url) => window.open(url, "_blank"),
  });

  // Auto-trigger suggestions on typing
  let typingTimer;
  editor.onDidChangeModelContent((e) => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      const position = editor.getPosition();
      const model = editor.getModel();
      const triggerContext = getTriggerContext(model, position);

      if (triggerContext && triggerContext.textAfterTrigger.length > 0) {
        const matchingPatterns = dataset.patterns.filter((pattern) => {
          if (!pattern.word) return false;

          const triggerMatches = triggerContext.triggerChar
            ? pattern.triggerCharacter === triggerContext.triggerChar
            : !pattern.triggerCharacter;

          const wordMatches =
            pattern.word
              .toLowerCase()
              .startsWith(triggerContext.textAfterTrigger.toLowerCase()) &&
            pattern.word !== triggerContext.textAfterTrigger;

          return triggerMatches && wordMatches;
        });

        if (matchingPatterns.length > 0) {
          editor.trigger("auto", "editor.action.triggerSuggest", {});
        }
      }

      updateDecorations();
    }, 150);
  });

  // Manual trigger
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
    editor.trigger("manual", "editor.action.triggerSuggest", {});
  });

  // Auto-expand suggestions
  setTimeout(() => {
    try {
      const suggestController = editor.getContribution(
        "editor.contrib.suggestController"
      );
      if (
        suggestController &&
        suggestController.widget &&
        suggestController.widget.value
      ) {
        suggestController.widget.value._setDetailsVisible(true);
      }
    } catch (e) {
      console.log("Could not auto-expand suggestions details:", e);
    }
  }, 100);

  // Initial decoration update
  setTimeout(updateDecorations, 100);

  // Auto-resize and focus
  window.addEventListener("resize", () => editor.layout());
  editor.focus();

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", updateMonacoTheme);

  // Cleanup on unload
  window.addEventListener("beforeunload", () => {
    cleanupDisposables();
    mediaQuery.removeEventListener("change", updateMonacoTheme);
  });
});
