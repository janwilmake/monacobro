# Monacobro.js

[Discuss](https://x.com/janwilmake/status/1949847194019791237)

Serializable Monaco.js Loader from backend data

Usage

```html
<!-- Your Data here -->
<script type="application/json" id="monacobro-data">
  {"content":string, "styles": {[key:string]:{css:string}}, "patterns": Pattern[]}
</script>
<!-- Your monaco editor will appear here -->
<div id="monacobro-container"></div>
<script src="https://unpkg.com/monaco-editor@0.44.0/min/vs/loader.js"></script>
<script src="https://monacobro.com/monacobro.js"></script>
```

Demo: [See live demo](https://monacobro.com/monacobro)

> [!WARNING]
>
> This module will have breaking changes so it's best practice to copy/paste the script into your own production environment.

# TODO

- Automatically adjust to system-theme
- Ensure it updates data when application/json data updates
- Try to reduce layout shifts onload

Focus on buglessness. Then use this in lmpify (for URLs only at first). Worth a post.

- url has: inlay with tokencount, orange underline color style, goto button, hover title+description+og-image
- on every edit, content should load in new monacobro-data object just like with textarea, so new urls get added quickly.

Having this will open the door to something much more interesting: a background agent, gathering suggestions and caching those, then showing them inline in the markdown! It may be interesting to use the Task API for this!
