let socket = null;
let myUsername = "";
let users = [];
let currentChat = null;
let conversations = {};
let connected = false;
let typingTimer = null;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  loadPreferences();
  setupUI();
  connectSocket();
});

function setupUI() {
  $("joinButton").addEventListener("click", register);
  $("usernameInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") register();
  });

  $("messageForm").addEventListener("submit", sendMessage);
  $("messageInput").addEventListener("input", handleTyping);

  $("refreshButton").addEventListener("click", reconnect);
  $("conversationRefresh").addEventListener("click", refreshCurrentChat);
  function refreshCurrentChat() {
  if (!currentChat) return;

  // Stop any typing indicator
  $("typingIndicator").textContent = "";

  // Re-read the saved conversations
  conversations = JSON.parse(
    localStorage.getItem("netchat_conversations") || "{}"
  );

  // Redraw the current conversation
  renderConversation();

  // Update the chat list
  renderChatList();

  // Keep the input ready
  $("messageInput").focus();
}
  $("themeButton").addEventListener("click", toggleDarkMode);
  $("paletteButton").addEventListener("click", () => openModal("settingsModal"));
  $("settingsButton").addEventListener("click", () => openModal("settingsModal"));
  $("addButton").addEventListener("click", () => {
    renderNewChatUsers();
    openModal("chatModal");
  });

  $("backButton").addEventListener("click", closeConversation);
  $("clearSearch").addEventListener("click", () => {
    $("searchInput").value = "";
    filterChats();
  });

  $("searchInput").addEventListener("input", filterChats);

  $("darkToggle").addEventListener("change", (e) => {
    setDarkMode(e.target.checked);
  });

  document.querySelectorAll(".swatch").forEach(btn => {
    btn.addEventListener("click", () => setAccent(btn.dataset.accent));
  });

  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });

  document.querySelectorAll(".side-nav[data-page], .bottom-item[data-page]").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.page));
  });

  $("clearLocalButton").addEventListener("click", () => {
    localStorage.removeItem("netchat_conversations");
    conversations = {};
    renderChatList();
    closeModal("settingsModal");
  });

  $("usernameInput").focus();
}

function connectSocket() {
  setConnection(false, "Connecting...");
  socket = io({
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  socket.on("connect", () => {
    setConnection(true, "Connected");
    if (myUsername) {
      socket.emit("register", { username: myUsername });
    }
  });

  socket.on("disconnect", () => {
    setConnection(false, "Disconnected");
  });

  socket.on("connect_error", () => {
    setConnection(false, "Connection error");
  });

  socket.on("server_ready", () => {});

  socket.on("register_error", (data) => {
    $("loginError").textContent = data.message;
    openModal("loginModal");
  });

  socket.on("registered", (data) => {
    myUsername = data.username;
    users = data.users || [];
    localStorage.setItem("netchat_username", myUsername);
    conversations = JSON.parse(localStorage.getItem("netchat_conversations") || "{}");
    closeModal("loginModal");
    renderAll();
    showPage("chat");
  });

  socket.on("users_update", (data) => {
    users = data.users || [];
    renderAll();
  });

  socket.on("message", (message) => {
    storeMessage(message);
    if (!currentChat || chatKeyForMessage(message) !== currentChat.toLowerCase()) {
      renderChatList();
      return;
    }
    renderConversation();
  });

  socket.on("system_message", (message) => {
    if (currentChat && currentChat.toLowerCase() === "network") {
      appendSystemMessage(message.text, message.time);
    }
  });

  socket.on("typing", (data) => {
    if (currentChat && data.from.toLowerCase() === currentChat.toLowerCase()) {
      $("typingIndicator").textContent = data.is_typing ? `${data.from} is typing...` : "";
    }
  });

  socket.on("ai_typing", (data) => {
    if (currentChat && currentChat.toLowerCase() === "netbot") {
      $("typingIndicator").textContent = data.active ? "NetBot is thinking..." : "";
    }
  });

  socket.on("send_error", (data) => {
    $("typingIndicator").textContent = data.message || "Message could not be sent.";
    setTimeout(() => $("typingIndicator").textContent = "", 2500);
  });

  const saved = localStorage.getItem("netchat_username");
  if (saved) {
    myUsername = saved;
    setTimeout(() => {
      if (socket.connected) socket.emit("register", { username: saved });
      else openModal("loginModal");
    }, 300);
  } else {
    openModal("loginModal");
  }
}

function register() {
  const name = $("usernameInput").value.trim();
  if (!socket || !socket.connected) {
    $("loginError").textContent = "The server is not connected yet.";
    return;
  }
  if (name.length < 3 || name.length > 24) {
    $("loginError").textContent = "Use 3 to 24 characters.";
    return;
  }
  $("loginError").textContent = "";
  socket.emit("register", { username: name });
}

function reconnect() {
  if (socket) socket.disconnect();
  setTimeout(connectSocket, 250);
}

function setConnection(ok, text) {
  connected = ok;
  $("connectionText").textContent = text;
  $("sideStatus").textContent = text;
  $("sideStatusDot").classList.toggle("online", ok);
}

function showPage(page) {
  const normalized = page === "home" || page === "profile" ? "chat" : page;
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active-page"));
  const target = normalized === "chat" ? $("chatPage") :
                 normalized === "network" ? $("networkPage") : $("aboutPage");
  target.classList.add("active-page");

  const title = normalized === "chat" ? "Chat" : normalized === "network" ? "Network" : "About";
  $("pageTitle").textContent = title;
  $("pageSubtitle").textContent = normalized === "chat" ? "Multi-client network" : "NetChat CN";

  document.querySelectorAll(".side-nav[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === normalized));
  document.querySelectorAll(".bottom-item[data-page]").forEach(b => b.classList.toggle("selected", b.dataset.page === normalized));
}

function renderAll() {
  renderChatList();
  renderUserList();
  renderNewChatUsers();
  $("onlineCount").textContent = users.length;
}

function renderUserList() {
  const box = $("userList");
  box.innerHTML = "";

  const all = [{username:"NetBot", online:true, is_ai:true}, ...users.filter(u => u.username.toLowerCase() !== "netbot")];
  all.forEach(user => {
    const row = document.createElement("div");
    row.className = "user-row";
    row.innerHTML = `
      <div class="user-avatar">${initial(user.username)}</div>
      <div class="user-main">
        <strong>${escapeHtml(user.username)}</strong>
        <span>${user.is_ai ? "AI assistant" : "● online"}</span>
      </div>
      <button class="user-chat">Chat</button>
    `;
    row.querySelector(".user-chat").onclick = () => openConversation(user.username);
    box.appendChild(row);
  });
}

function renderNewChatUsers() {
  const box = $("newChatUsers");
  if (!box) return;
  box.innerHTML = "";

  const all = [{username:"NetBot", is_ai:true}, ...users.filter(u => u.username.toLowerCase() !== myUsername.toLowerCase())];
  all.forEach(user => {
    const row = document.createElement("div");
    row.className = "user-row";
    row.innerHTML = `
      <div class="user-avatar">${initial(user.username)}</div>
      <div class="user-main"><strong>${escapeHtml(user.username)}</strong><span>${user.is_ai ? "AI assistant" : "online"}</span></div>
    `;
    row.onclick = () => {
      closeModal("chatModal");
      openConversation(user.username);
    };
    box.appendChild(row);
  });
}

function chatKeyForMessage(message) {
  if (message.type === "public") return "network";
  if (message.sender.toLowerCase() === myUsername.toLowerCase()) return (message.target || "network").toLowerCase();
  return message.sender.toLowerCase();
}

function storeMessage(message) {
  const key = chatKeyForMessage(message);
  if (!conversations[key]) conversations[key] = [];
  conversations[key].push(message);
  if (conversations[key].length > 100) conversations[key] = conversations[key].slice(-100);
  localStorage.setItem("netchat_conversations", JSON.stringify(conversations));
  renderChatList();
}

function renderChatList() {
  const box = $("chatList");
  const empty = $("emptyState");
  box.innerHTML = "";

  const keys = Object.keys(conversations);
  if (!keys.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  const query = $("searchInput").value.trim().toLowerCase();
  keys.sort((a,b) => {
    const aa = conversations[a]?.at(-1)?.time || "";
    const bb = conversations[b]?.at(-1)?.time || "";
    return bb.localeCompare(aa);
  });

  keys.forEach(key => {
    const list = conversations[key] || [];
    const last = list.at(-1);
    if (!last) return;
    const title = key === "netbot" ? "NetBot" : key === "network" ? "Network Room" : displayUser(key);
    const preview = last.text || "New message";
    if (query && !(`${title} ${preview}`.toLowerCase().includes(query))) return;

    const row = document.createElement("div");
    row.className = "chat-row";
    row.onclick = () => openConversation(key === "network" ? "network" : title);

    row.innerHTML = `
      <div class="avatar">${initial(title)}</div>
      <div class="chat-info">
        <div class="chat-name">${escapeHtml(title)}</div>
        <div class="chat-preview">${escapeHtml(preview)}</div>
      </div>
      <div class="chat-meta">
        <span style="font-size:10px;color:var(--muted)">${escapeHtml(last.time || "")}</span>
      </div>
    `;
    box.appendChild(row);
  });
}

function filterChats() {
  $("clearSearch").style.display = $("searchInput").value ? "block" : "none";
  renderChatList();
}

function openConversation(username) {
  currentChat = username;
  $("conversationName").textContent = username === "network" ? "Network Room" : username;
  $("conversationAvatar").textContent = initial(username);
  $("conversationStatus").textContent =
    username.toLowerCase() === "netbot" ? "AI assistant" :
    username.toLowerCase() === "network" ? "public room" :
    (users.some(u => u.username.toLowerCase() === username.toLowerCase()) ? "online" : "offline");

  $("conversation").classList.remove("hidden");
  renderConversation();
  $("messageInput").focus();
}

function closeConversation() {
  $("conversation").classList.add("hidden");
  currentChat = null;
  $("typingIndicator").textContent = "";
}

function renderConversation() {
  const box = $("messages");
  box.innerHTML = "";

  const key = currentChat.toLowerCase();
  const list = conversations[key] || [];

  list.forEach(msg => {
    const mine = msg.sender.toLowerCase() === myUsername.toLowerCase();
    const row = document.createElement("div");
    row.className = "message-row" + (mine ? " mine" : "");
    row.innerHTML = `
      <div class="message-bubble">
        ${escapeHtml(msg.text)}
        <span class="message-time">${escapeHtml(msg.time || "")}</span>
      </div>
    `;
    box.appendChild(row);
  });

  box.scrollTop = box.scrollHeight;
}

function appendSystemMessage(text, time) {
  if (!currentChat || currentChat.toLowerCase() !== "network") return;
  const key = "network";
  if (!conversations[key]) conversations[key] = [];
  conversations[key].push({type:"system", sender:"NetBot", text, time});
  localStorage.setItem("netchat_conversations", JSON.stringify(conversations));
  renderConversation();
  renderChatList();
}

function sendMessage(e) {
  e.preventDefault();
  if (!socket || !socket.connected || !currentChat) return;

  const input = $("messageInput");
  const text = input.value.trim();
  if (!text) return;

  if (currentChat.toLowerCase() === "network") {
    socket.emit("public_message", {text});
  } else {
    socket.emit("private_message", {target: currentChat, text});
  }

  input.value = "";
  socket.emit("typing", {target: currentChat, is_typing:false});
}

function handleTyping() {
  if (!socket || !socket.connected || !currentChat) return;
  socket.emit("typing", {target: currentChat, is_typing:true});
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit("typing", {target: currentChat, is_typing:false});
  }, 700);
}

function displayUser(lower) {
  const u = users.find(x => x.username.toLowerCase() === lower.toLowerCase());
  return u ? u.username : lower.charAt(0).toUpperCase() + lower.slice(1);
}

function initial(name) {
  if (!name) return "?";
  if (name === "network") return "N";
  return name.trim().charAt(0).toUpperCase();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

function openModal(id) {
  $(id).classList.remove("hidden");
}

function closeModal(id) {
  $(id).classList.add("hidden");
}

function toggleDarkMode() {
  setDarkMode(!document.body.classList.contains("dark"));
}

function setDarkMode(enabled) {
  document.body.classList.toggle("dark", enabled);
  $("darkToggle").checked = enabled;
  localStorage.setItem("netchat_dark", enabled ? "1" : "0");
}

function setAccent(accent) {
  document.documentElement.style.setProperty("--accent", accent);
  localStorage.setItem("netchat_accent", accent);
  const dark = shadeColor(accent, -18);
  document.documentElement.style.setProperty("--accent-dark", dark);
  const soft = hexToRgba(accent, .12);
  document.documentElement.style.setProperty("--accent-soft", soft);
}

function loadPreferences() {
  setDarkMode(localStorage.getItem("netchat_dark") === "1");
  setAccent(localStorage.getItem("netchat_accent") || "#0e9eaa");
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.replace("#",""),16);
  const amt = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
  const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return "#" + (0x1000000 + r*0x10000 + g*0x100 + b).toString(16).slice(1);
}

function hexToRgba(hex, alpha) {
  const num = parseInt(hex.replace("#",""),16);
  const r = num >> 16, g = (num >> 8) & 255, b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
