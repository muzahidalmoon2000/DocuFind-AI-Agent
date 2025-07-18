import requests
import os
import time
import logging
from semantic_search import rank_files_by_similarity
from msal_auth import load_token_cache, save_token_cache, build_msal_app

logging.basicConfig(level=logging.INFO)

def refresh_token(account_id):
    cache = load_token_cache(account_id)
    app = build_msal_app(cache)
    accounts = app.get_accounts()
    if accounts:
        result = app.acquire_token_silent(os.getenv("SCOPE").split(), account=accounts[0])
        if "access_token" in result:
            save_token_cache(account_id, cache)
            return result["access_token"]
    return None

def retry_request(url, headers, method="get", json=None, max_retries=2, account_id=None):
    for i in range(max_retries + 1):
        try:
            res = requests.request(method, url, headers=headers, json=json)
            if res.status_code == 401 and account_id:
                logging.warning("Received 401 Unauthorized. Attempting token refresh...")
                token = refresh_token(account_id)
                if token:
                    headers["Authorization"] = f"Bearer {token}"
                    continue  # retry with new token
            elif res.status_code == 429:
                retry_after = int(res.headers.get("Retry-After", 5))
                logging.warning(f"Rate limited on {url}. Retrying after {retry_after} seconds...")
                time.sleep(retry_after)
            else:
                logging.info(f"Request to {url} returned status {res.status_code}")
                return res
        except Exception as e:
            logging.error(f"Request error on {url}: {e}")
    logging.error(f"Max retries exceeded for {url}")
    return res
    for i in range(max_retries + 1):
        try:
            res = requests.request(method, url, headers=headers, json=json)
            if res.status_code == 429:
                retry_after = int(res.headers.get("Retry-After", 5))
                logging.warning(f"Rate limited on {url}. Retrying after {retry_after} seconds...")
                time.sleep(retry_after)
            else:
                logging.info(f"Request to {url} returned status {res.status_code}")
                return res
        except Exception as e:
            logging.error(f"Request error on {url}: {e}")
    logging.error(f"Max retries exceeded for {url}")
    return res

def get_user_email(account_id):
    token = refresh_token(account_id)
    if not token:
        return None
    headers = {"Authorization": f"Bearer {token}"}
    res = retry_request("https://graph.microsoft.com/v1.0/me", headers)
    if res.status_code == 200:
        return res.json().get("mail") or res.json().get("userPrincipalName")
    return None

def search_all_files(token, query):
    headers = {"Authorization": f"Bearer {token}"}
    all_results = []

    me_url = f"https://graph.microsoft.com/v1.0/me/drive/root/search(q='{query}')"
    me_res = retry_request(me_url, headers)
    if me_res.status_code == 200:
        all_results += tag_site_id(me_res.json().get("value", []), "personal")

    sites_url = "https://graph.microsoft.com/v1.0/sites?search=*"
    while sites_url:
        res = retry_request(sites_url, headers)
        if res.status_code != 200:
            logging.error(f"Failed to retrieve sites: {res.status_code}")
            break
        for site in res.json().get("value", []):
            site_id = site["id"]
            drives_res = retry_request(f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives", headers)
            if drives_res.status_code == 200:
                for drive in drives_res.json().get("value", []):
                    search_url = f"https://graph.microsoft.com/v1.0/drives/{drive['id']}/search(q='{query}')"
                    search_res = retry_request(search_url, headers)
                    if search_res.status_code == 200:
                        all_results += tag_site_id(search_res.json().get("value", []), site_id)
        sites_url = res.json().get("@odata.nextLink")

    if not all_results:
        logging.info("No results found via search. Fetching recent files as fallback.")
        all_results = fetch_recent_files(token)

    return rank_files_by_similarity(query, all_results, top_k=5)

def fetch_recent_files(token):
    headers = {"Authorization": f"Bearer {token}"}
    res = retry_request("https://graph.microsoft.com/v1.0/me/drive/recent", headers)
    if res.status_code == 200:
        return tag_site_id(res.json().get("value", []), "personal")
    return []

def tag_site_id(items, site_id):
    for item in items:
        if "parentReference" not in item:
            item["parentReference"] = {}
        item["parentReference"]["siteId"] = site_id
    return items

def check_file_access(token, item_id, user_email, site_id=None):
    headers = {"Authorization": f"Bearer {token}"}
    urls = [
        f"https://graph.microsoft.com/v1.0/me/drive/items/{item_id}/permissions",
        f"https://graph.microsoft.com/v1.0/users/{user_email}/drive/items/{item_id}/permissions"
    ]
    if site_id and site_id != "personal":
        urls.append(f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/items/{item_id}/permissions")

    for url in urls:
        try:
            res = retry_request(url, headers)
            if res.status_code == 200:
                for p in res.json().get("value", []):
                    email = p.get('grantedTo', {}).get('user', {}).get('email') or                             p.get('grantedToV2', {}).get('user', {}).get('email') or                             (p.get('grantedToIdentitiesV2', [{}])[0].get('user', {}).get('email') if p.get('grantedToIdentitiesV2') else None)
                    roles = p.get("roles", [])
                    if (email is None or email.lower() == user_email.lower()) and any(r in ["read", "view", "write"] for r in roles):
                        return True
        except Exception as e:
            logging.error(f"Permission check error on {url}: {e}")
    return False

def send_notification_email(token, to_email, file_name, file_url):
    return send_email(token, to_email, f"Here is the file: {file_name}", f"<p><a href='{file_url}'>{file_name}</a></p>")

def send_multiple_file_email(token, to_email, files):
    links = "".join(f"<p><a href='{f['webUrl']}'>{f['name']}</a></p>" for f in files)
    return send_email(token, to_email, "Your requested files", f"<p>Here are the files you requested:</p>{links}")

def send_email(token, to_email, subject, html_content):
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    message = {
        "message": {
            "subject": subject,
            "body": {
                "contentType": "HTML",
                "content": html_content
            },
            "toRecipients": [{"emailAddress": {"address": to_email}}]
        },
        "saveToSentItems": True
    }

    try:
        res = retry_request(
            "https://graph.microsoft.com/v1.0/me/sendMail",
            headers,
            method="post",
            json=message
        )
        if res.status_code == 202:
            logging.info(f"✅ Email sent to {to_email}")
            return True
        else:
            logging.error(f"❌ Failed to send email to {to_email}: {res.status_code} - {res.text}")
            return False
    except Exception as e:
        logging.error(f"Email send failed: {e}")
        return False
