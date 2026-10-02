# Network Architecture

## 1. Client-server model

Every browser client connects to one central Python server.

```text
                    +----------------------+
                    |   Python NetChat     |
                    |       Server         |
                    |   0.0.0.0:5000      |
                    +----------+-----------+
                               |
              +----------------+----------------+
              |                |                |
          Browser A        Browser B        Browser C
          192.168.x.x      192.168.x.x      192.168.x.x
```

The server is the coordination point. This makes it possible for many clients to communicate without directly exposing each client to every other client.

## 2. Why Socket.IO?

A normal web page cannot use Python's `socket.socket()` API directly.

Socket.IO provides a browser-compatible real-time channel. It normally upgrades to WebSocket when possible and can fall back to HTTP long-polling.

The underlying network transport uses TCP.

## 3. Concurrency

The Flask-SocketIO server keeps independent connection state for each browser. The server can receive a message from one client while another client is sending a message.

AI generation is moved to a background task so a slow local model does not freeze the server's event handling.

## 4. Public and private communication

Public:

```text
Client A -> Server -> all clients in "network" room
```

Private:

```text
Client A -> Server -> Client B
```

AI:

```text
Client A -> Server -> Ollama -> Server -> Client A
```

## 5. Same host vs multiple hosts

Same host:

```text
127.0.0.1:5000
```

Multiple hosts on the same LAN:

```text
192.168.1.25:5000
```

The server binds to `0.0.0.0`, which means it listens on all IPv4 network interfaces. A firewall can still block external devices, so Windows Firewall may need to permit port 5000.

## 6. Important distinction

The application is a web-based multi-client networking project. It demonstrates real networking and concurrency, but the browser itself does not create a raw Python TCP socket.

If your college requires a raw `socket.socket(AF_INET, SOCK_STREAM)` implementation specifically, that can be added as a separate native-Python client/server layer. This version prioritizes a polished multi-device UI plus real-time browser communication.
