# Monacobro.js

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
