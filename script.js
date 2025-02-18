/***************************************************
 * Global variables & fallback relays
 ***************************************************/
let pubkey = null;           // User's pubkey (for replies)
let userRelays = {};         // Relay definitions from extension (URL -> {read: bool, write: bool})
let relayConnections = {};   // WebSocket connections to each relay URL

// Hard-coded article parameters
const ARTICLE_SLUG = "An-opinionated-guide-to-Sauna-4ts6ca";
const ARTICLE_PUBKEY = "e88a691e98d9987c964521dff60025f60700378a4879180dcbbb4a5027850411";

// This variable will store the loaded article event.
let articleEvent = null;

/***************************************************
 * Fallback relays (if no user relays are provided)
 ***************************************************/
const FALLBACK_RELAYS = {
  "wss://relay.damus.io": { read: true, write: true },
  "wss://relay.snort.social": { read: true, write: true }
};

/***************************************************
 * On page load: Load the article event
 ***************************************************/
document.addEventListener("DOMContentLoaded", () => {
  loadArticle();
});

/***************************************************
 * Connect to relays:
 *   Use user relays if available; otherwise fallback.
 ***************************************************/
function connectToRelays(relays) {
  Object.entries(relays).forEach(([url, policy]) => {
    if (!policy.read && !policy.write) return;
    const ws = new WebSocket(url);
    ws.onopen = () => {
      console.log("Connected to relay:", url);
      relayConnections[url].isOpen = true;
    };
    ws.onerror = (err) => {
      console.error("Relay error:", url, err);
    };
    ws.onclose = () => {
      console.log("Relay closed:", url);
      relayConnections[url].isOpen = false;
    };
    relayConnections[url] = {
      ws,
      policy,
      isOpen: false
    };
    ws.addEventListener("open", () => {
      relayConnections[url].isOpen = true;
    });
    ws.addEventListener("close", () => {
      relayConnections[url].isOpen = false;
    });
  });
}

/***************************************************
 * Load Article:
 *   Query relays for an event with:
 *     kind: 30023, tag "d" equals ARTICLE_SLUG,
 *     and from author ARTICLE_PUBKEY.
 *   Render its content as the article.
 ***************************************************/
function loadArticle() {
  let relays = Object.keys(userRelays).length > 0 ? userRelays : FALLBACK_RELAYS;
  connectToRelays(relays);
  
  const subId = "loadArticle-" + Math.random().toString(36).slice(2);
  let foundEvent = null;
  let bestCreated = 0;
  let readRelays = Object.entries(relayConnections).filter(
    ([url, conn]) => conn.isOpen && conn.policy.read
  );
  let eoseCount = 0;
  let eoseTarget = readRelays.length;
  
  function handleMessage(e) {
    try {
      let data = JSON.parse(e.data);
      if (!Array.isArray(data)) return;
      let [type, thisSubId, payload] = data;
      if (thisSubId !== subId) return;
      if (type === "EVENT") {
        let ev = payload;
        if (ev.pubkey === ARTICLE_PUBKEY && ev.created_at > bestCreated) {
          bestCreated = ev.created_at;
          foundEvent = ev;
        }
      } else if (type === "EOSE") {
        eoseCount++;
        if (eoseCount >= eoseTarget) {
          finalize();
        }
      }
    } catch (err) {
      console.error("Error in loadArticle handleMessage:", err);
    }
  }
  
  function finalize() {
    readRelays.forEach(([url, conn]) => {
      conn.ws.removeEventListener("message", handleMessage);
      conn.ws.send(JSON.stringify(["CLOSE", subId]));
    });
    if (foundEvent) {
      articleEvent = foundEvent;
      renderArticle(foundEvent);
      loadAuthorProfile(ARTICLE_PUBKEY);
    } else {
      document.getElementById("article-content").innerHTML = `
        <p class="text-muted">No article found for slug <strong>${ARTICLE_SLUG}</strong>.</p>
      `;
    }
  }
  
  readRelays.forEach(([url, conn]) => {
    conn.ws.addEventListener("message", handleMessage);
    let filter = {
      kinds: [30023],
      "#d": [ARTICLE_SLUG],
      authors: [ARTICLE_PUBKEY],
      limit: 1
    };
    conn.ws.send(JSON.stringify(["REQ", subId, filter]));
  });
}

/***************************************************
 * Render Article:
 *   Render the article content into the article container.
 ***************************************************/
function renderArticle(ev) {
  document.getElementById("article-content").innerHTML = marked.parse(ev.content);
}

/***************************************************
 * Load Author Profile:
 *   Query relays for a profile event (kind 0) from the author pubkey.
 *   Then update the #author-info element with the author's avatar and name.
 ***************************************************/
function loadAuthorProfile(authorPubkey) {
  const subId = "loadProfile-" + Math.random().toString(36).slice(2);
  let profileEvent = null;
  let readRelays = Object.entries(relayConnections).filter(
    ([url, conn]) => conn.isOpen && conn.policy.read
  );
  let eoseCount = 0;
  let eoseTarget = readRelays.length;
  
  function handleMessage(e) {
    try {
      let data = JSON.parse(e.data);
      if (!Array.isArray(data)) return;
      let [type, thisSubId, payload] = data;
      if (thisSubId !== subId) return;
      if (type === "EVENT" && payload.kind === 0) {
        profileEvent = payload;
      } else if (type === "EOSE") {
        eoseCount++;
        if (eoseCount >= eoseTarget) {
          finalizeProfile();
        }
      }
    } catch (err) {
      console.error("Error in loadAuthorProfile:", err);
    }
  }
  
  function finalizeProfile() {
    readRelays.forEach(([url, conn]) => {
      conn.ws.removeEventListener("message", handleMessage);
      conn.ws.send(JSON.stringify(["CLOSE", subId]));
    });
    if (profileEvent) {
      try {
        const profile = JSON.parse(profileEvent.content);
        updateAuthorInfo(profile);
      } catch (err) {
        console.error("Error parsing profile content:", err);
      }
    }
  }
  
  readRelays.forEach(([url, conn]) => {
    conn.ws.addEventListener("message", handleMessage);
    let filter = {
      kinds: [0],
      authors: [authorPubkey],
      limit: 1
    };
    conn.ws.send(JSON.stringify(["REQ", subId, filter]));
  });
}

/***************************************************
 * Update Author Info:
 *   Populate the #author-info element with the author's name and avatar.
 ***************************************************/
function updateAuthorInfo(profile) {
  let html = "";
  if (profile.picture) {
    html += `<img src="${profile.picture}" alt="Avatar" class="author-avatar" />`;
  }
  if (profile.name) {
    html += `<span class="author-name">${profile.name}</span>`;
  }
  document.getElementById("author-info").innerHTML = html;
}

/***************************************************
 * Replies Section:
 *   Enable login for reply and show reply editor.
 *   (Reply submission functionality is left as a placeholder.)
 ***************************************************/
document.getElementById("login-reply-btn").onclick = async function () {
  if (!window.nostr) {
    alert("NIP-07 extension not found. Please install Alby or another wallet extension.");
    return;
  }
  try {
    const pk = await window.nostr.getPublicKey();
    // Once logged in, hide the login button and show the reply editor.
    document.getElementById("login-reply-btn").classList.add("d-none");
    document.getElementById("reply-editor").classList.remove("d-none");
  } catch (err) {
    console.error("Failed to login for reply:", err);
    alert("Could not login. Check console.");
  }
};

// (Reply submission functionality would be implemented here)
