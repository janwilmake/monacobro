make a monaco markdown editor in a html codeblock that has auto-completion intellisense for urls.

when no hostname is typed yet, it should show autocompletion of a few hardcoded domains

when a hostname is typed, it should look for {url}/openapi.json. if it is found, it should autocomplete with all paths available in the openapi for any pathname on the hostname. the summary and/or description must be rendered and it should show the type of the input in the description too (only if available! assume nothing) . disable the default completions

some urls to be in the example and initial text in the editor:

- uithub.com
- xymake.com
- openapisearch.com
