/**
 * FTC Chat Widget v2.2
 * Florida Technology Council - AI Assistant
 *
 * External-loader architecture: this file is served from a static asset
 * host (configured via CONFIG.assetBase below) and pulled into Wix via a
 * one-line <script src="..." defer></script> tag in Settings -> Custom Code.
 *
 * No 15K Wix Custom Code char limit, no minification needed.
 *
 * Posts to: https://n8n-ftc.rrflows.com/webhook/ftc-chat
 * Deployed: 2026-04-29
 */
;(function() {
  'use strict'

  // --- Configuration ---
  const CONFIG = {
    webhookUrl: 'https://n8n-ftc.rrflows.com/webhook/ftc-chat',
    // Where the widget's static assets (logo, etc.) live. The loader script
    // tag's src= determines this implicitly; defaulting to the same dir.
    assetBase: (function() {
      // Resolve base from this script's own src so assets sit alongside the JS.
      // Prefer document.currentScript (the canonical API); fall back to a
      // strict filename match against script tags in document order.
      try {
        const cur = document.currentScript
        if (cur && cur.src && /\/ftc-chat-widget(?:[.\-]v?[\d.]+)?\.js(?:\?|$)/.test(cur.src)) {
          return cur.src.replace(/[^/]+(?:\?.*)?$/, '')
        }
        const scripts = document.getElementsByTagName('script')
        for (let i = scripts.length - 1; i >= 0; i--) {
          const s = scripts[i].src || ''
          if (/\/ftc-chat-widget(?:[.\-]v?[\d.]+)?\.js(?:\?|$)/.test(s)) {
            return s.replace(/[^/]+(?:\?.*)?$/, '')
          }
        }
      } catch (e) {}
      // Fallback: configure here if auto-detect fails.
      return 'https://widgets.rrflows.com/ftc/'
    })(),
    botName: 'FTC Assistant',
    placeholder: 'Ask about FTC programs, events, membership...',
    welcomeMessage: 'Hi! I\'m the FTC AI Assistant. Ask me anything about the Florida Technology Council -- membership, events, programs, and more.',
    welcomeChips: [
      'What are the benefits of FTC membership?',
      'What upcoming events do you have?',
      'Tell me about FTC programs',
      'How do I contact FTC?'
    ],
    rateLimit: 8,
    rateLimitWindow: 60000,
    maxMessageLength: 1000
  }

  const LOGO_URL = CONFIG.assetBase + 'FTC_logo.png'

  // --- Session Management ---
  function getSessionId() {
    let sid = sessionStorage.getItem('rrflows-chat-sid')
    if (!sid) {
      sid = 'ftc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8)
      sessionStorage.setItem('rrflows-chat-sid', sid)
    }
    return sid
  }

  // --- Rate Limiting ---
  const rateLimiter = {
    timestamps: [],
    check() {
      const now = Date.now()
      this.timestamps = this.timestamps.filter(t => now - t < CONFIG.rateLimitWindow)
      if (this.timestamps.length >= CONFIG.rateLimit) return false
      this.timestamps.push(now)
      return true
    }
  }

  // --- Markdown Renderer (lightweight, XSS-safe) ---
  function renderMarkdown(text) {
    if (!text) return ''

    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    html = html.replace(/^## (.+)$/gm, '<strong class="rrflows-chat-heading">$1</strong>')
    html = html.replace(/^### (.+)$/gm, '<strong class="rrflows-chat-subheading">$1</strong>')
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>')
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="rrflows-chat-link">$1</a>')
    html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<div class="rrflows-chat-list-item"><span class="rrflows-chat-list-num">$1.</span> $2</div>')
    html = html.replace(/^[-*]\s+(.+)$/gm, '<div class="rrflows-chat-list-item"><span class="rrflows-chat-bullet"></span>$1</div>')
    html = html.replace(/\n\n+/g, '</p><p>')
    html = html.replace(/\n/g, '<br>')
    html = '<p>' + html + '</p>'
    html = html.replace(/<p>\s*<\/p>/g, '')

    return html
  }

  // --- Build DOM ---
  function createWidget() {
    const container = document.createElement('div')
    container.id = 'rrflows-chat-container'
    container.innerHTML = `
      <button id="rrflows-chat-toggle" aria-label="Open FTC chat assistant">
        <img class="rrflows-chat-toggle-logo" src="${LOGO_URL}" alt="FTC" width="44" height="44">
      </button>
      <div id="rrflows-chat-window" class="rrflows-chat-hidden" role="dialog" aria-label="FTC Assistant">
        <div id="rrflows-chat-header">
          <img class="rrflows-chat-header-logo" src="${LOGO_URL}" alt="" width="36" height="36">
          <div id="rrflows-chat-header-info">
            <span id="rrflows-chat-header-name">${CONFIG.botName}</span>
            <span id="rrflows-chat-header-status">
              <span class="rrflows-chat-status-dot"></span>Online
            </span>
          </div>
          <div id="rrflows-chat-header-actions">
            <button id="rrflows-chat-minimize" aria-label="Minimize chat" title="Minimize">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            <button id="rrflows-chat-close" aria-label="Close chat" title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="6" y1="6" x2="18" y2="18"></line>
                <line x1="18" y1="6" x2="6" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        <div id="rrflows-chat-messages"></div>
        <div id="rrflows-chat-welcome-chips"></div>
        <div id="rrflows-chat-followups"></div>
        <div id="rrflows-chat-input-area">
          <input id="rrflows-chat-input" type="text" placeholder="${CONFIG.placeholder}" maxlength="${CONFIG.maxMessageLength}" autocomplete="off" aria-label="Type your question">
          <button id="rrflows-chat-send" aria-label="Send message">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
        <div id="rrflows-chat-footer">
          Powered by <a href="https://rrflows.com" target="_blank" rel="noopener noreferrer">RRFlows</a>
        </div>
      </div>
    `
    document.body.appendChild(container)
    return container
  }

  // --- Welcome Chips ---
  function renderWelcomeChips() {
    const container = document.getElementById('rrflows-chat-welcome-chips')
    container.innerHTML = ''
    for (const text of CONFIG.welcomeChips) {
      const chip = document.createElement('button')
      chip.className = 'rrflows-chat-chip rrflows-chat-chip-welcome'
      chip.textContent = text
      chip.addEventListener('click', function() {
        hideWelcomeChips()
        sendMessage(text)
      })
      container.appendChild(chip)
    }
  }

  function hideWelcomeChips() {
    const container = document.getElementById('rrflows-chat-welcome-chips')
    if (container) container.innerHTML = ''
  }

  // --- Message Rendering ---
  function addMessage(role, content, extras) {
    const messages = document.getElementById('rrflows-chat-messages')
    const row = document.createElement('div')
    row.className = `rrflows-chat-row rrflows-chat-row-${role}`

    if (role === 'bot') {
      const avatar = document.createElement('img')
      avatar.className = 'rrflows-chat-avatar'
      avatar.src = LOGO_URL
      avatar.alt = ''
      avatar.width = 26
      avatar.height = 26
      row.appendChild(avatar)
    }

    const bubble = document.createElement('div')
    bubble.className = `rrflows-chat-bubble rrflows-chat-${role}`

    if (role === 'bot') {
      bubble.innerHTML = renderMarkdown(content)
    } else {
      bubble.textContent = content
    }

    row.appendChild(bubble)
    messages.appendChild(row)

    if (extras && extras.followUpQuestions && extras.followUpQuestions.length > 0) {
      renderFollowUps(extras.followUpQuestions)
    }
    if (extras && extras.suggestions && extras.suggestions.length > 0) {
      renderSuggestions(extras.suggestions)
    }

    messages.scrollTop = messages.scrollHeight
  }

  function renderFollowUps(questions) {
    const container = document.getElementById('rrflows-chat-followups')
    container.innerHTML = ''
    for (const q of questions) {
      const chip = document.createElement('button')
      chip.className = 'rrflows-chat-chip'
      chip.textContent = q
      chip.addEventListener('click', function() {
        container.innerHTML = ''
        sendMessage(q)
      })
      container.appendChild(chip)
    }
  }

  function renderSuggestions(topics) {
    const container = document.getElementById('rrflows-chat-followups')
    container.innerHTML = ''
    const label = document.createElement('div')
    label.className = 'rrflows-chat-chip-label'
    label.textContent = 'Try asking about:'
    container.appendChild(label)
    for (const topic of topics) {
      const chip = document.createElement('button')
      chip.className = 'rrflows-chat-chip rrflows-chat-chip-suggestion'
      chip.textContent = topic
      chip.addEventListener('click', function() {
        container.innerHTML = ''
        sendMessage('Tell me about ' + topic)
      })
      container.appendChild(chip)
    }
  }

  function showTyping() {
    const messages = document.getElementById('rrflows-chat-messages')
    const row = document.createElement('div')
    row.className = 'rrflows-chat-row rrflows-chat-row-bot'
    row.id = 'rrflows-chat-typing'
    const avatar = document.createElement('img')
    avatar.className = 'rrflows-chat-avatar'
    avatar.src = LOGO_URL
    avatar.alt = ''
    avatar.width = 26
    avatar.height = 26
    row.appendChild(avatar)
    const typing = document.createElement('div')
    typing.className = 'rrflows-chat-bubble rrflows-chat-bot rrflows-chat-typing'
    typing.innerHTML = '<span></span><span></span><span></span>'
    row.appendChild(typing)
    messages.appendChild(row)
    messages.scrollTop = messages.scrollHeight
  }

  function removeTyping() {
    const el = document.getElementById('rrflows-chat-typing')
    if (el) el.remove()
  }

  // --- API Communication ---
  async function sendMessage(text) {
    if (!text || !text.trim()) return

    const input = document.getElementById('rrflows-chat-input')
    const sendBtn = document.getElementById('rrflows-chat-send')

    hideWelcomeChips()
    document.getElementById('rrflows-chat-followups').innerHTML = ''

    if (!rateLimiter.check()) {
      addMessage('bot', 'You\'re sending messages too quickly. Please wait a moment.')
      return
    }

    const sanitized = text.replace(/[\u0000-\u001F\u007F]/g, '').trim().substring(0, CONFIG.maxMessageLength)
    if (!sanitized) return

    addMessage('user', sanitized)
    input.value = ''
    input.disabled = true
    sendBtn.disabled = true
    showTyping()

    try {
      const response = await fetch(CONFIG.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: sanitized,
          sessionId: getSessionId()
        })
      })

      removeTyping()

      let data
      try {
        data = await response.json()
      } catch (e) {
        addMessage('bot', 'I\'m having trouble connecting right now. Please try again in a moment.')
        return
      }

      if (response.status === 429) {
        addMessage('bot', data.message || 'Too many requests. Please wait a moment and try again.')
        return
      }

      if (!response.ok) {
        addMessage('bot', data.message || 'Something went wrong. Please try again.')
        return
      }

      if (data.success && data.answer) {
        addMessage('bot', data.answer, {
          followUpQuestions: data.followUpQuestions || [],
          suggestions: data.suggestions || []
        })
      } else {
        addMessage('bot', data.message || 'I wasn\'t able to answer that. Please try rephrasing your question.')
      }
    } catch (err) {
      removeTyping()
      addMessage('bot', 'I\'m unable to connect right now. Please check your internet connection and try again.')
    } finally {
      input.disabled = false
      sendBtn.disabled = false
      input.focus()
    }
  }

  // --- Event Handlers ---
  function initEvents() {
    const toggle = document.getElementById('rrflows-chat-toggle')
    const window_ = document.getElementById('rrflows-chat-window')
    const minimize = document.getElementById('rrflows-chat-minimize')
    const close = document.getElementById('rrflows-chat-close')
    const input = document.getElementById('rrflows-chat-input')
    const send = document.getElementById('rrflows-chat-send')
    const messages = document.getElementById('rrflows-chat-messages')

    let opened = false

    function openWindow() {
      window_.classList.remove('rrflows-chat-hidden')
      toggle.classList.add('rrflows-chat-toggle-hidden')
      input.focus()
      if (!opened) {
        addMessage('bot', CONFIG.welcomeMessage)
        renderWelcomeChips()
        opened = true
      }
    }

    function minimizeWindow() {
      window_.classList.add('rrflows-chat-hidden')
      toggle.classList.remove('rrflows-chat-toggle-hidden')
    }

    function closeWindow() {
      window_.classList.add('rrflows-chat-hidden')
      toggle.classList.remove('rrflows-chat-toggle-hidden')
      messages.innerHTML = ''
      hideWelcomeChips()
      document.getElementById('rrflows-chat-followups').innerHTML = ''
      opened = false
    }

    toggle.addEventListener('click', openWindow)
    minimize.addEventListener('click', minimizeWindow)
    close.addEventListener('click', closeWindow)

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage(input.value)
      }
    })

    send.addEventListener('click', function() {
      sendMessage(input.value)
    })
  }

  // --- Styles ---
  function injectStyles() {
    const style = document.createElement('style')
    style.textContent = `
      :root {
        --ftc-primary: #0f2c5c;
        --ftc-primary-deep: #082046;
        --ftc-accent: #1a4d8c;
        --ftc-accent-soft: #2563ad;
        --ftc-link: #1a4d8c;
        --ftc-link-hover: #0f2c5c;
        --ftc-text: #1a1a2e;
        --ftc-text-muted: #64748b;
        --ftc-surface: #ffffff;
        --ftc-surface-soft: #f8f9fa;
        --ftc-border: #e2e8f0;
        --ftc-border-strong: #cbd5e1;
        --ftc-chip-bg: #eef3f9;
        --ftc-chip-border: #cdd9e8;
        --ftc-chip-suggest-bg: #e8f1fb;
        --ftc-chip-suggest-border: #b3cde8;
        --ftc-status-dot: #10b981;
      }

      #rrflows-chat-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: var(--ftc-text);
      }

      /* Toggle button */
      #rrflows-chat-toggle {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: var(--ftc-surface);
        color: var(--ftc-primary);
        border: 2px solid var(--ftc-primary);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        box-shadow: 0 4px 14px rgba(15, 44, 92, 0.30), 0 0 0 0 rgba(15, 44, 92, 0.4);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        animation: rrflows-pulse 3s ease-in-out infinite;
      }
      #rrflows-chat-toggle:hover {
        transform: scale(1.06);
        box-shadow: 0 6px 20px rgba(15, 44, 92, 0.40), 0 0 0 8px rgba(15, 44, 92, 0.08);
        animation: none;
      }
      .rrflows-chat-toggle-logo {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        display: block;
      }
      .rrflows-chat-toggle-hidden { display: none !important; }
      @keyframes rrflows-pulse {
        0%, 100% { box-shadow: 0 4px 14px rgba(15, 44, 92, 0.30), 0 0 0 0 rgba(15, 44, 92, 0.5); }
        50%      { box-shadow: 0 4px 14px rgba(15, 44, 92, 0.30), 0 0 0 12px rgba(15, 44, 92, 0); }
      }

      /* Chat window */
      #rrflows-chat-window {
        width: 380px;
        max-width: calc(100vw - 40px);
        height: 540px;
        max-height: calc(100vh - 100px);
        background: var(--ftc-surface);
        border-radius: 16px;
        box-shadow: 0 12px 40px rgba(15, 23, 42, 0.18), 0 2px 8px rgba(15, 23, 42, 0.08);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: absolute;
        bottom: 0;
        right: 0;
        animation: rrflows-slide-in 220ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      .rrflows-chat-hidden { display: none !important; }
      @keyframes rrflows-slide-in {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* Header */
      #rrflows-chat-header {
        background: linear-gradient(135deg, var(--ftc-primary) 0%, var(--ftc-accent) 100%);
        color: #fff;
        padding: 12px 14px;
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
      }
      .rrflows-chat-header-logo {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: #fff;
        padding: 2px;
        flex-shrink: 0;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
      }
      #rrflows-chat-header-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      #rrflows-chat-header-name { font-weight: 600; font-size: 15px; letter-spacing: 0.1px; }
      #rrflows-chat-header-status {
        font-size: 11px;
        opacity: 0.85;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .rrflows-chat-status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--ftc-status-dot);
        box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6);
        animation: rrflows-status-pulse 2s ease-in-out infinite;
      }
      @keyframes rrflows-status-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
        50%      { box-shadow: 0 0 0 4px rgba(16, 185, 129, 0); }
      }
      #rrflows-chat-header-actions { display: flex; gap: 4px; }
      #rrflows-chat-minimize, #rrflows-chat-close {
        width: 28px;
        height: 28px;
        background: rgba(255, 255, 255, 0.1);
        border: none;
        color: #fff;
        cursor: pointer;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.85;
        transition: background 0.15s ease, opacity 0.15s ease;
      }
      #rrflows-chat-minimize:hover, #rrflows-chat-close:hover {
        background: rgba(255, 255, 255, 0.22);
        opacity: 1;
      }

      /* Messages area */
      #rrflows-chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: var(--ftc-surface-soft);
      }

      /* Message rows (avatar + bubble) */
      .rrflows-chat-row {
        display: flex;
        gap: 8px;
        align-items: flex-end;
        max-width: 100%;
      }
      .rrflows-chat-row-user {
        justify-content: flex-end;
      }
      .rrflows-chat-row-bot {
        justify-content: flex-start;
      }
      .rrflows-chat-avatar {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: #fff;
        border: 1px solid var(--ftc-border);
        flex-shrink: 0;
        margin-bottom: 2px;
      }

      /* Message bubbles */
      .rrflows-chat-bubble {
        max-width: 85%;
        padding: 10px 14px;
        word-wrap: break-word;
        overflow-wrap: break-word;
        animation: rrflows-bubble-in 180ms ease-out;
      }
      @keyframes rrflows-bubble-in {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .rrflows-chat-user {
        background: linear-gradient(135deg, var(--ftc-primary) 0%, var(--ftc-primary-deep) 100%);
        color: #fff;
        border-radius: 16px 16px 4px 16px;
        box-shadow: 0 1px 2px rgba(15, 44, 92, 0.18);
      }
      .rrflows-chat-bot {
        background: var(--ftc-surface);
        color: var(--ftc-text);
        border-radius: 16px 16px 16px 4px;
        border: 1px solid var(--ftc-border);
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      }

      /* Markdown content styles */
      .rrflows-chat-bot p { margin: 0 0 8px 0; }
      .rrflows-chat-bot p:last-child { margin-bottom: 0; }
      .rrflows-chat-bot strong { font-weight: 600; }
      .rrflows-chat-heading { display: block; font-size: 15px; margin: 8px 0 4px; }
      .rrflows-chat-subheading { display: block; font-size: 14px; margin: 6px 0 4px; }
      .rrflows-chat-link { color: var(--ftc-link); text-decoration: underline; }
      .rrflows-chat-link:hover { color: var(--ftc-link-hover); }
      .rrflows-chat-list-item {
        display: block;
        padding: 2px 0 2px 18px;
        position: relative;
      }
      .rrflows-chat-list-num {
        font-weight: 600;
        position: absolute;
        left: 0;
        top: 2px;
      }
      .rrflows-chat-bullet {
        display: inline-block;
        width: 5px;
        height: 5px;
        background: var(--ftc-text-muted);
        border-radius: 50%;
        position: absolute;
        left: 6px;
        top: 11px;
      }

      /* Welcome chips (shown on first open) */
      #rrflows-chat-welcome-chips {
        padding: 0 16px 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        flex-shrink: 0;
        background: var(--ftc-surface-soft);
      }
      #rrflows-chat-welcome-chips:empty { padding: 0; }

      /* Follow-up chips */
      #rrflows-chat-followups {
        padding: 0 12px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        flex-shrink: 0;
        max-height: 120px;
        overflow-y: auto;
      }
      #rrflows-chat-followups:empty { padding: 0; }
      .rrflows-chat-chip-label {
        width: 100%;
        font-size: 11px;
        color: var(--ftc-text-muted);
        padding: 6px 0 2px;
      }
      .rrflows-chat-chip {
        background: var(--ftc-chip-bg);
        border: 1px solid var(--ftc-chip-border);
        border-radius: 16px;
        padding: 6px 12px;
        font-size: 12px;
        color: var(--ftc-primary);
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
        text-align: left;
        line-height: 1.4;
        font-family: inherit;
        min-height: 30px;
      }
      .rrflows-chat-chip:hover {
        background: #dde7f3;
        border-color: var(--ftc-accent);
      }
      .rrflows-chat-chip:active { transform: scale(0.97); }
      .rrflows-chat-chip-welcome {
        background: var(--ftc-surface);
        border-color: var(--ftc-border-strong);
      }
      .rrflows-chat-chip-welcome:hover {
        background: #f0f6fc;
        border-color: var(--ftc-primary);
      }
      .rrflows-chat-chip-suggestion {
        background: var(--ftc-chip-suggest-bg);
        border-color: var(--ftc-chip-suggest-border);
      }
      .rrflows-chat-chip-suggestion:hover { background: #d4e4f5; }

      /* Input area */
      #rrflows-chat-input-area {
        display: flex;
        padding: 10px 12px;
        gap: 8px;
        border-top: 1px solid var(--ftc-border);
        background: var(--ftc-surface);
        flex-shrink: 0;
      }
      #rrflows-chat-input {
        flex: 1;
        border: 1px solid var(--ftc-chip-border);
        border-radius: 20px;
        padding: 9px 14px;
        font-size: 14px;
        outline: none;
        font-family: inherit;
        color: var(--ftc-text);
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
        min-height: 38px;
      }
      #rrflows-chat-input:focus {
        border-color: var(--ftc-primary);
        box-shadow: 0 0 0 3px rgba(15, 44, 92, 0.15);
      }
      #rrflows-chat-input:disabled { background: #f1f5f9; }
      #rrflows-chat-send {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--ftc-primary) 0%, var(--ftc-accent) 100%);
        color: #fff;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: transform 0.1s ease, box-shadow 0.15s ease;
        box-shadow: 0 2px 4px rgba(15, 44, 92, 0.25);
      }
      #rrflows-chat-send:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(15, 44, 92, 0.35);
      }
      #rrflows-chat-send:active svg { transform: rotate(8deg); }
      #rrflows-chat-send svg { transition: transform 0.1s ease; }
      #rrflows-chat-send:disabled {
        background: #94a3b8;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
      }

      /* Footer */
      #rrflows-chat-footer {
        padding: 6px 12px 8px;
        text-align: center;
        font-size: 11px;
        color: var(--ftc-text-muted);
        background: var(--ftc-surface);
        border-top: 1px solid var(--ftc-border);
        flex-shrink: 0;
      }
      #rrflows-chat-footer a {
        color: var(--ftc-text-muted);
        text-decoration: none;
        font-weight: 500;
      }
      #rrflows-chat-footer a:hover { color: var(--ftc-primary); text-decoration: underline; }

      /* Typing indicator */
      .rrflows-chat-typing {
        display: flex;
        gap: 4px;
        padding: 12px 18px;
      }
      .rrflows-chat-typing span {
        width: 6px;
        height: 6px;
        background: var(--ftc-text-muted);
        border-radius: 50%;
        animation: rrflows-bounce 1.2s ease-in-out infinite;
      }
      .rrflows-chat-typing span:nth-child(2) { animation-delay: 0.15s; }
      .rrflows-chat-typing span:nth-child(3) { animation-delay: 0.3s; }
      @keyframes rrflows-bounce {
        0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
        40%           { transform: translateY(-5px); opacity: 1; }
      }

      /* Mobile responsive */
      @media (max-width: 480px) {
        #rrflows-chat-window {
          width: calc(100vw - 20px);
          height: calc(100vh - 80px);
          bottom: 0;
          right: -10px;
          border-radius: 16px 16px 0 0;
        }
        #rrflows-chat-toggle { bottom: 10px; right: 10px; }
      }
    `
    document.head.appendChild(style)
  }

  // --- Initialize ---
  function init() {
    injectStyles()
    createWidget()
    initEvents()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
