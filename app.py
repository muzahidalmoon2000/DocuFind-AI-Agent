import os
import time
import logging
from flask import Flask, request, redirect, session, jsonify, send_from_directory
from flask_session import Session
from flask_cors import CORS
from dotenv import load_dotenv
from datetime import timedelta
from msal import SerializableTokenCache
from auth.msal_auth import load_token_cache, save_token_cache, build_msal_app
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

load_dotenv()
logging.basicConfig(level=logging.INFO)

app = Flask(__name__, static_folder="./frontend/dist", static_url_path="/")
app.secret_key = os.getenv("CLIENT_SECRET")
CORS(app, supports_credentials=True)
app.config["SESSION_TYPE"] = "filesystem"
app.config["SESSION_PERMANENT"] = True
app.permanent_session_lifetime = timedelta(hours=1)
Session(app)

init_db()

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

    account_id = result.get("id_token_claims", {}).get("oid")
    session["account_id"] = account_id
    session["user_email"] = result.get("id_token_claims", {}).get("preferred_username")
    session["token"] = result["access_token"]
    session["chat_id"] = str(int(time.time()))
    session["stage"] = "start"
    session["found_files"] = []

    save_token_cache(account_id, cache)
    return redirect("/")

@app.route("/check_login")
def check_login():
    if session.get("user_email"):
        if not session.get("chat_id"):
            session["chat_id"] = str(int(time.time()))
        session["stage"] = "start"
        session["found_files"] = []
        return jsonify(logged_in=True, chat_id=session["chat_id"])
    return jsonify(logged_in=False)

@app.route("/api/session_state")
def session_state():
    return jsonify({
        "stage": session.get("stage"),
        "chat_id": session.get("chat_id"),
        "files": session.get("found_files", [])
    })

@app.route("/api/new_chat")
def create_new_chat():
    if not session.get("user_email"):
        return jsonify({"error": "Unauthorized"}), 401
    new_chat_id = str(int(time.time()))
    session["chat_id"] = new_chat_id
    session["stage"] = "start"
    session["found_files"] = []
    return jsonify({"chat_id": new_chat_id})

@app.route("/api/chats")
def api_chats():
    user_email = session.get("user_email")
    if not user_email:
        return jsonify([])

    # 💾 Keep only 10 latest chat entries
    delete_old_chats(user_email, limit=10)

    return jsonify(get_user_chats(user_email))

@app.route("/api/messages/<chat_id>")
def api_chat_messages(chat_id):
    if not session.get("user_email"):
        return jsonify({"error": "Unauthorized"}), 401
    messages = get_chat_messages(chat_id)
    return jsonify({
        "messages": [
            {"sender": m[0], "message": m[1], "timestamp": m[2]}
            for m in messages
        ]
    })

@app.route("/chat", methods=["POST"])
def chat():
    # 🧹 Clean old chats and messages
    delete_old_messages(days=3)
    delete_old_chats(session.get("user_email"), limit=10)

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

    stage = session.get("stage", "start")
    if not user_email or not chat_id:
        return jsonify(response="❌ Missing chat session ID.", intent="error")

    if user_input:
        save_message(user_email, chat_id, user_message=user_input)

    if is_selection and selected_indices:
        return handle_file_selection(selected_indices, token, user_email, chat_id)
    elif stage == "awaiting_selection" and is_number_selection(user_input):
        return handle_file_selection(user_input, token, user_email, chat_id)

    if stage == "start":
        session["stage"] = "awaiting_query"
        msg = "Hi there! 👋\nWhat file are you looking for today or how can I help?"
        save_message(user_email, chat_id, ai_response=msg)
        return jsonify(response=msg, intent="greeting")

    elif stage == "awaiting_query":
        gpt_result = detect_intent_and_extract(user_input)
        intent = gpt_result.get("intent")
        query = gpt_result.get("data")

        if intent == "general_response":
            gpt_reply = answer_general_query(user_input)
            save_message(user_email, chat_id, ai_response=gpt_reply)
            return jsonify(response=gpt_reply, intent="general_response")

        elif intent == "file_search" and query:
            session["last_query"] = query
            files = search_all_files(token, query)
            top_files = files[:5]
            session["found_files"] = top_files

            if not top_files:
                msg = "📁 No files found for your request. Try being more specific."
                save_message(user_email, chat_id, ai_response=msg)
                return jsonify(response=msg, intent="file_search")

            exact_matches = [f for f in top_files if f["name"].lower() == query.lower()]
            if exact_matches:
                file = exact_matches[0]
                has_access = check_file_access(token, file['id'], user_email, file.get("parentReference", {}).get("siteId"))
                session["stage"] = "awaiting_query"
                if has_access:
                    send_notification_email(token, user_email, file['name'], file['webUrl'])
                    msg = f"✅ You have access! Here’s your file link: {file['webUrl']}\n📧 Sent to your email: {user_email}\n\n💬 Do you need anything else?"
                    save_message(user_email, chat_id, ai_response=msg)
                    return jsonify(response=msg, intent="file_search")
                else:
                    msg = "❌ You don’t have access to this file."
                    save_message(user_email, chat_id, ai_response=msg)
                    return jsonify(response=msg, intent="file_search")
            else:
                session["stage"] = "awaiting_selection"
                return jsonify(
                    response="Here are some files I found. Please select the files you want (e.g., 1,3):",
                    pauseGPT=True,
                    files=top_files,
                    intent="file_search"
                )
        else:
            msg = "⚠️ I couldn’t understand your request. Please rephrase or provide more detail."
            save_message(user_email, chat_id, ai_response=msg)
            return jsonify(response=msg, intent="error")

    return jsonify(response="⚠️ Something went wrong. Please try again.", intent="error")

def handle_file_selection(user_input, token, user_email, chat_id):
    files = session.get("found_files", [])

    if not files:
        session["stage"] = "awaiting_query"
        return jsonify(response="⚠️ The file list has expired. Please try your query again.", intent="error")

    if isinstance(user_input, list):
        selected_indices = list(set([i - 1 for i in user_input if 1 <= i <= len(files)]))
    else:
        user_input_cleaned = user_input.strip().lower()
        if user_input_cleaned == "cancel":
            session["stage"] = "awaiting_query"
            return jsonify(response="❌ Selection cancelled. What else can I help you with?", intent="general_response")
        selected_indices = [s.strip() for s in user_input_cleaned.split(',') if s.strip().isdigit()]
        selected_indices = list(set([int(i) - 1 for i in selected_indices if 0 <= int(i) - 1 < len(files)]))

    if not selected_indices:
        return jsonify(response="❌ Invalid selection. Please enter valid numbers.", intent="error")

    selected_files = [files[i] for i in selected_indices]
    accessible_files = [f for f in selected_files if check_file_access(token, f['id'], user_email, f.get("parentReference", {}).get("siteId"))]

    session["stage"] = "awaiting_query"

    if not accessible_files:
        return jsonify(response="❌ You don’t have access to any of the selected files.", intent="file_search")

    send_multiple_file_email(token, user_email, accessible_files)
    links = "\n".join([f"🔗 {f['name']}: {f['webUrl']}" for f in accessible_files])
    msg = f"✅ You have access to the following files:\n{links}\n\n📧 Sent to your email: {user_email}\n\n💬 Need anything else?"
    save_message(user_email, chat_id, ai_response=msg)
    return jsonify(response=msg, intent="file_search")

def is_number_selection(text):
    try:
        return all(s.strip().isdigit() for s in text.split(','))
    except Exception:
        return False

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react_app(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    app.run(debug=True)
