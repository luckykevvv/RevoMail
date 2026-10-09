function externaliseMessageLinks(safeHtml) {
  return String(safeHtml).replace(/<a\b([^>]*)>/gi, (_match, attributes) => {
    const safeAttributes = attributes.replace(/\s(?:target|rel)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    return `<a${safeAttributes} target="_blank" rel="noopener noreferrer">`;
  });
}

export function messageFrameDocument(safeHtml) {
  return `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><base target="_blank"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'"><style>
html{color-scheme:light;background:#fff}
body{margin:0;min-width:0;font:14px/1.65 system-ui;color:#172033;overflow-wrap:break-word;word-break:normal}
img{max-width:100%;height:auto;color:transparent!important;font-size:0!important;line-height:0!important}
table{max-width:100%;border-collapse:collapse;table-layout:auto}
td,th{overflow-wrap:normal!important;word-break:normal!important}
[hidden],[aria-hidden="true"],[class*="preheader" i],[class*="preview-text" i],[class*="previewtext" i],[class*="mcnpreviewtext" i],[id*="preheader" i],[id*="preview-text" i],[id*="previewtext" i]{display:none!important;max-height:0!important;overflow:hidden!important}
</style>${externaliseMessageLinks(safeHtml)}`;
}
