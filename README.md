# Monacobro.js

**Serializable Monaco Editor Loader** - Transform backend data into a rich Monaco editor with autocomplete, decorations, hover info, and custom language features through simple JSON configuration.

[Demo](https://monacobro.com/monacobro) • [Discuss](https://x.com/janwilmake/status/1949847194019791237)

## Features

Monacobro transforms static JSON data into a fully-featured Monaco editor experience. Define patterns with trigger characters, custom styling, autocomplete suggestions, hover documentation, error markers, inlay hints, and clickable links - all through declarative configuration. Perfect for creating domain-specific editors, documentation tools, or enhanced text experiences without writing complex Monaco provider code.

## Quick Start

```html
<!DOCTYPE html>
<html>
  <head>
    <title>My Editor</title>
  </head>
  <body>
    <!-- Data Configuration -->
    <script type="application/json" id="monacobro-data">
      {
        "content": "Type @john or hello to see suggestions!",
        "styles": {
          "user": {
            "css": "color: #1da1f2 !important; background: rgba(29,161,242,0.1) !important;"
          },
          "greeting": {
            "css": "color: #ff69b4 !important; font-weight: bold !important;"
          }
        },
        "patterns": [
          {
            "word": "john",
            "triggerCharacter": "@",
            "style": "user",
            "info": "<strong>John Doe</strong><br/>Software Developer",
            "inlay": "👤 dev"
          },
          {
            "word": "hello",
            "style": "greeting",
            "info": "A friendly greeting",
            "triggerComplete": "hello world!"
          }
        ]
      }
    </script>

    <!-- Editor Container -->
    <div id="monacobro-container" style="height: 400px;"></div>

    <!-- Scripts -->
    <script src="https://unpkg.com/monaco-editor@0.44.0/min/vs/loader.js"></script>
    <script src="https://monacobro.com/monacobro.js"></script>
  </body>
</html>
```

## Configuration Schema

```typescript
interface MonacobroConfig {
  content: string;
  styles: Record<string, { css: string }>;
  patterns: Pattern[];
}

interface Pattern {
  word: string; // The text to match
  style: string; // Style key from styles object
  triggerCharacter?: string; // Optional trigger char (e.g., "@", "#")
  triggerComplete?: string; // Text to insert on autocomplete
  info?: string; // HTML hover documentation
  inlay?: string; // Inlay hint text
  errorLabel?: string; // Error message
  errorReplace?: string; // Replacement text for errors
  errorSeverity?: "error" | "warning" | "info";
  actions?: Array<{
    url: string;
    label: string;
    hover?: boolean; // Show in hover
    tooltip?: boolean; // Show as code lens
  }>;
}
```

## Extending with Custom Monaco Features

Access the Monaco editor instance and add your own providers:

```javascript
// Wait for editor to initialize
setTimeout(() => {
  const editor = window.monacobro.editor;

  // Add custom completion provider
  const disposable = monaco.languages.registerCompletionItemProvider(
    "markdown",
    {
      provideCompletionItems: (model, position) => ({
        suggestions: [
          {
            label: "myCustomItem",
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: "myCustomItem()",
            documentation: "Custom completion item",
          },
        ],
      }),
    }
  );

  // Register for cleanup
  window.monacobro.addDisposable(disposable);
}, 1000);
```

## Dynamic Updates

Update the JSON data in the script tag and Monacobro will automatically reload:

```javascript
const dataScript = document.getElementById("monacobro-data");
const config = JSON.parse(dataScript.textContent);
config.content = "Updated content!";
config.patterns.push({ word: "new", style: "highlight" });
dataScript.textContent = JSON.stringify(config);
```

---

> **⚠️ Production Warning**  
> This module may have breaking changes. Copy the script to your own environment for production use.

# TODO

- ✅ Automatically adjust to system-theme
- ✅ Use `mutation-observer.html` example to allow listening to changes of the data and rendering that.
- ✅ Add JSDoc intellisense for the `monacobro.js` file
- Try to reduce layout shifts onload and on refresh
- Check how monaco is loaded in xytext and what is needed to use monacobro instead (e.g. how to create additional listeners? this is important to know)
- Try using it in xytext
- Create documentation of how to use it and where the boundary is...

Focus on buglessness. Then use this in LMPIFY (for URLs only at first). Worth a post.

- url has: inlay with tokencount, orange underline color style, goto button, hover title+description+og-image
- on every edit, content should load in new monacobro-data object just like with textarea, so new urls get added quickly.

Having this will open the door to something much more interesting: a background agent, gathering suggestions and caching those, then showing them inline in the markdown! It may be interesting to use the Task API for this, but also, of course, my own apis.
