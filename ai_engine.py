import re
import requests
from config import OLLAMA_URL, OLLAMA_MODEL, OLLAMA_TIMEOUT

# NetBot is a Computer Networks project, so common CN questions are answered
# locally and immediately. Ollama is used for questions outside this quick bank.
SYSTEM_PROMPT = """You are NetBot inside a Multi-Client Computer Networks chatbot.
Answer questions from Computer Networks, programming, AI/ML, mathematics, engineering,
computer science and general knowledge.
For Computer Networks questions, be technically accurate.
Answer directly and briefly in simple student-friendly language.
Prefer 3-6 short paragraphs or bullet points. Do not repeat the question.
"""

MAX_TOKENS = 240 
CONTEXT_SIZE = 1536

FAST_CN = {
    "tcp": "TCP (Transmission Control Protocol) is a connection-oriented transport-layer protocol. It provides reliable, ordered and error-checked delivery of data. TCP is commonly used by HTTP/HTTPS, email and file-transfer applications.",
    "udp": "UDP (User Datagram Protocol) is a connectionless transport-layer protocol. It is faster and has less overhead than TCP, but it does not guarantee delivery, ordering or retransmission. It is commonly used for streaming, DNS and real-time applications.",
    "osi": "The OSI model has 7 layers: Physical, Data Link, Network, Transport, Session, Presentation and Application. It is a reference model used to understand how network communication is organized.",
    "ip": "An IP address identifies a device interface on an IP network. IPv4 uses 32-bit addresses, while IPv6 uses 128-bit addresses. IP works at the Network layer and is responsible for logical addressing and packet forwarding.",
    "dns": "DNS (Domain Name System) translates human-readable domain names such as example.com into IP addresses. This lets users access services using names instead of remembering numerical addresses.",
    "http": "HTTP (Hypertext Transfer Protocol) is an application-layer protocol used to transfer web resources between clients and servers. HTTPS is HTTP protected with TLS encryption.",
    "socket": "A socket is a software communication endpoint used by an application to send and receive network data. In a client-server application, sockets provide the interface between the program and the network.",
    "port": "A port is a logical number used by TCP or UDP to identify a service on a device. For example, a server can listen on port 5000 while other ports are used by different services.",
    "router": "A router connects different networks and forwards IP packets between them. It examines destination IP addresses and chooses a route for packets.",
    "switch": "A network switch connects devices within a LAN and forwards Ethernet frames using MAC addresses. It mainly operates at the Data Link layer.",
    "client server": "In a client-server architecture, clients request services and a central server provides them. In this project, multiple browser clients connect to the server, while the server manages users, messages and NetBot requests.",
    "multiclient": "A multi-client application allows many clients to connect to one server at the same time. This project uses Flask-SocketIO so multiple users can chat concurrently instead of waiting for one user to finish.",
    "tcp udp": "TCP is connection-oriented, reliable and ordered, while UDP is connectionless and has lower overhead. TCP is useful when delivery must be reliable; UDP is useful when low latency is more important than guaranteed delivery.",
}


def _ollama_request(payload, timeout):
    return requests.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=timeout)


def _normalize(text):
    return re.sub(r"[^a-z0-9 ]+", " ", text.lower()).strip()


def fast_network_answer(question):
    """Return an instant answer for common Computer Networks questions."""
    q = _normalize(question)

    if ("tcp" in q and "udp" in q) or "difference between tcp and udp" in q:
        return FAST_CN["tcp udp"]
    if "client server" in q or "client-server" in question.lower():
        return FAST_CN["client server"]
    if "multi client" in q or "multiclient" in q or "multiple client" in q:
        return FAST_CN["multiclient"]

    # Match a topic only when it is clearly a networking question.
    topics = [
        ("tcp", FAST_CN["tcp"]),
        ("udp", FAST_CN["udp"]),
        ("osi", FAST_CN["osi"]),
        ("dns", FAST_CN["dns"]),
        ("http", FAST_CN["http"]),
        ("socket", FAST_CN["socket"]),
        ("router", FAST_CN["router"]),
        ("switch", FAST_CN["switch"]),
        ("port", FAST_CN["port"]),
        ("ip address", FAST_CN["ip"]),
        (" ip ", " "+FAST_CN["ip"]+" "),
    ]

    network_words = {
        "network", "networking", "protocol", "transport", "packet",
        "computer networks", "lan", "wan", "internet", "server",
        "client", "routing", "switching", "socket", "port", "ip"
    }

    is_network_question = any(word in q for word in network_words)
    if is_network_question:
        for topic, answer in topics:
            if topic.strip() in q:
                return answer.strip()

    return None


def warm_up():
    """Load the model once, without preventing the app from working if Ollama is off."""
    try:
        response = _ollama_request(
            {
                "model": OLLAMA_MODEL,
                "messages": [{"role": "user", "content": "Reply with OK."}],
                "stream": False,
                "keep_alive": -1,
                "options": {"num_ctx": CONTEXT_SIZE, "num_predict": 2},
            },
            timeout=8,
        )
        response.raise_for_status()
        print(f"NetBot: {OLLAMA_MODEL} is ready.")
        return True
    except Exception as exc:
        print(f"NetBot: Ollama not ready ({exc}). Fast Computer Networks answers are still enabled.")
        return False


def ask_ollama(question):
    try:
        response = _ollama_request(
            {
                "model": OLLAMA_MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": question},
                ],
                "stream": False,
                "keep_alive": -1,
                "options": {
                    "temperature": 0.2,
                    "num_ctx": CONTEXT_SIZE,
                    "num_predict": MAX_TOKENS,
                },
            },
            timeout=OLLAMA_TIMEOUT,
        )
        response.raise_for_status()
        text = response.json().get("message", {}).get("content", "").strip()
        return text or None
    except Exception as exc:
        print("Ollama error:", exc)
        return None


def answer(question):
    question = (question or "").strip()
    if not question:
        return "Please enter a question."

    # Fast path: no Ollama wait for common Computer Networks questions.
    quick = fast_network_answer(question)
    if quick:
        return quick

    result = ask_ollama(question)
    if result:
        return result

    return (
        "NetBot could not reach Ollama right now.\n\n"
        f"For this Computer Networks project, try a question such as: "
        "What is TCP?, What is UDP?, What is the OSI model?, "
        "What is a socket?, or What is DNS?"
    )
