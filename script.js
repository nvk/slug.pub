/***************************************************************
 * Global Config
 ***************************************************************/
const RELAYS = [
  "wss://relay.primal.net",
  "wss://relay.damus.io",
  "wss://relay.snort.social"
];

// Hardcoded example article
const ARTICLE_PUBKEY = "e88a691e98d9987c964521dff60025f60700378a4879180dcbbb4a5027850411";
const ARTICLE_SLUG = "An-opinionated-guide-to-Sauna-4ts6ca";

/***************************************************************
 * WebSocket Connection
 ***************************************************************/
let relayConnections = {};
let articleFound = false;

/**
 * Connect to relays and request the article.
 */
function loadArticle() {
  console.log("🔹 Connecting to relays and fetching article...");
  
  RELAYS.forEach(relayUrl => {
    let ws = new WebSocket(relayUrl);
    
    ws.onopen = () => {
      console.log("✅ Connected to relay:", relayUrl);
      relayConnections[relayUrl] = ws;

      // Request article event
      const request = [
        "REQ", "article-subscription",
        {
          kinds: [30023],
          authors: [ARTICLE_PUBKEY],
          "#d": [ARTICLE_SLUG],
          limit: 1
        }
      ];
      console.log(`📡 Sending request to ${relayUrl}:`, JSON.stringify(request));
      ws.send(JSON.stringify(request));
    };

    ws.onmessage = (event) => {
      let data = JSON.parse(event.data);
      if (data[0] === "EVENT") {
        console.log("✅ Received event from", relayUrl, ":", data);
        renderArticle(data[2]);
        articleFound = true;

        // Close connections after receiving the article
        Object.values(relayConnections).forEach(conn => conn.close());
      }
    };

    ws.onerror = (err) => {
      console.error(`❌ Relay error on ${relayUrl}:`, err);
    };

    ws.onclose = () => {
      console.log(`🔻 Disconnected from relay: ${relayUrl}`);
    };
  });

  // Display message if no article found after 5 seconds
  setTimeout(() => {
    if (!articleFound) {
      document.getElementById("article-title").innerText = "⚠️ Article Not Found";
      document.getElementById("article-subtitle").innerText = "This article could not be retrieved from the relays.";
    }
  }, 5000);
}

/***************************************************************
 * Render the Article
 ***************************************************************/
function renderArticle(event) {
  console.log("🎨 Rendering article:", event);

  const content = event.content || "No content available.";
  const tags = event.tags || [];
  let bannerUrl = "";
  let subtitle = "";

  // Extract banner from tags
  const bannerTag = tags.find(tag => tag[0] === "image");
  if (bannerTag) {
    bannerUrl = bannerTag[1];
  }

  // Extract subtitle from tags or first content paragraph
  const subtitleTag = tags.find(tag => tag[0] === "summary");
  if (subtitleTag) {
    subtitle = subtitleTag[1];
  } else {
    subtitle = extractFirstParagraph(content);
  }

  // Update UI
  document.getElementById("article-title").innerText = extractTitle(content);
  document.getElementById("article-subtitle").innerText = subtitle;
  document.getElementById("article-content").innerHTML = marked.parse(content);

  // Show banner if available
  if (bannerUrl) {
    let bannerElement = document.getElementById("article-banner");
    bannerElement.src = bannerUrl;
    bannerElement.style.display = "block";
  }

  // Fetch author details
  loadAuthorProfile(event.pubkey);
}

/***************************************************************
 * Extract Metadata Helpers
 ***************************************************************/

/**
 * Extract title from Markdown.
 */
function extractTitle(markdown) {
  const titleMatch = markdown.match(/^# (.+)$/m);
  return titleMatch ? titleMatch[1] : "Untitled Article";
}

/**
 * Extract the first paragraph for use as a subtitle.
 */
function extractFirstParagraph(markdown) {
  const paragraphs = markdown.split("\n").filter(line => line.trim() !== "" && !line.startsWith("#"));
  return paragraphs.length > 0 ? paragraphs[0].trim() : "No subtitle available.";
}

/***************************************************************
 * Load Author Profile
 ***************************************************************/
function loadAuthorProfile(pubkey) {
  console.log(`📡 Fetching author profile for ${pubkey}...`);

  RELAYS.forEach(relayUrl => {
    let ws = new WebSocket(relayUrl);

    ws.onopen = () => {
      console.log(`✅ Requesting profile from ${relayUrl}`);
      const request = ["REQ", "profile-sub", { kinds: [0], authors: [pubkey], limit: 1 }];
      ws.send(JSON.stringify(request));
    };

    ws.onmessage = (event) => {
      let data = JSON.parse(event.data);
      if (data[0] === "EVENT") {
        console.log("📝 Author profile loaded:", data[2]);

        const profile = JSON.parse(data[2].content);
        document.getElementById("author-name").innerText = profile.display_name || "Unknown Author";
        if (profile.picture) {
          document.getElementById("author-avatar").src = profile.picture;
        }
      }
    };

    ws.onerror = (err) => {
      console.error(`❌ Profile fetch error from ${relayUrl}:`, err);
    };
  });
}

/***************************************************************
 * Auto Load on Page Load
 ***************************************************************/
document.addEventListener("DOMContentLoaded", function() {
  loadArticle();
});
