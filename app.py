import os
import time
import json
import logging
from flask import Flask, request, redirect, session, jsonify, send_from_directory
from flask_session import Session
from flask_cors import CORS
from dotenv import load_dotenv
from datetime import timedelta, datetime
from werkzeug.utils import secure_filename

from msal import SerializableTokenCache
from msal_auth import load_token_cache, save_token_cache, build_msal_app
from graph_api import (
    search_all_files,
    check_file_access,
    send_notification_email,
    send_multiple_file_email,
)
from openai_api import detect_intent_and_extract, answer_general_query
from db import (
    init_db,
    save_message,
    get_user_chats,
    get_chat_messages,
    delete_old_messages,
    delete_old_chats,
)
from hr_router import handle_query
from knowledge_base.build_index import build_index

# 🌱 Load env and init logging
load_dotenv()
logging.basicConfig(level=logging.INFO)

# 🚀 App setup
app = Flask(__name__, static_folder="./frontend/dist", static_url_path="/")
app.secret_key = os.getenv("CLIENT_SECRET")
CORS(app, supports_credentials=True)
app.config["SESSION_TYPE"] = "filesystem"
app.config["SESSION_PERMANENT"] = True
app.permanent_session_lifetime = timedelta(hours=1)
Session(app)

init_db()

# ✅ Check HR/Admin
def is_hr_admin(user_email):
    allowed_emails = os.getenv("HR_ADMIN_EMAILS", "")
    allowed = [e.strip().lower() for e in allowed_emails.split(",") if e.strip()]
    return user_email and user_email.lower() in allowed

# 🔐 Auth
@app.route("/login")
def login():
    msal_app = build_msal_app()
    auth_url = msal_app.get_authorization_request_url(
        scopes=os.getenv("SCOPE").split(),
        redirect_uri=os.getenv("REDIRECT_URI")
    )
    return redirect(auth_url)

@app.route("/getAToken")
def authorized():
    code = request.args.get("code")
    if not code:
        return "Authorization failed", 400

    cache = SerializableTokenCache()
    msal_app = build_msal_app(cache)
    result = msal_app.acquire_token_by_authorization_code(
        code,
        scopes=os.getenv("SCOPE").split(),
        redirect_uri=os.getenv("REDIRECT_URI")
    )
    if "access_token" not in result:
        logging.error("Authorization failed: %s", result.get("error_description"))
        return "Authorization failed", 400

    session["account_id"] = result["id_token_claims"].get("oid")
    session["user_email"] = result["id_token_claims"].get("preferred_username")
    session["token"] = result["access_token"]
    session["chat_id"] = str(int(time.time()))
    session["stage"] = "start"
    session["found_files"] = []
    save_token_cache(session["account_id"], cache)

    return redirect("/")

@app.route("/check_login")
def check_login():
    if session.get("user_email"):
        if not session.get("chat_id"):
            session["chat_id"] = str(int(time.time()))
        session["stage"] = "start"
        session["found_files"] = []
        return jsonify(logged_in=True, chat_id=session["chat_id"], user_email=session["user_email"])
    return jsonify(logged_in=False)

# 📚 Document APIs
@app.route("/api/hr_documents")
def hr_documents():
    metadata = {}
    if os.path.exists(META_FILE):
        try:
            with open(META_FILE, "r") as f:
                metadata = json.load(f)
        except Exception:
            metadata = {}

    files = []
    if os.path.exists(DOCS_DIR):
        for fname in os.listdir(DOCS_DIR):
            fpath = os.path.join(DOCS_DIR, fname)
            if os.path.isfile(fpath):
                size_kb = round(os.path.getsize(fpath) / 1024, 2)
                date_str = datetime.fromtimestamp(os.path.getmtime(fpath)).strftime("%Y-%m-%d %H:%M")
                files.append({
                    "name": fname,
                    "updated": date_str,
                    "size_kb": size_kb,
                    "uploader": metadata.get(fname, {}).get("uploader", "unknown")
                })
    return jsonify({"files": sorted(files, key=lambda f: f["updated"], reverse=True)})

@app.route("/upload_hr_doc", methods=["POST"])
def upload_hr_doc():
    user_email = session.get("user_email")
    if not is_hr_admin(user_email):
        return jsonify({"error": "❌ Unauthorized"}), 403

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No filename"}), 400

    allowed_exts = (".pdf", ".docx", ".txt")
    filename = secure_filename(file.filename)
    if not filename.lower().endswith(allowed_exts):
        return jsonify({"error": "Unsupported format"}), 400

    os.makedirs(DOCS_DIR, exist_ok=True)
    save_path = os.path.join(DOCS_DIR, filename)
    file.save(save_path)

    metadata = {}
    if os.path.exists(META_FILE):
        try:
            with open(META_FILE, "r") as f:
                metadata = json.load(f)
        except Exception:
            metadata = {}

    metadata[filename] = {
        "uploader": user_email,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M")
    }

    try:
        with open(META_FILE, "w") as f:
            json.dump(metadata, f, indent=2)
    except Exception as e:
        logging.warning(f"⚠️ Failed to write metadata: {e}")

    try:
        build_index()
        return jsonify({"message": "✅ File uploaded and indexed."})
    except Exception as e:
        return jsonify({"error": f"❌ Indexing failed: {e}"}), 500

@app.route("/api/hr_documents", methods=["DELETE"])
def delete_hr_doc():
    user_email = session.get("user_email")
    if not is_hr_admin(user_email):
        return jsonify({"error": "❌ Unauthorized"}), 403

    data = request.json
    filename = data.get("filename")
    if not filename:
        return jsonify({"error": "No filename provided"}), 400

    doc_path = os.path.join(DOCS_DIR, filename)

    try:
        if os.path.exists(doc_path):
            os.remove(doc_path)

        if os.path.exists(META_FILE):
            with open(META_FILE, "r") as f:
                metadata = json.load(f)
            metadata.pop(filename, None)
            with open(META_FILE, "w") as f:
                json.dump(metadata, f, indent=2)

        build_index()
        return jsonify({"message": f"✅ '{filename}' deleted and index updated."})
    except Exception as e:
        logging.exception("❌ Failed to delete document:")
        return jsonify({"error": f"❌ Deletion failed: {e}"}), 500

# 🔄 Chat session APIs
@app.route("/api/session_state")
def session_state():
    return jsonify({
        "stage": session.get("stage"),
        "chat_id": session.get("chat_id"),
        "files": session.get("found_files", [])
    })

@app.route("/api/new_chat")
def new_chat():
    if not session.get("user_email"):
        return jsonify({"error": "Unauthorized"}), 401
    session["chat_id"] = str(int(time.time()))
    session["stage"] = "start"
    session["found_files"] = []
    return jsonify({"chat_id": session["chat_id"]})

@app.route("/api/chats")
def api_chats():
    user_email = session.get("user_email")
    if not user_email:
        return jsonify([])
    delete_old_chats(user_email)
    return jsonify(get_user_chats(user_email))

@app.route("/api/messages/<chat_id>")
def get_messages(chat_id):
    if not session.get("user_email"):
        return jsonify({"error": "Unauthorized"}), 401
    messages = get_chat_messages(chat_id)
    return jsonify({
        "messages": [{"sender": m[0], "message": m[1], "timestamp": m[2]} for m in messages]
    })

@app.route("/chat", methods=["POST"])
def chat():
    delete_old_messages(days=3)
    delete_old_chats(session.get("user_email"))

    user_input = request.json.get("message", "").strip()
    is_selection = request.json.get("selectionStage", False)
    selected_indices = request.json.get("selectedIndices")
    account_id = session.get("account_id") or "temp"
    chat_id = request.json.get("chat_id") or session.get("chat_id")
    session["chat_id"] = chat_id
    user_email = session.get("user_email")

    cache = load_token_cache(account_id)
    app_msal = build_msal_app(cache)
    token = None
    accounts = app_msal.get_accounts()
    if accounts:
        result = app_msal.acquire_token_silent(os.getenv("SCOPE").split(), account=accounts[0])
        if "access_token" in result:
            token = result["access_token"]
            session["token"] = token
            save_token_cache(account_id, cache)

    if not token:
        session.clear()
        return jsonify(response="❌ Session expired. Please log in again.", intent="session_expired")

    if not user_email or not chat_id:
        return jsonify(response="❌ Missing session", intent="error")

    if user_input:
        save_message(user_email, chat_id, user_message=user_input)

    hr_response = handle_query(user_input)
    if hr_response:
        save_message(user_email, chat_id, ai_response=hr_response)
        return jsonify(response=hr_response, intent="hr_admin")

    if is_selection and selected_indices:
        return handle_file_selection(selected_indices, token, user_email, chat_id)
    elif session.get("stage") == "awaiting_selection" and is_number_selection(user_input):
        return handle_file_selection(user_input, token, user_email, chat_id)

    if session.get("stage") == "start":
        session["stage"] = "awaiting_query"
        msg = "Hi there! 👋 What file are you looking for today?"
        save_message(user_email, chat_id, ai_response=msg)
        return jsonify(response=msg, intent="greeting")

    elif session.get("stage") == "awaiting_query":
        gpt_result = detect_intent_and_extract(user_input)
        intent = gpt_result.get("intent")
        query = gpt_result.get("data")

        if intent == "general_response":
            reply = answer_general_query(user_input)
            save_message(user_email, chat_id, ai_response=reply)
            return jsonify(response=reply, intent="general_response")

        elif intent == "file_search" and query:
            session["last_query"] = query
            files = search_all_files(token, query)
            top_files = files[:5]
            session["found_files"] = top_files

            if not top_files:
                msg = "📁 No files found."
                save_message(user_email, chat_id, ai_response=msg)
                return jsonify(response=msg, intent="file_search")

            exact = [f for f in top_files if f["name"].lower() == query.lower()]
            if exact:
                file = exact[0]
                if check_file_access(token, file["id"], user_email, file.get("parentReference", {}).get("siteId")):
                    send_notification_email(token, user_email, file["name"], file["webUrl"])
                    msg = f"✅ You have access: {file['webUrl']}"
                    save_message(user_email, chat_id, ai_response=msg)
                    return jsonify(response=msg, intent="file_search")
                else:
                    msg = "❌ You don’t have access."
                    save_message(user_email, chat_id, ai_response=msg)
                    return jsonify(response=msg, intent="file_search")
            else:
                session["stage"] = "awaiting_selection"
                return jsonify(response="Select file (e.g., 1,3):", pauseGPT=True, files=top_files)

        msg = "⚠️ I couldn’t understand. Please rephrase."
        save_message(user_email, chat_id, ai_response=msg)
        return jsonify(response=msg, intent="error")

    return jsonify(response="⚠️ Something went wrong", intent="error")

def handle_file_selection(user_input, token, user_email, chat_id):
    files = session.get("found_files", [])
    if not files:
        session["stage"] = "awaiting_query"
        return jsonify(response="⚠️ File list expired", intent="error")

    if isinstance(user_input, list):
        indices = list(set([i - 1 for i in user_input if 1 <= i <= len(files)]))
    else:
        if user_input.strip().lower() == "cancel":
            session["stage"] = "awaiting_query"
            return jsonify(response="❌ Cancelled", intent="general_response")
        indices = [int(s.strip()) - 1 for s in user_input.split(',') if s.strip().isdigit()]

    if not indices:
        return jsonify(response="❌ Invalid selection", intent="error")

    selected_files = [files[i] for i in indices if 0 <= i < len(files)]
    accessible = [
        f for f in selected_files
        if check_file_access(token, f["id"], user_email, f.get("parentReference", {}).get("siteId"))
    ]

    if not accessible:
        return jsonify(response="❌ No access", intent="file_search")

    send_multiple_file_email(token, user_email, accessible)
    links = "\n".join([f"{f['name']}: {f['webUrl']}" for f in accessible])
    msg = f"✅ Sent:\n{links}"
    save_message(user_email, chat_id, ai_response=msg)
    session["stage"] = "awaiting_query"
    return jsonify(response=msg, intent="file_search")

def is_number_selection(text):
    try:
        return all(s.strip().isdigit() for s in text.split(','))
    except Exception:
        return False

# 🌐 Static routing
@app.route("/admin")
def serve_admin():
    if not session.get("user_email"):
        return redirect("/login")
    return send_from_directory(app.static_folder, "index.html")

@app.route("/admin/upload")
def serve_admin_upload():
    if not session.get("user_email"):
        return redirect("/login")
    return send_from_directory(app.static_folder, "index.html")

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path):
    if not session.get("user_email"):
        return redirect("/login")
    full_path = os.path.join(app.static_folder, path)
    if path and os.path.exists(full_path):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/hr_documents", methods=["DELETE"])
def delete_hr_doc():
    user_email = session.get("user_email")
    if not is_hr_admin(user_email):
        return jsonify({"error": "❌ Unauthorized"}), 403

    data = request.json
    filename = data.get("filename")
    if not filename:
        return jsonify({"error": "No filename provided"}), 400

    doc_path = os.path.join("backend", "knowledge_base", "documents", filename)
    metadata_path = os.path.join("backend", "knowledge_base", "index_metadata.json")

    try:
        # Delete the file
        if os.path.exists(doc_path):
            os.remove(doc_path)

        # Remove metadata entry
        if os.path.exists(metadata_path):
            with open(metadata_path, "r") as f:
                metadata = json.load(f)
            metadata.pop(filename, None)
            with open(metadata_path, "w") as f:
                json.dump(metadata, f, indent=2)

        # Rebuild index
        build_index()

        return jsonify({"message": f"✅ '{filename}' deleted and index updated."})
    except Exception as e:
        logging.exception("❌ Failed to delete document:")
        return jsonify({"error": f"❌ Deletion failed: {e}"}), 500


# 🏁 Startup
if __name__ == "__main__":
    try:
        print("📦 Rebuilding HR knowledge base index...")
        build_index()
        print("✅ Index ready.")
    except Exception as e:
        print("⚠️ Index build failed:", e)

    app.run(debug=True)
