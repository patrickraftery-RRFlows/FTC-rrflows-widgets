# FTC-rrflows-widgets

Public-hosted client widgets for embedding via Wix and other platforms.

## FTC Chatbot Widget

Lives at `ftc/`. Embedded on `https://www.fltechcouncil.org/` via Wix Custom Code.

- `ftc-chat-widget.js` — main widget (v2.2, branded)
- `FTC_logo.png` — header / avatar logo

### Wix Custom Code snippet

```html
<script src="https://cdn.jsdelivr.net/gh/patrickraftery-RRFlows/FTC-rrflows-widgets@main/ftc/ftc-chat-widget.js?v=2.2" defer></script>
```

The widget auto-resolves the asset base from its own `<script src>` so the logo loads from the same directory.

### Webhook target

`https://n8n-ftc.rrflows.com/webhook/ftc-chat` — n8n workflow `A93Lrx9q2bWZeidO` on FTC's dedicated VPS.
