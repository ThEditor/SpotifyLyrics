/**
 * @name Spotify-Lyrics
 * @version 0.0.1
 * @description Karaoke lyrics sync from spotify
 * @author ThEditor
 *
 * @website https://theditor.xyz/
 */

 module.exports = (_ => {
	const config = {
		"info": {
			"name": "SpotifyLyrics",
			"author": "ThEditor",
			"version": "0.0.1",
			"description": "Adds a Control Panel while listening to Spotify on a connected Account"
		}
	};

	return !window.BDFDB_Global || (!window.BDFDB_Global.loaded && !window.BDFDB_Global.started) ? class {
		getName () {return config.info.name;}
		getAuthor () {return config.info.author;}
		getVersion () {return config.info.version;}
		getDescription () {return `The Library Plugin needed for ${config.info.name} is missing. Open the Plugin Settings to download it. \n\n${config.info.description}`;}
		
		downloadLibrary () {
			require("request").get("https://mwittrien.github.io/BetterDiscordAddons/Library/0BDFDB.plugin.js", (e, r, b) => {
				if (!e && b && r.statusCode == 200) require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0BDFDB.plugin.js"), b, _ => BdApi.showToast("Finished downloading BDFDB Library", {type: "success"}));
				else BdApi.alert("Error", "Could not download BDFDB Library Plugin. Try again later or download it manually from GitHub: https://mwittrien.github.io/downloader/?library");
			});
		}
		
		load () {
			if (!window.BDFDB_Global || !Array.isArray(window.BDFDB_Global.pluginQueue)) window.BDFDB_Global = Object.assign({}, window.BDFDB_Global, {pluginQueue: []});
			if (!window.BDFDB_Global.downloadModal) {
				window.BDFDB_Global.downloadModal = true;
				BdApi.showConfirmationModal("Library Missing", `The Library Plugin needed for ${config.info.name} is missing. Please click "Download Now" to install it.`, {
					confirmText: "Download Now",
					cancelText: "Cancel",
					onCancel: _ => {delete window.BDFDB_Global.downloadModal;},
					onConfirm: _ => {
						delete window.BDFDB_Global.downloadModal;
						this.downloadLibrary();
					}
				});
			}
			if (!window.BDFDB_Global.pluginQueue.includes(config.info.name)) window.BDFDB_Global.pluginQueue.push(config.info.name);
		}
		start () {this.load();}
		stop () {}
	} : (([Plugin, BDFDB]) => {
		var _this;
		var lyricscomp;
		var lastSong, stopTime;
		var playbackState = {};
		var thelyrics = "";

		var currentLyrics,
		  cleared = false,
		  oldSong = " ",
		  oldLyrics,
		  noLyricsYet = false;
		
		const repeatStates = [
			"off",
			"context",
			"track"
		];
	
		const SpotifyLyricsComponent = class SpotifyLyrics extends BdApi.React.Component {
			componentDidMount() {
				lyricscomp = this;
			}
			request(socket, device, type, data) {
				return new Promise(callback => {
					// Old Stuff
					let method = "PUT";
					switch (type) {
						case "next":
						case "previous":
							method = "POST";
							break;
						case "get":
							type = "";
							method = "GET";
							break;
						case "lyrics":
							method = "GET";
							break;
					};
					BDFDB.LibraryRequires.request({
						url: type === 'lyrics' ? 'https://api.spotify.com/v1/me/player/currently-playing' : `https://api.spotify.com/v1/me/player${type ? "/" + type : ""}${Object.entries(Object.assign({}, data)).map(n => `?${n[0]}=${n[1]}`).join("")}`,
						method: method,
						headers: {
							authorization: `Bearer ${socket.accessToken}`
						}
					}, (error, response, result) => {
						if (response && response.statusCode == 401) {
							BDFDB.LibraryModules.SpotifyUtils.getAccessToken(socket.accountId).then(promiseResult => {
								let newSocketDevice = BDFDB.LibraryModules.SpotifyTrackUtils.getActiveSocketAndDevice();
								this.request(newSocketDevice.socket, newSocketDevice.device, type, data).then(_ => {
									try {callback(JSON.parse(result));}
									catch (err) {callback({});}
								});
							});
						}
						else {
							try {callback(JSON.parse(result));}
							catch (err) {callback({});}
						}
					});
				});
			}
			render() {
				let socketDevice = BDFDB.LibraryModules.SpotifyTrackUtils.getActiveSocketAndDevice();
				if (!socketDevice) return null;
				if (this.props.song) {
					playbackState.is_playing = true;
					let fetchState = !BDFDB.equals(this.props.song, lastSong);
					lastSong = this.props.song;
					stopTime = null;
					if (fetchState) this.request(socketDevice.socket, socketDevice.device, "get").then(response => {
						playbackState = Object.assign({}, response);
						BDFDB.ReactUtils.forceUpdate(this);
					});
				}
				else if (!stopTime && lastSong) {
					playbackState.is_playing = false;
					stopTime = new Date();
				}
				if (!lastSong) return null;
				this.request(socketDevice.socket, socketDevice.device, "lyrics").then(response => {
					try {
						let requestResult = response;
						let songNameFormated = requestResult.item.name;
						let artistNameFormated =
						  requestResult.item.album.artists[0].name;
						let artistNameAndSongFormated = encodeURIComponent(
						  `${artistNameFormated} ${songNameFormated}`
						);
						let url = `https://api.textyl.co/api/lyrics?q=${artistNameAndSongFormated}`;
						let currentTimeInSong, currentPositionLyrics;
	
						// Get the lyrics of the song currently playing (Is called only at the start of the song)
						if (requestResult.item.id != oldSong) {
							thelyrics = "chabhe";
	
						  BDFDB.LibraryRequires.request(
							{
							  url: url,
							  method: "GET",
							  headers: {
								"content-type": "application/json",
							  },
							},
							(error, response, lyrics) => {
							  if (response.statusCode == 200) {
								currentLyrics = JSON.parse(lyrics);
								console.log(currentLyrics)
							  } else {
								thelyrics = "";
								BDFDB.ReactUtils.forceUpdate(this);
								currentLyrics = {};
							  }
							}
						  );
	
						  oldSong = requestResult.item.id;
						  noLyricsYet = false;
						}
	
						//GET THE CURRENT POSITION IN THE SONG
						currentTimeInSong = (
						  requestResult.progress_ms / 1000
						).toFixed();
	
						// Syncronize the song with the lyrics
						for (
						  let checkSeconds = 0;
						  checkSeconds < currentLyrics.length;
						  checkSeconds++
						) {
						  if (
							currentLyrics[checkSeconds].seconds <= currentTimeInSong
						  ) {
							currentPositionLyrics = checkSeconds;
						  }
						}
	
						//CHANGES THE STATUS TO THE CURRENT LYRICS
						let newLyrics = currentLyrics[currentPositionLyrics].lyrics;
						if (newLyrics != oldLyrics) {
						  oldLyrics = newLyrics;
						  thelyrics = newLyrics;
						  BDFDB.ReactUtils.forceUpdate(this);
						}
					  } catch (error) {
						//NO LYRICS AT THIS POINT IN THE SONG
						if (!noLyricsYet) {
						  noLyricsYet = true;
						  console.log(error);
						  thelyrics = "";
						  BDFDB.ReactUtils.forceUpdate(this);
						}
					  }
				});
				return BDFDB.ReactUtils.createElement("div", {
					className: BDFDB.DOMUtils.formatClassName(BDFDB.disCN._spotifylyricscontainer, this.props.maximized && BDFDB.disCN._spotifylyricscontainermaximized, this.props.timeline && BDFDB.disCN._spotifylyricscontainerwithtimeline),
					children: [
						BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextElement, {
							className: BDFDB.disCN._spotifycontrolssong,
							children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextScroller, {
								children: thelyrics
							})
						}),
					]
				});
			}
		};
	
		return class SpotifyLyrics extends Plugin {
			onLoad () {
				_this = this;
				
				this.defaults = {
					general: {
						addBy: 			{value: true,		description: "Adds the Word 'by' infront of the Author Name"},
						addTimeline: 		{value: true,		description: "Shows the Song Timeline in the Controls"},
						addActivityButton: 	{value: true,		description: "Shows the Activity Status Toggle Button in the Controls"},
						doubleBack: 		{value: true,		description: "Requires the User to press the Back Button twice to go to previous Track"}
					},
					buttons: {
						share: 				{value: {small: false, big: true},		icons: [""],						description: "Share"},
						shuffle: 			{value: {small: false, big: true},		icons: [""],						description: "Shuffle"},
						previous: 			{value: {small: true, big: true},		icons: [""],						description: "Previous"},
						pauseplay: 			{value: {small: true, big: true},		icons: ["", ""],					description: "Pause/Play"},
						next: 				{value: {small: true, big: true},		icons: [""],						description: "Next"},
						repeat: 			{value: {small: false, big: true},		icons: ["", ""],					description: "Repeat"},
						volume: 			{value: {small: false, big: true},		icons: ["", "", "", ""],		description: "Volume"}
					}
				};
				
				this.patchedModules = {
					before: {
						AnalyticsContext: "render"
					}
				};
				
				this.css = `
					:root {
						--SC-spotify-green: ${BDFDB.DiscordConstants.Colors.SPOTIFY};
					}
					${BDFDB.dotCN.channelpanels} {
						display: flex;
						flex-direction: column;
					}
				`;
			}
			
			onStart () {
				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.SpotifyTrackUtils, "getActivity", {after: e => {
					if (e.methodArguments[0] !== false) {
						if (e.returnValue && e.returnValue.name == "Spotify") this.updatePlayer(e.returnValue);
						else if (!e.returnValue) this.updatePlayer(null);
					}
				}});

				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.SpotifyTrackUtils, "wasAutoPaused", {instead: e => {
					return false;
				}});

				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.SpotifyUtils, "pause", {instead: e => {
					return false;
				}});
				
				BDFDB.PatchUtils.forceAllUpdates(this);
			}
			
			onStop () {
				BDFDB.PatchUtils.forceAllUpdates(this);
			}

			processAnalyticsContext (e) {
				if (e.instance.props.section == BDFDB.DiscordConstants.AnalyticsSections.ACCOUNT_PANEL) e.instance.props.children = [
					BDFDB.ReactUtils.createElement(SpotifyLyricsComponent, {
						key: "SPOTIFY_LYRICS",
						song: BDFDB.LibraryModules.SpotifyTrackUtils.getActivity(false),
						maximized: BDFDB.DataUtils.load(this, "playerState", "maximized"),
						buttonStates: [],
						timeline: this.settings.general.addTimeline,
						activityToggle: this.settings.general.addActivityButton
					}, true),
					[e.instance.props.children].flat(10).filter(n => !n || n.key != "SPOTIFY_LYRICS")
				].flat(10);
			}
			
			updatePlayer (song) {
				if (lyricscomp) {
					lyricscomp.props.song = song;
					BDFDB.ReactUtils.forceUpdate(lyricscomp);
				}
			}
		};
	})(window.BDFDB_Global.PluginUtils.buildPlugin(config));
})();