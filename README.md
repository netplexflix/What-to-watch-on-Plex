<p align="center">
<img width="345" height="73" alt="Image" src="https://github.com/user-attachments/assets/492385e6-9002-4148-b05e-ec77f85e5d3b" /><br>
   <a href="https://github.com/netplexflix/What-to-watch-on-Plex/releases"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/netplexflix/What-to-watch-on-Plex?style=plastic"></a>
   <a href="https://hub.docker.com/repository/docker/netplexflix/wtwp"><img alt="Docker Pulls" src="https://img.shields.io/docker/pulls/netplexflix/wtwp?style=plastic"></a>
   <a href="https://discord.gg/VBNUJd7tx3"><img alt="Discord" src="https://img.shields.io/discord/1329439972796928041?style=plastic&label=Discord"></a>
</p> 

Decide what to watch on your Plex server by swiping cards based on your group's preferences.<br>
Find a Movie or TV Show everyone wants to watch.<br> 
Self hosted with Docker. Available on the Unraid Community Apps store.

<p align="center">
<img src="https://github.com/user-attachments/assets/cf67e242-ca3e-47c9-9096-7cc71061ae4b" width="20%"><br>
<img src="https://github.com/user-attachments/assets/47c7585e-f46f-4edd-9c60-90753c50eefc" width="15%"></img> <img src="https://github.com/user-attachments/assets/4a5cebce-64b2-486f-a345-612aeb1d82db" width="15%"></img> <img src="https://github.com/user-attachments/assets/ce7a1c07-e648-48d2-87c8-f029b277e799" width="15%"></img> <img src="https://github.com/user-attachments/assets/c819dae4-eb40-4266-9d3b-e8cfa97ba542" width="15%"></img><br>
<img src="https://github.com/user-attachments/assets/21d1bff0-0645-47e7-898b-104e29150703" width="15%"></img> <img src="https://github.com/user-attachments/assets/3fcda72a-d2aa-4fb6-9557-fbc798fd23c9" width="15%"></img> <img src="https://github.com/user-attachments/assets/f92988c8-82d8-4a4e-b85d-d406c6cbd328" width="15%"></img> <img src="https://github.com/user-attachments/assets/e36d1b22-381d-48a0-927f-5d78075c53d7" width="15%"></img><br>
<img src="https://github.com/user-attachments/assets/ba47b6c4-f5ac-4c3c-a24b-549be4d2c7ff" width="15%"></img> <img src="https://github.com/user-attachments/assets/e44b0cd9-aa89-46a1-ac52-4f45feeb6288" width="15%"></img> <img src="https://github.com/user-attachments/assets/7795d06d-57e2-40a1-a366-4f4be14fa4d2" width="15%"></img> <img src="https://github.com/user-attachments/assets/04631cc9-1a16-483c-a7cd-1d9542a29e68" width="15%"></img>
</p> 

---

Main Features:

- Modern and user friendly UI.
- Quickly create or join a lobby as `guest`, or `log in with Plex` to filter out already watched items and integrate `Watchlist`.
- Easy lobby joining via invite link or `QR code`.
- Swipe with one or more friends.
- Choose which libraries from your Plex server to include. Supports both `Movies` and `TV Shows`.
- Optionally filter suggestions by `Collections`.<br> Want to decide on which Christmas movie to watch? Select your Christmas collection and start a session!
- Optionally start a session from your `watchlist` items.
- Include or Exclude items based on `Labels`.
- Users optionally set preferences for `Genre`, `Era`, `Duration`, `Language` and `Minimum Rating` to narrow down the suggestions. Tap once to prefer, twice to exclude.
- Flip cards over for details, Swipe left for Nope and right for Yes.
- Optionally watch `Trailers` streamed straight from your Plex server.
- Use your own `custom logo` on the landing page.
- Admin panel for Settings and a `Session History` tab.
- Choose between `Random` or `Fixed` suggestion order.
- Four Session Modes:
  - `Classic`: Swipe until you have a match liked by everyone.
  - `Timed`: Swipe for chosen amount of time and vote for the best matches. Includes a tie breaker.
  - `Match Target`: Swipe until chosen amount of matches are made and vote on them. Includes a tie breaker.
  - `Timed + Target`: Set both a duration and a match target. The session ends whichever happens first, then everyone votes on the collected matches. Includes a tie breaker.
- Optionally limit who can create sessions: `Plex users only` and/or a `session password`.
- Installable as PWA 

---

### Prerequisites
- Docker and Docker Compose installed.
- A running Plex server.
- Suggested: Set up a reverse proxy for easy external access. (Make sure Websocket Support is enabled)

---

### Quick Start
1. Download the `docker-compose.yml` file from this repository. Edit the port, timezone and `CORS_ORIGINS` as needed.
> [!NOTE]
>`CORS_ORIGINS` determines the allowed origins for accessing WTW<br>
>Add a comma-separated list of the allowed origins, e.g.:<br>
>e.g.: `- CORS_ORIGINS=http://192.168.1.100:PORT,https://wtw.yourdomain.com`

2. Pull the latest image:
```bash
docker compose pull
```

3. Start the container:
```bash
docker compose up -d
```

---

### UNRAID
_What to Watch on Plex_ is available on the Unraid Community Apps store as _wtwp_.<br>
Click install and apply the default template.<br>
<img width="359" height="122" alt="Image" src="https://github.com/user-attachments/assets/b546fdfb-e6c0-49f3-a1ea-2022687ceb17" />

Make sure to add a `CORS_ORIGINS` environment variable.

---

## Configuration
### Plex Connection

1. Access the app at `http://localhost:3000`. (or whichever port you mapped)
2. Open the Admin Panel and set your Admin password.
3. Enter your Plex `http://IP:PORT` and [Plex Token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/)
4. Select your libraries ==> click on `Save Settings` ==> click on `Refresh Cache` and wait for the cache to be completed.

### Allowed Domains
If you access this app through a custom domain or reverse proxy (e.g. wtw.mydomain.com), add it here.
Only requests from allowed domains will be accepted.
Equivalent to the `CORS_ORIGINS` environment variable, but managed at runtime without restarting the container. Setting either one is enough.

### Optional Settings

- **Auto Refresh:** Automatically refresh your cache at 3AM.
- **Custom Logo:** Upload your custom logo to be used on the landing page.
- **Selection Limits:** Choose how many `Preferences` and `Exclusions` users can set.
> [!NOTE]
> `Preferences` are seen just that. If user1 sets preference for `comedy` and user2 sets preference for `action` then the app will first try to find items with both genres, and otherwise suggests a mix of both.<br>
> `Exclusions` are seen as hard limits. If a user marks `horror` in red, then no horror will be suggested at all.
- **Question Stages:** Enable or disable the questions individually. A disabled question is treated as if everyone answered "I don't mind", so it simply doesn't narrow the suggestions. Disabling all of them skips the questionnaire entirely and takes users straight from the lobby to swiping.
- **Minimum Rating question:** When enabled, users pick a minimum rating (`6+` to `8.5+`) after the language question. It is compared against the rating source chosen in `Rating Display` (in `Both` mode an item passes if either rating qualifies). Unrated items are not removed.
- **Suggestion Order:**
  - `Random` (suggestions appear randomly for each user).
  - `Fixed` (everyone gets the same suggestions in the same order).
- **Hard Filter Preferences:** When enabled, preferred selections (green) strictly filter results. When disabled, preferences boost item priority but non-matching items may still appear.
- **Collections:** Enable a collection picker for the host when creating a session. Only items from selected collections will be suggested.
- **Open in Plex Button:** Enables a button on the match winner page to open the item in Plex. Only works by opening Plex in a browser tab.
- **Lobby QR Code:** Display a QR code in the lobby for easy session joining.
- **Rating Display:** Choose whether detail cards show `Critic Rating`, `Audience Rating` or `both`. The same choice decides which rating the `Minimum Rating` question compares against.
- **Trailers:** Add a `Watch Trailer` button to cards. Trailers are streamed from your Plex server. Three modes:
  - `Off` (default): no trailer button.
  - `On`: trailer button on detail cards
  - `Voting only`: trailer button appears **only** on the voting cards at the end of `Timed`, `Match Target` and `Timed + Target` sessions — so swiping stays fast, but everyone can watch the trailers of the matched items before casting their final vote.
> [!TIP]
> Missing trailers for certain items? Take a look at [MTDP](https://github.com/netplexflix/Missing-Trailer-Downloader-For-Plex) (Missing Trailer Downloader for Plex)
- **Label Restrictions:** Include or Exclude items based on Plex labels.
- **Require Plex Server Access:** Only allow users who log in with Plex and have access to your Plex server to use the app at all. Guests are blocked from creating *and* joining.
- **Session Creation:** Limit who can *start* a session. Joining an existing session is unaffected. Two independent restrictions:
  - `Plex users only`: only users signed in with Plex oAuth who have access to your server can create a session.
  - `Password protected`: users need a password to create a session. This password is set here and is **separate from the admin panel password**.
> [!NOTE]
> Both restrictions can be enabled at the same time, in which case a user needs to satisfy **both** to create a session.<br>
> Enabling `Password protected` without setting a password leaves creation open, so you can't lock yourself out.
- **PWA Customization:** Customize the PWA name and icon.

---

## 🤝 Swiparr
WTWP was inspired by [This post/Tweet](https://www.reddit.com/r/PleX/comments/ir9pi5/someone_should_totally_make_this_for_plex/).<br> Before starting development, I searched for existing options and came across [Swiparr](https://github.com/m3sserstudi0s/swiparr) which already existed. <br> Swiparr at that point however did not support Plex so WTWP was created. 
The current version of Swiparr meanwhile *does* support Plex as well, but not all features are available in both apps. Here are the most important differences listed, so you can decide which is right for you:

| (Optional) Feature | WTWP | Swiparr |
|---|:---:|:---:|
| Multi-media-server support | ❌<br><sub>(Plex only)</sub> | ✅<br><sub>(Jellyfin/Emby/Plex/TMDB)</sub> |
| TV show support | ✅ | ❌ |
| Timed / Match-Target / Timed+Target session modes + tie-breaker | ✅ | ❌ |
| Trailer playback | ✅ | ❌ |
| Plex oAuth login guard | ✅ | ❌ |
| User Watched-items auto-exclusion | ✅ | ❌ |
| Group preference questionnaire filters (genre/era/runtime/language/minimum rating) | ✅ | ❌ |
| Plex Label filters | ✅ | ❌ |
| Streaming-availability ("where to watch") filter | ❌ | ✅ |
| Sort by Trending / Popular | ❌ | ✅ |
| Customizable (logo + PWA name and icon) | ✅ | ❌ |
| Suggest from Watchlist and/or Collections | ✅ | ❌ |
| Suggest items not owned in library | ❌ | ✅ |
| Serverless deployment | ❌<br><sub>(self hosted only)</sub> | ✅<br><sub>(swiparr.com)</sub> |

<sub>Feature sets evolve on both sides — please open an issue if anything here is out of date.</sub>

---

## 🩺 Troubleshooting Common Issues:

### ❌ Clients keep waiting on other users/other users are stuck on previous screen:
When you refresh the page, you'll most likely advance. This means your connection doesn't have websocket support.<br>
If you are behind a reverse proxy, you need to enable websocket support. [Nginx Example](https://github.com/user-attachments/assets/211b5cd8-f380-48db-b177-557541feea49)

### ❌ I can't start a session/ "No Media Found":
You first need to build a cache in settings. See step 4 above. Don't forget to click 'Save Settings' after connecting to Plex before refreshing cache.

### ❌ I get a blank page when accessing the webUI:
You need to add your hostname/ip to `CORS_ORIGINS` in the docker compose.

---  

### ⚠️ **Do you Need Help or have Feedback?**
- Join the [Discord](https://discord.gg/VBNUJd7tx3).
 
### ❤️ Support the Project
If you like this project, please ⭐ star the repository and share it with the community!

<br/>

[!["Buy Me A Coffee"](https://github.com/user-attachments/assets/5c30b977-2d31-4266-830e-b8c993996ce7)](https://www.buymeacoffee.com/neekokeen)