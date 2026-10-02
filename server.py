from datetime import datetime, timezone
from threading import Lock
import socket
import webbrowser

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room

from config import (
    HOST,
    PORT,
    MIN_USERNAME,
    MAX_USERNAME,
    MAX_MESSAGE_LENGTH,
    MAX_HISTORY,
)
from ai_engine import answer as ai_answer, warm_up

app = Flask(__name__)
app.config["SECRET_KEY"] = "netchat-cn-secret-key"
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    logger=False,
    engineio_logger=False,
)

clients = {}       # sid -> {"username": ..., "connected_at": ...}
user_to_sid = {}   # lowercase username -> sid
history = []
lock = Lock()


def now():
    return datetime.now(timezone.utc).astimezone().strftime("%H:%M")


def clean_text(value):
    return str(value or "").strip()


def valid_username(username):
    return (
        MIN_USERNAME <= len(username) <= MAX_USERNAME
        and all(ch.isalnum() or ch in " _-" for ch in username)
    )


def public_users():
    with lock:
        return [
            {
                "username": data["username"],
                "online": True,
                "is_ai": data["username"].lower() == "netbot",
            }
            for data in clients.values()
        ]


def save_history(item):
    with lock:
        history.append(item)
        if len(history) > MAX_HISTORY:
            del history[:-MAX_HISTORY]


def broadcast_users():
    socketio.emit("users_update", {"users": public_users()})


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/health")
def health():
    with lock:
        count = len(clients)
    return {"status": "ok", "clients": count, "port": PORT}


@socketio.on("connect")
def on_connect():
    emit("server_ready", {
        "message": "Server connection established.",
        "time": now(),
    })


@socketio.on("register")
def on_register(data):
    username = clean_text(data.get("username", ""))

    if not valid_username(username):
        emit("register_error", {
            "message": f"Username must be {MIN_USERNAME}-{MAX_USERNAME} characters and use letters, numbers, spaces, _ or -."
        })
        return

    key = username.lower()

    with lock:
        if key in user_to_sid and user_to_sid[key] != request.sid:
            emit("register_error", {"message": "That username is already online."})
            return

        clients[request.sid] = {
            "username": username,
            "connected_at": now(),
        }
        user_to_sid[key] = request.sid

    join_room("network")
    emit("registered", {
        "username": username,
        "time": now(),
        "users": public_users(),
        "history": history[-50:],
    })
    broadcast_users()

    system_message = {
        "type": "system",
        "sender": "NetBot",
        "text": f"{username} joined the network.",
        "time": now(),
    }
    socketio.emit("system_message", system_message, room="network")


@socketio.on("disconnect")
def on_disconnect():
    with lock:
        info = clients.pop(request.sid, None)
        if info:
            user_to_sid.pop(info["username"].lower(), None)

    if info:
        broadcast_users()
        socketio.emit(
            "system_message",
            {
                "type": "system",
                "sender": "NetBot",
                "text": f"{info['username']} left the network.",
                "time": now(),
            },
            room="network",
        )


@socketio.on("typing")
def on_typing(data):
    if request.sid not in clients:
        return

    target = clean_text(data.get("target", ""))
    is_typing = bool(data.get("is_typing", False))
    sender = clients[request.sid]["username"]

    if target:
        with lock:
            target_sid = user_to_sid.get(target.lower())
        if target_sid:
            socketio.emit(
                "typing",
                {"from": sender, "is_typing": is_typing},
                to=target_sid,
            )
    else:
        socketio.emit(
            "typing",
            {"from": sender, "is_typing": is_typing},
            room="network",
            include_self=False,
        )


@socketio.on("public_message")
def on_public_message(data):
    if request.sid not in clients:
        return

    text = clean_text(data.get("text", ""))
    if not text:
        return

    text = text[:MAX_MESSAGE_LENGTH]
    sender = clients[request.sid]["username"]

    message = {
        "type": "public",
        "sender": sender,
        "text": text,
        "time": now(),
    }
    save_history(message)
    socketio.emit("message", message, room="network")


@socketio.on("private_message")
def on_private_message(data):
    if request.sid not in clients:
        return

    text = clean_text(data.get("text", ""))
    target = clean_text(data.get("target", ""))
    if not text or not target:
        return

    text = text[:MAX_MESSAGE_LENGTH]
    sender = clients[request.sid]["username"]

    if target.lower() == "netbot":
        # Show the user's message first.
        user_msg = {
            "type": "private",
            "sender": sender,
            "target": "NetBot",
            "text": text,
            "time": now(),
        }
        emit("message", user_msg)

        socketio.start_background_task(generate_ai_reply, request.sid, sender, text)
        return

    with lock:
        target_sid = user_to_sid.get(target.lower())

    if not target_sid:
        emit("send_error", {"message": f"{target} is not online."})
        return

    message = {
        "type": "private",
        "sender": sender,
        "target": target,
        "text": text,
        "time": now(),
    }

    # Sender receives the sent message and recipient receives it.
    socketio.emit("message", message, to=request.sid)
    socketio.emit("message", message, to=target_sid)


def generate_ai_reply(sid, sender, question):
    socketio.emit("ai_typing", {"active": True}, to=sid)
    reply = ai_answer(question)
    message = {
        "type": "private",
        "sender": "NetBot",
        "target": sender,
        "text": reply,
        "time": now(),
    }
    socketio.emit("message", message, to=sid)
    socketio.emit("ai_typing", {"active": False}, to=sid)


if __name__ == "__main__":
    # Pre-load the local AI model once so the first user question does not
    # have to wait for Ollama to load the model into memory.
    warm_up()

    local_ip = "127.0.0.1"
    try:
        local_ip = socket.gethostbyname(socket.gethostname())
    except Exception:
        pass

    print("=" * 58)
    print("NetChat CN — Multi-Client Chatbot")
    print("=" * 58)
    print(f"Local: http://127.0.0.1:{PORT}")
    print(f"LAN:   http://{local_ip}:{PORT}")
    print("Bind:  0.0.0.0 (other devices can connect on the LAN)")
    print("Press CTRL+C to stop the server.")
    print("=" * 58)

    socketio.run(
        app,
        host=HOST,
        port=PORT,
        debug=False,
        allow_unsafe_werkzeug=True,
    )
