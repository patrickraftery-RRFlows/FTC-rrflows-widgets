/**
 * FTC Chat Widget v2.3
 * Florida Technology Council - AI Assistant
 *
 * External-loader architecture (jsDelivr/CDN), pulled into Wix via a single
 * <script src="..." defer></script> tag in Settings -> Custom Code.
 *
 * Posts:
 *   - chat:     POST https://n8n-ftc.rrflows.com/webhook/ftc-chat
 *   - feedback: POST https://n8n-ftc.rrflows.com/webhook/ftc-chat-feedback
 *   - handoff:  POST https://n8n-ftc.rrflows.com/webhook/ftc-contact
 *
 * v2.3 (2026-04-29):
 *   + Page-context aware welcome chips (different chips per FTC page)
 *   + "Talk to a human" handoff form (posts to FTC contact form webhook)
 *   + "Was this helpful?" thumbs feedback per bot reply
 *   + Accessibility: aria-live, Alt+C shortcut, Esc closes, error retry
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
    feedbackUrl: 'https://n8n-ftc.rrflows.com/webhook/ftc-chat-feedback',
    handoffUrl: 'https://n8n-ftc.rrflows.com/webhook/ftc-contact',
    botName: 'FTC Assistant',
    placeholder: 'Ask about FTC programs, events, membership...',
    welcomeMessage: 'Hi! I\'m the FTC AI Assistant. Ask me anything about the Florida Technology Council -- membership, events, programs, and more.',
    welcomeChipsByRoute: [
      {
        match: /\/(events?|fglms|event-list|tech-day|capitol|about-4)/i,
        chips: [
          'When is the next FTC event?',
          'Tell me about FGLMS 2025',
          'How do I register for events?',
          'What past events are available?'
        ]
      },
      {
        match: /\/(join-now|why-join|member|membership)/i,
        chips: [
          'What are the benefits of FTC membership?',
          'How much does membership cost?',
          'How do I join FTC?',
          'What member resources are available?'
        ]
      },
      {
        match: /\/(florida-technology-magazine|magazine)/i,
        chips: [
          'What is the Florida Technology Magazine?',
          'How do I contribute an article?',
          'Where can I read past issues?',
          'How do I subscribe?'
        ]
      },
      {
        match: /\/(cybersecurity|healthcare|government-operations|education|verticals)/i,
        chips: [
          'What does FTC do in this area?',
          'Who are FTC\'s partners here?',
          'What recent articles cover this topic?',
          'How can I get involved?'
        ]
      }
    ],
    welcomeChipsDefault: [
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
      <div id="rrflows-chat-window" class="rrflows-chat-hidden" role="dialog" aria-modal="false" aria-label="FTC Assistant">
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
        <div id="rrflows-chat-messages" aria-live="polite" aria-atomic="false" aria-relevant="additions"></div>
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
          <button type="button" id="rrflows-chat-handoff-link" class="rrflows-chat-footer-link">Need a person?</button>
          <span class="rrflows-chat-footer-sep" aria-hidden="true"> · </span>
          Powered by <a href="https://rrflows.com" target="_blank" rel="noopener noreferrer">RRFlows</a>
        </div>
      </div>
    `
    document.body.appendChild(container)
    return container
  }

  // --- Page context (for welcome chips + webhook payload) ---
  function getCurrentPage() {
    try {
      return {
        path: (window.location && window.location.pathname) ? window.location.pathname.slice(0, 200) : '',
        title: (document.title || '').slice(0, 200)
      }
    } catch (e) {
      return { path: '', title: '' }
    }
  }

  function getWelcomeChipsForRoute() {
    const path = getCurrentPage().path
    if (Array.isArray(CONFIG.welcomeChipsByRoute)) {
      for (const route of CONFIG.welcomeChipsByRoute) {
        try {
          if (route.match && route.match.test && route.match.test(path) && Array.isArray(route.chips) && route.chips.length) {
            return route.chips
          }
        } catch (e) {}
      }
    }
    return CONFIG.welcomeChipsDefault || []
  }

  // --- Welcome Chips ---
  function renderWelcomeChips() {
    const container = document.getElementById('rrflows-chat-welcome-chips')
    container.innerHTML = ''
    const chips = getWelcomeChipsForRoute()
    for (const text of chips) {
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

    // Feedback thumbs for bot replies (skip welcome message + error fallbacks)
    if (role === 'bot' && extras && extras.allowFeedback) {
      const messageId = extras.messageId || ('msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8))
      renderFeedback(row, messageId, content)
    }

    if (extras && extras.followUpQuestions && extras.followUpQuestions.length > 0) {
      renderFollowUps(extras.followUpQuestions)
    }
    if (extras && extras.suggestions && extras.suggestions.length > 0) {
      renderSuggestions(extras.suggestions)
    }

    messages.scrollTop = messages.scrollHeight
  }

  // --- Feedback (thumbs up/down) ---
  function renderFeedback(rowEl, messageId, botText) {
    const wrap = document.createElement('div')
    wrap.className = 'rrflows-chat-feedback'
    wrap.setAttribute('role', 'group')
    wrap.setAttribute('aria-label', 'Was this answer helpful?')

    const label = document.createElement('span')
    label.className = 'rrflows-chat-feedback-label'
    label.textContent = 'Was this helpful?'
    wrap.appendChild(label)

    const upBtn = document.createElement('button')
    upBtn.type = 'button'
    upBtn.className = 'rrflows-chat-feedback-btn'
    upBtn.setAttribute('aria-label', 'Mark this answer as helpful')
    upBtn.setAttribute('aria-pressed', 'false')
    upBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>'

    const downBtn = document.createElement('button')
    downBtn.type = 'button'
    downBtn.className = 'rrflows-chat-feedback-btn'
    downBtn.setAttribute('aria-label', 'Mark this answer as not helpful')
    downBtn.setAttribute('aria-pressed', 'false')
    downBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>'

    upBtn.addEventListener('click', function() {
      submitFeedback(wrap, messageId, 'up', '', botText)
    })
    downBtn.addEventListener('click', function() {
      promptDownReason(wrap, messageId, botText)
    })

    wrap.appendChild(upBtn)
    wrap.appendChild(downBtn)
    rowEl.appendChild(wrap)
  }

  function promptDownReason(wrap, messageId, botText) {
    wrap.innerHTML = ''
    const form = document.createElement('div')
    form.className = 'rrflows-chat-feedback-form'

    const lbl = document.createElement('label')
    const lblId = 'rrflows-chat-feedback-reason-' + messageId
    lbl.className = 'rrflows-chat-feedback-label'
    lbl.setAttribute('for', lblId)
    lbl.textContent = 'What was wrong? (optional)'
    form.appendChild(lbl)

    const ta = document.createElement('textarea')
    ta.id = lblId
    ta.className = 'rrflows-chat-feedback-textarea'
    ta.rows = 2
    ta.maxLength = 1000
    ta.placeholder = 'Tell us what went wrong...'
    form.appendChild(ta)

    const actions = document.createElement('div')
    actions.className = 'rrflows-chat-feedback-actions'

    const send = document.createElement('button')
    send.type = 'button'
    send.className = 'rrflows-chat-feedback-send'
    send.textContent = 'Send'
    send.addEventListener('click', function() {
      submitFeedback(wrap, messageId, 'down', ta.value, botText)
    })

    const skip = document.createElement('button')
    skip.type = 'button'
    skip.className = 'rrflows-chat-feedback-skip'
    skip.textContent = 'Skip'
    skip.addEventListener('click', function() {
      submitFeedback(wrap, messageId, 'down', '', botText)
    })

    actions.appendChild(send)
    actions.appendChild(skip)
    form.appendChild(actions)
    wrap.appendChild(form)
    ta.focus()
  }

  function submitFeedback(wrap, messageId, vote, reason, botText) {
    wrap.innerHTML = ''
    const ack = document.createElement('span')
    ack.className = 'rrflows-chat-feedback-ack'
    ack.textContent = vote === 'up' ? 'Thanks for the feedback!' : 'Thanks — we\'ll use this to improve.'
    wrap.appendChild(ack)

    fetch(CONFIG.feedbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId,
        vote,
        reason: (reason || '').slice(0, 1000),
        sessionId: getSessionId(),
        conversationContext: (botText || '').slice(0, 4000)
      })
    }).catch(function() { /* silent: feedback is best-effort */ })
  }

  // --- Error message with retry button ---
  function addErrorWithRetry(text, lastUserMessage) {
    const messages = document.getElementById('rrflows-chat-messages')
    const row = document.createElement('div')
    row.className = 'rrflows-chat-row rrflows-chat-row-bot'

    const avatar = document.createElement('img')
    avatar.className = 'rrflows-chat-avatar'
    avatar.src = LOGO_URL
    avatar.alt = ''
    avatar.width = 26
    avatar.height = 26
    row.appendChild(avatar)

    const bubble = document.createElement('div')
    bubble.className = 'rrflows-chat-bubble rrflows-chat-bot'
    bubble.textContent = text
    row.appendChild(bubble)

    if (lastUserMessage) {
      const retry = document.createElement('button')
      retry.type = 'button'
      retry.className = 'rrflows-chat-retry-btn'
      retry.setAttribute('aria-label', 'Retry sending the previous message')
      retry.textContent = 'Retry'
      retry.addEventListener('click', function() {
        row.remove()
        sendMessage(lastUserMessage)
      })
      row.appendChild(retry)
    }

    messages.appendChild(row)
    messages.scrollTop = messages.scrollHeight
  }

  // --- Talk to a human handoff ---
  function renderHandoffForm() {
    const messages = document.getElementById('rrflows-chat-messages')
    document.getElementById('rrflows-chat-followups').innerHTML = ''
    hideWelcomeChips()

    const row = document.createElement('div')
    row.className = 'rrflows-chat-row rrflows-chat-row-bot rrflows-chat-row-handoff'

    const avatar = document.createElement('img')
    avatar.className = 'rrflows-chat-avatar'
    avatar.src = LOGO_URL
    avatar.alt = ''
    avatar.width = 26
    avatar.height = 26
    row.appendChild(avatar)

    const card = document.createElement('div')
    card.className = 'rrflows-chat-bubble rrflows-chat-bot rrflows-chat-handoff-card'
    card.innerHTML = `
      <p><strong>Talk to FTC directly</strong></p>
      <p class="rrflows-chat-handoff-sub">Share a few details and FTC staff will follow up by email.</p>
      <div class="rrflows-chat-handoff-row">
        <label class="rrflows-chat-handoff-label" for="rrflows-handoff-first">First name *</label>
        <input id="rrflows-handoff-first" type="text" required maxlength="80" autocomplete="given-name">
      </div>
      <div class="rrflows-chat-handoff-row">
        <label class="rrflows-chat-handoff-label" for="rrflows-handoff-last">Last name *</label>
        <input id="rrflows-handoff-last" type="text" required maxlength="80" autocomplete="family-name">
      </div>
      <div class="rrflows-chat-handoff-row">
        <label class="rrflows-chat-handoff-label" for="rrflows-handoff-email">Email *</label>
        <input id="rrflows-handoff-email" type="email" required maxlength="200" autocomplete="email">
      </div>
      <div class="rrflows-chat-handoff-row">
        <label class="rrflows-chat-handoff-label" for="rrflows-handoff-reason">What can FTC help with?</label>
        <textarea id="rrflows-handoff-reason" rows="3" maxlength="1000"></textarea>
      </div>
      <div class="rrflows-chat-handoff-error" role="alert" aria-live="polite"></div>
      <div class="rrflows-chat-handoff-actions">
        <button type="button" class="rrflows-chat-handoff-cancel">Cancel</button>
        <button type="button" class="rrflows-chat-handoff-submit">Send</button>
      </div>
    `
    row.appendChild(card)
    messages.appendChild(row)
    messages.scrollTop = messages.scrollHeight

    // Prefill reason with last user message if any
    const lastUserMsg = (function() {
      const userBubbles = document.querySelectorAll('.rrflows-chat-user')
      return userBubbles.length ? userBubbles[userBubbles.length - 1].textContent : ''
    })()
    if (lastUserMsg) {
      const reasonEl = card.querySelector('#rrflows-handoff-reason')
      if (reasonEl) reasonEl.value = 'I have a question about: ' + lastUserMsg.slice(0, 400)
    }

    setTimeout(function() {
      const first = card.querySelector('#rrflows-handoff-first')
      if (first) first.focus()
    }, 50)

    card.querySelector('.rrflows-chat-handoff-cancel').addEventListener('click', function() {
      row.remove()
    })
    card.querySelector('.rrflows-chat-handoff-submit').addEventListener('click', function() {
      submitHandoff(card, row)
    })
  }

  async function submitHandoff(card, row) {
    const errEl = card.querySelector('.rrflows-chat-handoff-error')
    errEl.textContent = ''

    const firstName = (card.querySelector('#rrflows-handoff-first').value || '').trim().slice(0, 80)
    const lastName = (card.querySelector('#rrflows-handoff-last').value || '').trim().slice(0, 80)
    const email = (card.querySelector('#rrflows-handoff-email').value || '').trim().slice(0, 200)
    const reason = (card.querySelector('#rrflows-handoff-reason').value || '').trim().slice(0, 1000)

    if (!firstName) { errEl.textContent = 'First name is required.'; return }
    if (!lastName) { errEl.textContent = 'Last name is required.'; return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = 'Please enter a valid email address.'; return }

    // Build conversation transcript
    const transcript = []
    const rows = document.querySelectorAll('#rrflows-chat-messages .rrflows-chat-row')
    rows.forEach(function(r) {
      const bubble = r.querySelector('.rrflows-chat-bubble')
      if (!bubble) return
      const role = r.classList.contains('rrflows-chat-row-user') ? 'Visitor' : 'Assistant'
      const text = (bubble.textContent || '').trim()
      if (text) transcript.push(role + ': ' + text)
    })
    const message = (reason ? reason + '\n\n' : '') +
      '--- Conversation transcript ---\n' + transcript.join('\n').slice(0, 8000)

    const submitBtn = card.querySelector('.rrflows-chat-handoff-submit')
    submitBtn.disabled = true
    submitBtn.textContent = 'Sending...'

    try {
      const res = await fetch(CONFIG.handoffUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            firstName,
            lastName,
            email,
            subject: 'Chatbot handoff: ' + (reason ? reason.slice(0, 80) : 'Visitor requested human contact'),
            message,
            formId: 'chatbot-handoff',
            time: new Date().toISOString()
          }
        })
      })

      if (!res.ok) throw new Error('HTTP ' + res.status)

      // Replace card with confirmation
      row.remove()
      addMessage('bot', 'Thanks ' + firstName + '! FTC staff will follow up by email shortly. Feel free to keep chatting in the meantime.')
    } catch (e) {
      submitBtn.disabled = false
      submitBtn.textContent = 'Send'
      errEl.textContent = 'Something went wrong. Please try again or email membership@fltechcouncil.org directly.'
    }
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
          sessionId: getSessionId(),
          page: getCurrentPage()
        })
      })

      removeTyping()

      let data
      try {
        data = await response.json()
      } catch (e) {
        addErrorWithRetry('I\'m having trouble connecting right now. Please try again in a moment.', sanitized)
        return
      }

      if (response.status === 429) {
        addMessage('bot', data.message || 'Too many requests. Please wait a moment and try again.')
        return
      }

      if (!response.ok) {
        addErrorWithRetry(data.message || 'Something went wrong. Please try again.', sanitized)
        return
      }

      if (data.success && data.answer) {
        addMessage('bot', data.answer, {
          followUpQuestions: data.followUpQuestions || [],
          suggestions: data.suggestions || [],
          allowFeedback: true
        })
      } else {
        addMessage('bot', data.message || 'I wasn\'t able to answer that. Please try rephrasing your question.')
      }
    } catch (err) {
      removeTyping()
      addErrorWithRetry('I\'m unable to connect right now. Please check your internet connection and try again.', sanitized)
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

    function isOpen() {
      return !window_.classList.contains('rrflows-chat-hidden')
    }

    toggle.addEventListener('click', openWindow)
    minimize.addEventListener('click', minimizeWindow)
    close.addEventListener('click', closeWindow)

    const handoffLink = document.getElementById('rrflows-chat-handoff-link')
    if (handoffLink) {
      handoffLink.addEventListener('click', function(e) {
        e.preventDefault()
        if (!isOpen()) openWindow()
        renderHandoffForm()
      })
    }

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage(input.value)
      }
    })

    send.addEventListener('click', function() {
      sendMessage(input.value)
    })

    // Global keyboard shortcuts: Alt+C toggle, Esc close
    document.addEventListener('keydown', function(e) {
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault()
        if (isOpen()) minimizeWindow()
        else openWindow()
      } else if (e.key === 'Escape' && isOpen()) {
        // Don't intercept Esc inside form fields users might be typing into
        const tag = e.target && e.target.tagName
        if (tag === 'TEXTAREA') return
        if (tag === 'INPUT' && e.target.value) return
        minimizeWindow()
      }
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

      /* Footer link (Need a person?) */
      .rrflows-chat-footer-link {
        background: none;
        border: none;
        color: var(--ftc-link);
        font-size: inherit;
        font-family: inherit;
        font-weight: 500;
        cursor: pointer;
        padding: 4px 6px;
        text-decoration: underline;
        transition: color 0.15s ease;
      }
      .rrflows-chat-footer-link:hover { color: var(--ftc-primary); }
      .rrflows-chat-footer-sep { color: var(--ftc-border-strong); padding: 0 4px; }

      /* Feedback (thumbs) */
      .rrflows-chat-feedback {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 0 0 8px;
        font-size: 11px;
        color: var(--ftc-text-muted);
      }
      .rrflows-chat-feedback-label {
        font-size: 11px;
        color: var(--ftc-text-muted);
      }
      .rrflows-chat-feedback-btn {
        width: 26px;
        height: 26px;
        min-height: 26px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--ftc-text-muted);
        border-radius: 6px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
      }
      .rrflows-chat-feedback-btn:hover {
        background: var(--ftc-chip-bg);
        color: var(--ftc-primary);
        border-color: var(--ftc-chip-border);
      }
      .rrflows-chat-feedback-btn[aria-pressed="true"] {
        background: var(--ftc-primary);
        color: #fff;
        border-color: var(--ftc-primary);
      }
      .rrflows-chat-feedback-ack {
        font-size: 11px;
        color: var(--ftc-status-dot);
        font-weight: 500;
      }
      .rrflows-chat-feedback-form {
        display: flex;
        flex-direction: column;
        gap: 4px;
        width: 100%;
        margin-top: 4px;
      }
      .rrflows-chat-feedback-textarea {
        width: 100%;
        border: 1px solid var(--ftc-chip-border);
        border-radius: 8px;
        padding: 6px 8px;
        font-family: inherit;
        font-size: 12px;
        resize: vertical;
        outline: none;
        transition: border-color 0.15s ease;
      }
      .rrflows-chat-feedback-textarea:focus { border-color: var(--ftc-primary); }
      .rrflows-chat-feedback-actions {
        display: flex;
        gap: 6px;
      }
      .rrflows-chat-feedback-send,
      .rrflows-chat-feedback-skip {
        font-size: 11px;
        padding: 4px 10px;
        border-radius: 12px;
        cursor: pointer;
        font-family: inherit;
      }
      .rrflows-chat-feedback-send {
        background: var(--ftc-primary);
        color: #fff;
        border: none;
      }
      .rrflows-chat-feedback-send:hover { background: var(--ftc-primary-deep); }
      .rrflows-chat-feedback-skip {
        background: transparent;
        color: var(--ftc-text-muted);
        border: 1px solid var(--ftc-chip-border);
      }
      .rrflows-chat-feedback-skip:hover { background: var(--ftc-chip-bg); }

      /* Retry button */
      .rrflows-chat-retry-btn {
        align-self: flex-start;
        margin-left: 0;
        margin-top: 4px;
        padding: 6px 12px;
        font-size: 12px;
        font-family: inherit;
        background: var(--ftc-surface);
        color: var(--ftc-primary);
        border: 1px solid var(--ftc-primary);
        border-radius: 12px;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
        min-height: 32px;
      }
      .rrflows-chat-retry-btn:hover {
        background: var(--ftc-primary);
        color: #fff;
      }

      /* Handoff form */
      .rrflows-chat-handoff-card {
        max-width: 100% !important;
        width: 100%;
      }
      .rrflows-chat-handoff-card p {
        margin: 0 0 6px;
      }
      .rrflows-chat-handoff-sub {
        font-size: 12px;
        color: var(--ftc-text-muted);
        margin-bottom: 10px !important;
      }
      .rrflows-chat-handoff-row {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-bottom: 8px;
      }
      .rrflows-chat-handoff-label {
        font-size: 11px;
        font-weight: 500;
        color: var(--ftc-text-muted);
      }
      .rrflows-chat-handoff-card input,
      .rrflows-chat-handoff-card textarea {
        width: 100%;
        border: 1px solid var(--ftc-chip-border);
        border-radius: 8px;
        padding: 7px 10px;
        font-family: inherit;
        font-size: 13px;
        outline: none;
        background: var(--ftc-surface);
        color: var(--ftc-text);
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .rrflows-chat-handoff-card input:focus,
      .rrflows-chat-handoff-card textarea:focus {
        border-color: var(--ftc-primary);
        box-shadow: 0 0 0 2px rgba(15, 44, 92, 0.12);
      }
      .rrflows-chat-handoff-card textarea {
        resize: vertical;
        min-height: 60px;
      }
      .rrflows-chat-handoff-error {
        font-size: 11px;
        color: #b91c1c;
        min-height: 14px;
        margin: 4px 0;
      }
      .rrflows-chat-handoff-error:empty { display: none; }
      .rrflows-chat-handoff-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        margin-top: 4px;
      }
      .rrflows-chat-handoff-cancel,
      .rrflows-chat-handoff-submit {
        padding: 8px 14px;
        font-size: 13px;
        font-family: inherit;
        border-radius: 16px;
        cursor: pointer;
        min-height: 36px;
      }
      .rrflows-chat-handoff-cancel {
        background: transparent;
        color: var(--ftc-text-muted);
        border: 1px solid var(--ftc-chip-border);
      }
      .rrflows-chat-handoff-cancel:hover { background: var(--ftc-chip-bg); }
      .rrflows-chat-handoff-submit {
        background: linear-gradient(135deg, var(--ftc-primary) 0%, var(--ftc-accent) 100%);
        color: #fff;
        border: none;
      }
      .rrflows-chat-handoff-submit:hover { filter: brightness(1.08); }
      .rrflows-chat-handoff-submit:disabled {
        background: #94a3b8;
        cursor: not-allowed;
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
