// Hiển thị và gửi câu hỏi chatbot.
(() => {
  'use strict';

  const MAX_TEXT = 16000;
  const asText = value => typeof value === 'string' ? value.slice(0, MAX_TEXT) : '';

  function readableInlineText(value) {
    const symbols = { alpha: 'α', beta: 'β', gamma: 'γ', times: '×', leq: '≤', geq: '≥', pm: '±' };
    return asText(value).replace(/(\${1,2})([^$\n]{1,500})\1/g, (original, delimiter, expression) => {
      const readable = expression
        .replace(/\\(?:text|mathrm)\s*\{([^{}\\]*)\}/g, '$1')
        .replace(/\^\s*(?:\{\s*\\circ\s*\}|\\circ)\s*/g, '°')
        .replace(/\\(alpha|beta|gamma|times|leq|geq|pm)\b/g, (_, name) => symbols[name]);
      if (readable === expression || /[\\{}^_$]/.test(readable)) return original;
      return readable.replace(/\s+/g, ' ').trim();
    });
  }

  function appendInline(element, value) {
    const text = readableInlineText(value);
    const parts = text.split(/(\*\*[^*\n]{1,120}\*\*)/g);
    for (const part of parts) {
      if (/^\*\*[^*\n]{1,120}\*\*$/.test(part)) {
        const strong = document.createElement('strong');
        strong.textContent = part.slice(2, -2);
        element.appendChild(strong);
      } else {
        part.split('\n').forEach((line, index) => {
          if (index) element.appendChild(document.createElement('br'));
          element.appendChild(document.createTextNode(line));
        });
      }
    }
  }

  function markdownBlocks(reply) {
    const blocks = [];
    let paragraph = [];
    let items = [];
    const flushParagraph = () => {
      if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
      paragraph = [];
    };
    const flushList = () => {
      if (items.length) blocks.push({ type: 'list', items });
      items = [];
    };
    for (const line of asText(reply).replace(/\r\n?/g, '\n').split('\n')) {
      const heading = line.match(/^\s*#{1,4}\s+(.+)$/);
      const item = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/);
      if (heading) {
        flushParagraph(); flushList();
        blocks.push({ type: 'heading', text: heading[1] });
      } else if (item) {
        flushParagraph();
        items.push(item[1]);
      } else if (!line.trim()) {
        flushParagraph(); flushList();
      } else {
        flushList();
        paragraph.push(line);
      }
    }
    flushParagraph(); flushList();
    return blocks;
  }

  function renderReply(target, payload) {
    target.replaceChildren();
    const data = payload && typeof payload === 'object' ? payload : {};
    const supported = new Set(['paragraph', 'heading', 'list']);
    let blocks = Array.isArray(data.blocks) ? data.blocks.filter(block => block && supported.has(block.type)) : [];
    if (!blocks.length) blocks = markdownBlocks(data.reply);

    for (const block of blocks.slice(0, 40)) {
      const element = document.createElement(block.type === 'list' ? 'ul' : block.type === 'heading' ? 'h3' : 'p');
      if (block.type === 'list') {
        for (const item of (Array.isArray(block.items) ? block.items : []).slice(0, 30)) {
          const li = document.createElement('li');
          appendInline(li, item);
          element.appendChild(li);
        }
      } else {
        appendInline(element, block.text);
      }
      if (!element.textContent.trim()) continue;
      target.appendChild(element);
    }

    for (const notice of (Array.isArray(data.notices) ? data.notices : []).slice(0, 4)) {
      if (typeof notice !== 'string' || !notice.trim()) continue;
      const note = document.createElement('p');
      note.className = 'chat-notice';
      appendInline(note, notice);
      target.appendChild(note);
    }

    if (!target.textContent.trim()) target.textContent = 'Chưa nhận được câu trả lời phù hợp. Vui lòng thử lại.';
    target.dataset.status = asText(data.status);
  }

  function endpoint() {
    const configured = document.querySelector('meta[name="icare-chat-endpoint"]');
    if (configured && configured.content) return new URL(configured.content, location.href).href;
    const url = new URL(location.origin);
    url.port = '8000';
    url.pathname = '/chat';
    return url.href;
  }

  function init() {
    const chatBtn = document.getElementById('chatBtn');
    const closeChat = document.getElementById('closeChat');
    const chatWindow = document.getElementById('chatWindow');
    const chatBody = document.getElementById('chatBody');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    if (![chatBtn, closeChat, chatWindow, chatBody, userInput, sendBtn].every(Boolean) || chatWindow.dataset.initialized) return;
    chatWindow.dataset.initialized = 'true';
    userInput.maxLength = 2000;
    let sending = false;

    function close() {
      chatWindow.style.display = 'none';
      chatBtn.setAttribute('aria-expanded', 'false');
      chatBtn.focus();
    }
    chatBtn.addEventListener('click', () => {
      chatWindow.style.display = 'flex';
      chatBtn.setAttribute('aria-expanded', 'true');
      userInput.focus();
    });
    closeChat.addEventListener('click', close);
    chatWindow.addEventListener('keydown', event => {
      if (event.key === 'Escape') close();
    });
    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        sendMessage();
      }
    });

    async function sendMessage() {
      const message = userInput.value.trim();
      if (!message || sending) return;
      sending = true;
      sendBtn.disabled = true;
      const userMessage = document.createElement('div');
      userMessage.className = 'chat-message user';
      userMessage.textContent = message;
      chatBody.appendChild(userMessage);
      userInput.value = '';

      const botMessage = document.createElement('div');
      botMessage.className = 'chat-message bot';
      botMessage.setAttribute('aria-busy', 'true');
      const loading = document.createElement('span');
      loading.className = 'loading';
      loading.textContent = 'Đang tìm thông tin...';
      botMessage.appendChild(loading);
      chatBody.appendChild(botMessage);
      chatBody.scrollTop = chatBody.scrollHeight;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 65000);
      try {
        const response = await fetch(endpoint(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          signal: controller.signal
        });
        if (!response.ok) throw new Error('chat-unavailable');
        renderReply(botMessage, await response.json());
      } catch (error) {
        botMessage.textContent = error.name === 'AbortError'
          ? 'Phản hồi mất quá nhiều thời gian. Vui lòng thử lại.'
          : 'Chưa kết nối được dịch vụ Icare Clinic. Vui lòng thử lại sau.';
      } finally {
        clearTimeout(timer);
        botMessage.removeAttribute('aria-busy');
        sending = false;
        sendBtn.disabled = false;
        chatBody.scrollTop = chatBody.scrollHeight;
      }
    }
  }

  window.ICareChat = Object.freeze({ init, renderReply, markdownBlocks });
})();
