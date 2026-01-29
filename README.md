<p align="center">
<img width="345" height="73" alt="Image" src="https://github.com/user-attachments/assets/492385e6-9002-4148-b05e-ec77f85e5d3b" /><br>
   <a href="https://github.com/netplexflix/What-to-watch-on-Plex/releases"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/netplexflix/What-to-watch-on-Plex?style=plastic"></a>
   <a href="https://hub.docker.com/repository/docker/netplexflix/wtwp"><img alt="Docker Pulls" src="https://img.shields.io/docker/pulls/netplexflix/wtwp?style=plastic"></a>
   <a href="https://discord.gg/VBNUJd7tx3"><img alt="Discord" src="https://img.shields.io/discord/1329439972796928041?style=plastic&label=Discord"></a>
</p> 

Decide what to watch on your Plex server by swiping cards based on your group's preferences.<br>
Find a Movie or TV Show everyone wants to watch.<br> 
Self hosted with Docker.

<p align="center">
<img src="https://github.com/user-attachments/assets/cf67e242-ca3e-47c9-9096-7cc71061ae4b" width="20%"><br>
<img src="https://github.com/user-attachments/assets/47c7585e-f46f-4edd-9c60-90753c50eefc" width="15%"></img> <img src="https://github.com/user-attachments/assets/7a487ae2-910f-4c3b-baab-fb9136cad996" width="15%"></img> <img src="https://github.com/user-attachments/assets/ce7a1c07-e648-48d2-87c8-f029b277e799" width="15%"></img> <img src="https://github.com/user-attachments/assets/c819dae4-eb40-4266-9d3b-e8cfa97ba542" width="15%"></img><br>
<img src="https://github.com/user-attachments/assets/21d1bff0-0645-47e7-898b-104e29150703" width="15%"></img> <img src="https://github.com/user-attachments/assets/3fcda72a-d2aa-4fb6-9557-fbc798fd23c9" width="15%"></img> <img src="https://github.com/user-attachments/assets/f92988c8-82d8-4a4e-b85d-d406c6cbd328" width="15%"></img> <img src="https://github.com/user-attachments/assets/e36d1b22-381d-48a0-927f-5d78075c53d7" width="15%"></img><br>
<img src="https://github.com/user-attachments/assets/f040d520-1b7f-43b7-8bde-b31d3fc833a1" width="15%"></img> <img src="https://github.com/user-attachments/assets/e44b0cd9-aa89-46a1-ac52-4f45feeb6288" width="15%"></img> <img src="https://github.com/user-attachments/assets/7795d06d-57e2-40a1-a366-4f4be14fa4d2" width="15%"></img> <img src="https://github.com/user-attachments/assets/04631cc9-1a16-483c-a7cd-1d9542a29e68" width="15%"></img>
</p> 

Main Features:

- Modern and user friendly UI.
- Quickly create or join a lobby as `guest`, or `log in with Plex` to filter out already watched items.
- Swipe with one or more friends.
- Choose which libraries from your Plex server to include. Supports both `Movies` and `TV Shows`.
- Optionally filter suggestions by `Collections`.<br> Want to decide on which Christmas movie to watch? Select your Christmas collection and start a session!
- Users set preferences for `Genre`, `Era` and `Language` to narrow down the suggestions. Tap once to prefer, twice to exclude.
- Flip cards over for details, Swipe left for Nope and right for Yes.
- Use your own `custom logo` on the landing page.
- Admin panel for Settings and a `Session History` tab.
- Choose between `Random` or `Fixed` suggestion order.
- `Classic` or `Timed` swipe sessions:
  - `Classic`: Swipe until you have a match liked by everyone.
  - `Timed`: Swipe for chosen amount of time and vote for the best matches. Includes a tie breaker animation.

### Prerequisites
- Docker and Docker Compose installed.
- A running Plex server.
- Suggested: Set up a reverse proxy for easy external access.

### Quick Start
1. Download the `docker-compose.yml` file from this repository. Edit the port and timezone if needed
2. Pull the latest image:
```bash
docker compose pull
```

3. Start the container:
```bash
docker compose up -d
```

## Configuration
### Plex Connection

1. Access the app at `http://localhost:3000`. (or whichever port you mapped)
2. Open the Admin Panel and set your Admin password.
3. Enter your Plex `http://IP:PORT` and [Plex Token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/)
4. Select your libraries ==> click on `Save Settings` ==> click on `Refresh Cache` and wait for the cache to be completed.

### Optional Settings

- **Auto Refresh:** Automatically refresh your cache at 3AM.
- **Custom Logo:** Upload your custom logo to be used on the landing page.
- **Selection Limits:** Choose how many `Preferences` and `Exclusions` users can set.
> [!NOTE]
> `Preferences` are seen just that. If user1 sets preference for `comedy` and user2 sets preference for `action` then the app will first try to find items with both genres, and otherwise suggests a mix of both.<br>
> `Exclusions` are seen as hard limits. If a user marks `horror` in red, then no horror will be suggested at all.
- **Suggestion Order:**
  - `Random` (suggestions appear randomly for each user).
  - `Fixed` (everyone gets the same suggestions in the same order).
- **Collections:** Enable a collection picker for the host when creating a session. Only items from selected collections will be suggested.

### ⚠️ **Do you Need Help or have Feedback?**
- Join the [Discord](https://discord.gg/VBNUJd7tx3).
 
---  
### ❤️ Support the Project
If you like this project, please ⭐ star the repository and share it with the community!

<br/>

[!["Buy Me A Coffee"](https://github.com/user-attachments/assets/5c30b977-2d31-4266-830e-b8c993996ce7)](https://www.buymeacoffee.com/neekokeen)