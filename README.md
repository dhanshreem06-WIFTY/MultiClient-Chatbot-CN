# NetChat CN — Multi-Client Chatbot

A beginner-friendly Computer Networks project with a mobile-style chat UI.

## What it supports

- Multiple clients at the same time
- Clients on the same PC or different PCs on the same Wi-Fi/LAN
- Client-to-client private messaging
- A shared Network Room
- Local AI chatbot using Ollama (`llama3.2:3b` by default)
- AI fallback mode when Ollama is unavailable
- Search chats
- Refresh/reconnect
- Dark mode
- Accent-color palette
- Responsive UI inspired by the supplied mobile chat reference
- Online-user list
- Typing indicator
- Connection status
- Server/client timestamps
- Thread-safe server-side client management

## Architecture

Browser Client
    |
    | HTTP + Socket.IO (WebSocket/long-polling)
    v
Python Flask-SocketIO Server
    |
    +---- Client A
    +---- Client B
    +---- Client C
    |
    +---- Ollama local AI (optional)

The web browser cannot open a raw TCP socket directly. Socket.IO provides a browser-friendly real-time transport that normally uses WebSocket and can fall back to HTTP long-polling. The server manages many connected clients concurrently.

## Requirements

- Windows 10/11
- Python 3.10+
- VS Code
- Optional: Ollama for local AI

## 1. Open the project

Open this folder in VS Code:

`MultiClient-Chatbot-CN`

## 2. Create and activate the virtual environment

PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.venv\Scripts\Activate.ps1
```

## 3. Install packages

```powershell
pip install -r requirements.txt
```

## 4. Start the server

```powershell
python server.py
```

You should see something similar to:

```text
NetChat CN server started
Local: http://127.0.0.1:5000
LAN:   http://YOUR-PC-IP:5000
```

## 5. Open the client

On the server PC:

`http://127.0.0.1:5000`

For another computer on the same Wi-Fi:

`http://YOUR-PC-IP:5000`

Find your PC's IPv4 address with:

```powershell
ipconfig
```

Look for the active Wi-Fi/Ethernet adapter's IPv4 Address.

Example:

`192.168.1.25`

Then another computer opens:

`http://192.168.1.25:5000`

## 6. Allow Windows Firewall

If another computer cannot connect, allow Python through Windows Defender Firewall on a Private network, or create an inbound rule for TCP port 5000.

## 7. Optional local AI

Install Ollama and make sure it is running.

Then:

```powershell
ollama list
```

If `llama3.2:3b` is available, the application uses it automatically.

If not:

```powershell
ollama pull llama3.2:3b
```

The server can still run without Ollama. It will use a simple fallback response for AI questions.

## Testing multiple clients

### Same computer
Open multiple browser windows/tabs and use different usernames.

Example:
- Dhanshree
- Student2
- Student3

### Multiple computers
Start one server PC. Every other computer connects to the server PC's LAN IP.

Example:

```text
Server: 192.168.1.25:5000
Client A: 192.168.1.26
Client B: 192.168.1.27
Client C: 192.168.1.28
```

Only the server runs `server.py`. Other machines only need a browser.

## Important project concepts

### IP address
Identifies a device on a network.

### Port
Identifies an application/service on a device. This project uses port 5000.

### Client
The browser/user application that connects to the server.

### Server
The central Python process that accepts and manages many clients.

### Socket
A communication endpoint. Socket.IO gives the browser a real-time connection abstraction.

### Protocol
A set of communication rules. HTTP and WebSocket/Socket.IO are used here.

### Concurrency
The server handles multiple clients without making one client wait for another.

### Broadcast
Sending a message to many connected clients.

### Unicast/private message
Sending a message to one selected client.

### AI
Ollama runs a local language model. The server sends the user's question to Ollama and returns the model response.

## Project structure

```text
MultiClient-Chatbot-CN/
│
├── server.py
├── config.py
├── ai_engine.py
├── requirements.txt
├── README.md
├── .gitignore
│
├── templates/
│   └── index.html
│
└── static/
    ├── css/
    │   └── style.css
    └── js/
        └── app.js
```
